// Lo mecánico de la skill redactar, para que el modelo no gaste en ello:
//   okt redactar preparar "<nota>"    palabras, hablantes, marcas de tiempo, perfil sugerido y tramos para leer por partes
//   okt redactar indice "<nota>"      arma el índice de una nota con temas, desde sus encabezados
//   okt redactar verificar "<nota>"   compara la nota con su original en Bruto: cifras, URL, nombres e índice
// Los hallazgos son avisos que el modelo revisa: el script no juzga el sentido.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { sobrescribir, RAIZ_PLUGIN, posix } from './rutas.mjs';
import { listarNotas } from './vault.mjs';
import { encontrarNota } from './organizar.mjs';
import { R } from './estructura.mjs';

const TAM_TRAMO = 1500; // palabras: lo que cabe en un tema (ver perfil-clase.md)
const LARGA = 800; // palabras: desde aquí, un texto sin origen claro ya no parece una idea suelta
const RE_TIEMPO = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
const TIEMPO = String.raw`[[(]?\d{1,2}:\d{2}(?::\d{2})?[\])]?`;
// «Ana: hola», «**Ana:** hola», «[00:12] Ana: hola», «Ana (00:12): hola», «Speaker 1 00:12» (solo en su línea).
const RE_HABLANTE = new RegExp(String.raw`^\s*(?:${TIEMPO}\s*[-–—]?\s*)?(?:\*\*)?(\p{Lu}[\p{L}.'-]*(?: (?:\p{Lu}[\p{L}.'-]*|\d{1,3}(?![\d:]))){0,3})(?:\*\*)?(?:\s*${TIEMPO}\s*$|(?:\s*${TIEMPO})?\s*:(?:\*\*)?(?:\s|$))`, 'u');
const ORDENAR = new Set(['web', 'notion', 'drive', 'notebooklm', 'sesion']);

const contarPalabras = (t) => (String(t).match(/\S+/g) || []).length;
// Una transcripción bajada de otra app suele venir en CRLF: «.» y «$» no verían los encabezados ni los hablantes.
const unirSaltos = (t) => t.replace(/\r\n/g, '\n');
const leerNotaLf = (vault, rel) => leerFrontmatter(unirSaltos(readFileSync(join(vault, rel), 'utf8')));
const sinMarcas = (t) => t.replace(/^<!-- okt:(inicio|fin) -->[ \t]*$/gm, '').replace(/^Importado de .* el \d{4}-\d{2}-\d{2}\..*$/gm, '').trim();

export function analizar(cuerpo) {
  cuerpo = unirSaltos(cuerpo);
  const veces = new Map();
  for (const linea of cuerpo.split('\n')) {
    if (/^\s*#/.test(linea)) continue;
    const m = linea.match(RE_HABLANTE);
    if (m) veces.set(m[1], (veces.get(m[1]) || 0) + 1);
  }
  // Una etiqueta que sale una sola vez («Nota: …») no es alguien que habla.
  const hablantes = [...veces].filter(([, n]) => n >= 2).map(([h]) => h);
  return { palabras: contarPalabras(cuerpo), hablantes: hablantes.length >= 2 ? hablantes : [], tiempos: (cuerpo.match(RE_TIEMPO) || []).length };
}

// Perfil de la skill redactar. dudoso: el agente pregunta en una línea en lugar de asumir.
export function sugerirPerfil(nombre, datos, an) {
  // Lo que dice el origen pesa más que el parecido del texto: una web con etiquetas repetidas no es una reunión.
  if (datos.origen === 'youtube' || nombre.startsWith('▶️')) return { perfil: 'clase', dudoso: false };
  if (ORDENAR.has(datos.origen)) return { perfil: 'ordenar', dudoso: false };
  const escritaPorEl = datos.origen === 'nota' || datos.origen === 'telegram';
  // En su propia nota, dos etiquetas repetidas («Problema:», «Solución:») se parecen a dos hablantes.
  if (an.hablantes.length) return { perfil: 'reunion', dudoso: escritaPorEl };
  if (/reuni[oó]n|meeting|minuta/i.test(nombre)) return { perfil: 'reunion', dudoso: false };
  if (escritaPorEl && an.tiempos < 5) return { perfil: 'propia', dudoso: false };
  // Una transcripción sin hablantes puede ser una clase o una reunión: el archivo no lo dice.
  if (an.tiempos >= 5 || an.palabras >= LARGA) return { perfil: 'clase', dudoso: true };
  return { perfil: 'propia', dudoso: false };
}

// Corta en tramos de ~TAM_TRAMO palabras por líneas, luego por oraciones y, en una transcripción sin puntuación, por palabras.
export function partirEnTramos(texto, tam = TAM_TRAMO) {
  const unidades = [];
  for (const linea of texto.split('\n')) {
    if (contarPalabras(linea) <= tam) { unidades.push(linea); continue; }
    for (const oracion of linea.split(/(?<=[.?!…])\s+/)) {
      if (contarPalabras(oracion) <= tam) { unidades.push(oracion); continue; }
      const palabras = oracion.split(/\s+/);
      for (let i = 0; i < palabras.length; i += tam) unidades.push(palabras.slice(i, i + tam).join(' '));
    }
  }
  const tramos = [];
  let actual = [];
  let cuenta = 0;
  for (const u of unidades) {
    const n = contarPalabras(u);
    if (cuenta && cuenta + n > tam) {
      tramos.push(actual.join('\n').trim());
      actual = [];
      cuenta = 0;
    }
    actual.push(u);
    cuenta += n;
  }
  if (cuenta) tramos.push(actual.join('\n').trim());
  return tramos;
}

export const NOMBRE_PERFIL = { clase: 'clase o video', reunion: 'reunión', propia: 'nota propia', ordenar: 'solo ordenar (documento importado)' };

// Rutas absolutas: el plugin tiene dos carpetas references/ y un agente buscó el perfil en la que no era.
function lecturas(perfil) {
  const dir = posix(join(RAIZ_PLUGIN, 'skills', 'redactar', 'references'));
  return [`${dir}/reglas-redaccion.md`, ...(perfil === 'ordenar' ? [] : [`${dir}/perfil-${perfil}.md`])];
}

export function preparar(vault, ref) {
  const rel = encontrarNota(vault, ref);
  const nombre = basename(rel, '.md');
  const { datos, cuerpo } = leerNotaLf(vault, rel);
  const texto = sinMarcas(cuerpo);
  const an = analizar(texto);
  const { perfil, dudoso } = sugerirPerfil(nombre, datos, an);
  const dir = '.cerebro/cache/tramos';
  rmSync(join(vault, dir), { recursive: true, force: true });
  const partes = an.palabras > TAM_TRAMO ? partirEnTramos(texto) : [];
  if (partes.length) {
    mkdirSync(join(vault, dir), { recursive: true });
    partes.forEach((t, i) => writeFileSync(join(vault, dir, `${String(i + 1).padStart(2, '0')}.md`), `${t}\n`));
  }
  const lineas = [
    `Nota: ${rel}`,
    `Palabras: ${an.palabras}`,
    `Hablantes: ${an.hablantes.join(', ') || 'no identificados'}`,
    `Marcas de tiempo: ${an.tiempos}`,
    `Perfil sugerido: ${NOMBRE_PERFIL[perfil]}${dudoso ? ' (dudoso: pregunta en una línea si es una clase o una reunión)' : ''}`,
    partes.length ? `Tramos: ${partes.length} en ${dir}/ (léelos en orden, 01.md, 02.md…, en lugar de la nota completa)` : 'Tramos: no hacen falta (lee la nota)',
    `Lee antes de escribir: ${lecturas(perfil).join(' y ')}`,
  ];
  return { texto: lineas.join('\n'), datos: { nota: rel, ...an, perfil, dudoso, tramos: partes.length, carpeta_tramos: partes.length ? dir : null, leer: lecturas(perfil) } };
}

// ---------- índice ----------

const RE_TEMA = /^##\s+\S*\s*Tema \d+\b.*$/u;
const RE_SUBTEMA = /^###\s+\d+\.\d+\..*$/u;
const titulo = (l) => l.replace(/^#+\s+/, '').trim();

// Arma el índice desde los encabezados, justo antes del primer tema: así nunca se desvía del desarrollo.
export function insertarIndice(cuerpo) {
  const sinIndice = cuerpo.replace(/^## 📑 Índice[ \t]*\n[\s\S]*?(?=^## )/m, '');
  const lineas = sinIndice.split('\n');
  const entradas = lineas.filter((l) => RE_TEMA.test(l) || RE_SUBTEMA.test(l));
  if (!entradas.some((l) => RE_TEMA.test(l))) return null;
  const lista = entradas.map((l) => `${RE_TEMA.test(l) ? '' : '  '}- [[#${titulo(l)}]]`).join('\n');
  const i = lineas.findIndex((l) => RE_TEMA.test(l));
  lineas.splice(i, 0, '## 📑 Índice', '', lista, '');
  return lineas.join('\n');
}

export function indice(vault, ref) {
  const rel = encontrarNota(vault, ref);
  const { datos, cuerpo } = leerNotaLf(vault, rel);
  const nuevo = insertarIndice(cuerpo);
  if (nuevo === null) throw Object.assign(new Error(`«${basename(rel, '.md')}» no tiene temas («## <emoji> Tema 1 - Nombre»).`), { codigo: 3 });
  sobrescribir(join(vault, rel), escribirFrontmatter(datos, nuevo));
  return { texto: `Índice actualizado en ${rel}.`, datos: { nota: rel } };
}

// ---------- verificar ----------

const RE_URL = /https?:\/\/[^\s)\]>"'`]+/g;
const normalizarUrl = (u) => u.replace(/[.,;]+$/, '').replace(/([?&])t=\d+s?(&|$)/, (_, a, b) => (b ? a : '')).replace(/[?&]$/, '');
const SECCIONES_FUERA = /^(?:(?:📑 )?Índice|(?:🔗 )?Conexiones|(?:🔗 )?Relacionado|(?:⚖️ )?Contradicciones)$/u;

// Quita lo que el perfil agrega y no sale del original: secciones de enlaces, el índice, la numeración y el título.
// conEncabezados: un dato del original puede quedar en un subtítulo, así que cuenta para no darlo por perdido.
function soloContenido(texto, { conEncabezados = false } = {}) {
  const salida = [];
  let fuera = false;
  for (const linea of sinMarcas(texto).split('\n')) {
    const h = linea.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (h[1].length <= 2) fuera = SECCIONES_FUERA.test(h[2].trim());
      if (conEncabezados && !fuera) salida.push(h[2].replace(/^\S*\s*Tema \d+\s*-\s*/u, '').replace(/^\d+(?:\.\d+)*\.\s*/, ''));
      continue;
    }
    if (fuera || /^>\s*\[!info\]/.test(linea)) continue;
    salida.push(linea.replace(/\(\d+(?:\.\d+)+\)/g, '').replace(/^\s*\*\*\d+(?:\.\d+)*\.[^*]*\*\*\s*$/, '').replace(/^\s*\d+\.\s+/, '').replace(/^\s*- \[[ x]\]\s*/, '- '));
  }
  return salida.join('\n').replace(/!?\[\[[^\]]*\]\]/g, '').replace(/\^\[[^\]]*\]/g, '');
}

function urls(t) {
  return new Set((t.match(RE_URL) || []).map(normalizarUrl));
}

function cifras(t) {
  const limpio = t.replace(RE_URL, ' ').replace(RE_TIEMPO, ' ');
  return new Set((limpio.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(',', '.')));
}

const DE_PLANTILLA = new Set(['Hablante', 'Acuerdos', 'Tareas', 'Énfasis', 'Alerta', 'Caso', 'Dictado', 'Definición']);
const plegar = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

// Palabras con mayúscula que no están en el original: casi siempre un nombre agregado o corregido.
function nombresNuevos(nota, original) {
  const base = new Set((plegar(original).match(/\p{L}+/gu) || []));
  const vistos = new Set();
  const limpio = nota.replace(RE_URL, ' ').replace(/\[![a-z]+\]/g, ' ');
  // (?!\p{L}): «PayDirect» es una sola palabra; sin esto se partiría en «Pay».
  for (const m of limpio.matchAll(/(?<=[\p{L}\d,;)»"'—] )\p{Lu}\p{Ll}{2,}(?!\p{L})/gu)) vistos.add(m[0]);
  for (const m of limpio.matchAll(/^\s*(?:[-*>]\s+)*(?:\*\*)?(\p{Lu}\p{Ll}{2,})(?:\*\*)?\s*(?::|\*\*:)/gmu)) vistos.add(m[1]);
  return [...vistos].filter((n) => !base.has(plegar(n)) && !DE_PLANTILLA.has(n));
}

// Encabezados como los enlaza Obsidian: [[#Nombre]] y los que quedaron sin contenido debajo.
function revisarEncabezados(cuerpo) {
  const lineas = cuerpo.split('\n');
  const heads = [];
  lineas.forEach((l, i) => {
    const m = l.match(/^(#{2,6})\s+(.*\S)\s*$/);
    if (m) heads.push({ nivel: m[1].length, texto: m[2], i });
  });
  const seccion = heads.find((h) => /Índice$/.test(h.texto));
  const destinos = [];
  if (seccion) {
    const fin = heads.find((h) => h.i > seccion.i && h.nivel <= seccion.nivel)?.i ?? lineas.length;
    for (const l of lineas.slice(seccion.i, fin)) for (const m of l.matchAll(/\[\[#([^\]|]+)/g)) destinos.push(m[1].trim());
  }
  const nombres = new Set(heads.map((h) => h.texto));
  const sinDesarrollar = destinos.filter((d) => !nombres.has(d));
  const fueraDelIndice = seccion ? heads.filter((h) => h !== seccion && /^(.*Tema \d+|\d+(\.\d+)*\.)/u.test(h.texto) && !destinos.includes(h.texto)).map((h) => h.texto) : [];
  const vacios = heads
    .filter((h, n) => h !== seccion)
    .filter((h) => {
      const sig = heads.find((o) => o.i > h.i);
      // Un tema puede abrir directamente su primer subtema; vacío es no tener ni texto ni subnivel.
      if (sig && sig.nivel > h.nivel) return false;
      return !lineas.slice(h.i + 1, sig?.i ?? lineas.length).some((l) => l.trim());
    })
    .map((h) => h.texto);
  return { sinDesarrollar, fueraDelIndice, vacios };
}

export function verificar(vault, ref) {
  const rel = encontrarNota(vault, ref);
  const nombre = basename(rel, '.md');
  const { datos, cuerpo } = leerNotaLf(vault, rel);
  const enlaces = [].concat(datos.bruto || []).map((b) => String(b).replace(/^\[\[|\]\]$/g, '')).filter(Boolean);
  if (!enlaces.length) throw Object.assign(new Error(`«${nombre}» no tiene original en Bruto (propiedad «bruto»): corre antes okt bruto guardar.`), { codigo: 3 });
  const enBruto = listarNotas(vault).filter((r) => r.startsWith(`${R.bruto}/`));
  const originales = enlaces.map((e) => enBruto.find((r) => basename(r, '.md') === e)).filter(Boolean);
  if (!originales.length) throw Object.assign(new Error(`No encontré en Bruto: ${enlaces.join(', ')}.`), { codigo: 3 });
  const original = soloContenido(originales.map((r) => leerNotaLf(vault, r).cuerpo).join('\n'), { conEncabezados: true });
  const nota = soloContenido(cuerpo);
  // Traducida, casi todo lo que lleva mayúscula es nuevo: el aviso no diría nada.
  const traducida = datos.idioma && !/^es\b/i.test(String(datos.idioma));

  const c0 = cifras(original);
  const c1 = cifras(nota);
  const c1ConTitulos = cifras(soloContenido(cuerpo, { conEncabezados: true }));
  const u0 = urls(original);
  const u1 = urls(nota);
  const encab = revisarEncabezados(cuerpo);
  const hallazgos = {
    cifras_agregadas: [...c1].filter((x) => !c0.has(x)),
    cifras_perdidas: [...c0].filter((x) => !c1ConTitulos.has(x)),
    urls_agregadas: [...u1].filter((x) => !u0.has(x)),
    urls_perdidas: [...u0].filter((x) => !u1.has(x)),
    nombres_nuevos: traducida ? [] : nombresNuevos(nota, original),
    indice_sin_desarrollar: encab.sinDesarrollar,
    temas_fuera_del_indice: encab.fueraDelIndice,
    encabezados_vacios: encab.vacios,
  };
  const p0 = contarPalabras(original);
  const p1 = contarPalabras(nota);
  const proporcion = p0 ? Math.round((p1 / p0) * 100) : 100;
  // Quitar muletillas recorta; quedarse en menos de la mitad suele ser resumir.
  const posibleResumen = p0 >= 300 && proporcion < 45;
  const ETIQUETAS = {
    cifras_agregadas: 'Cifras que el original no trae',
    cifras_perdidas: 'Cifras del original que ya no están',
    urls_agregadas: 'URL que el original no trae',
    urls_perdidas: 'URL del original que ya no están',
    nombres_nuevos: 'Nombres con mayúscula que el original no trae',
    indice_sin_desarrollar: 'Entradas del índice sin encabezado igual',
    temas_fuera_del_indice: 'Temas que no están en el índice',
    encabezados_vacios: 'Encabezados sin contenido',
  };
  const lineas = Object.entries(hallazgos).filter(([, v]) => v.length).map(([k, v]) => `- ${ETIQUETAS[k]}: ${v.join(', ')}`);
  if (posibleResumen) lineas.push(`- Quedó en el ${proporcion} % de las palabras del original: revisa que no sea un resumen.`);
  const texto = `Verificación de ${rel} contra ${originales.join(', ')}\nPalabras: ${p0} → ${p1} (${proporcion} %)\n${lineas.length ? `Avisos (revísalos en el original; algunos pueden estar bien):\n${lineas.join('\n')}` : 'Sin avisos.'}`;
  return { texto, datos: { nota: rel, originales, palabras_original: p0, palabras_nota: p1, proporcion, posible_resumen: posibleResumen, ...hallazgos } };
}
