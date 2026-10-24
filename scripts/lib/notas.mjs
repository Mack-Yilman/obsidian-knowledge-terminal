// okt nota nueva <tipo> "<título>": crea la nota en su carpeta con el frontmatter y las secciones
// del contrato. El modelo solo rellena el contenido.
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { escribirFrontmatter } from './frontmatter.mjs';
import { ahora, fechaISO, semanaISO } from './fechas.mjs';
import { limpiarNombre, sinEmoji } from './nombres.mjs';
import { mismasNotas } from './vault.mjs';
import { sobrescribir } from './rutas.mjs';
import { C, conEmoji, resolverCarpeta, tituloDiario, ubicar, dentroDeLaEstructura } from './estructura.mjs';

// Tipos de la versión 2 que se aceptan como alias de nota.
export const ALIAS_TIPOS = { concepto: 'nota', entidad: 'nota', sintesis: 'nota' };

// carpeta: dónde va si no se pasa --carpeta. propia: la nota vive en una carpeta con su mismo nombre (área,
// proyecto, tema). enCarpeta: necesita --carpeta (un área, un proyecto o un tema); sin ella va a la Bandeja.
// alias: se agrega el título sin emoji, para que la búsqueda y el autocompletado de Obsidian lo encuentren.
export const TIPOS = {
  nota: { enCarpeta: true, estado: 'borrador', resumen: true, fuentes: true, alias: true, cuerpo: ['', 'Relacionado'] },
  fuente: { enCarpeta: true, estado: 'borrador', resumen: true, alias: true, cuerpo: ['TL;DR', 'Puntos clave', 'Qué aporta'] },
  articulo: { tipo: 'fuente', enCarpeta: true, estado: 'borrador', resumen: true, alias: true, cuerpo: ['TL;DR', 'Pregunta', 'Método', 'Resultados', 'Limitaciones', 'Qué aporta'] },
  tema: { enCarpeta: true, obligatoria: true, propia: true, resumen: true, alias: true, cuerpo: ['De qué trata'] },
  proyecto: { carpeta: C.proyectos, propia: true, estado: 'activo', resumen: true, alias: true, cuerpo: ['Objetivo', 'Próximos pasos', 'Decisiones'] },
  area: { carpeta: C.areas, propia: true, resumen: true, alias: true, cuerpo: ['De qué trata'] },
  diario: { carpeta: C.diario, sinActualizado: true, titulo: (vault) => tituloDiario(vault, ahora()), cuerpo: ['Tareas', 'Notas', 'Aprendí'] },
  semanal: { carpeta: C.diario, sinActualizado: true, titulo: () => semanaISO(), cuerpo: ['Qué pasó', 'Proyectos', 'Lo aprendido', 'Pendientes', 'Próxima semana'] },
  captura: { carpeta: C.bandeja, sinActualizado: true, alias: true, cuerpo: [] },
};

const lista = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
export const wiki = (n) => `[[${String(n).replace(/^\[\[|\]\]$/g, '')}]]`;
const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });

// Carpeta de destino de un tipo que vive dentro de un área, un proyecto o un tema. Comprueba que exista.
export function carpetaDeDestino(vault, pedida, { propia = false } = {}) {
  const carpeta = resolverCarpeta(vault, pedida);
  if (!dentroDeLaEstructura(carpeta)) throw errorUso(`No encontré «${pedida}» en el vault: usa un área, un proyecto o un tema que exista (p. ej. --carpeta "Medicina/Cardiología"). Míralos en 99 │ ⚙️ Sistema/🗂️ indice.md.`);
  if (!existsSync(join(vault, carpeta))) throw errorUso(`La carpeta «${carpeta}» no existe. Créala primero (okt tema nuevo "${pedida}") o elige otra.`);
  const { raiz, base } = ubicar(`${carpeta}/x.md`);
  // Solo dentro de un área o un proyecto: la Bandeja, el Diario, el Archivo y el Sistema no llevan notas ni temas aquí.
  if (!raiz) throw errorUso(`«${carpeta}» no es un área, un proyecto ni un tema. Sin --carpeta, la nota va a la Bandeja.`);
  if (!base) throw errorUso(`«${carpeta}» es la carpeta raíz: elige un área o un proyecto dentro de ella.`);
  return carpeta;
}

// «Medicina» → «🩺 Medicina» si esa área existe (el enlace necesita el nombre exacto, con su emoji).
export function nombreDeArea(vault, pedida) {
  const limpia = String(pedida).replace(/^\[\[|\]\]$/g, '');
  const dir = join(vault, C.areas);
  if (!existsSync(dir)) return limpia;
  const igual = readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && sinEmoji(e.name).toLowerCase() === sinEmoji(limpia).toLowerCase());
  return igual ? igual.name : limpia;
}

export function notaNueva(vault, tipoPedido, tituloPedido, op = {}) {
  const tipoReal = ALIAS_TIPOS[tipoPedido] || tipoPedido;
  const def = TIPOS[tipoReal];
  if (!def) throw errorUso(`Tipo desconocido: ${tipoPedido}. Tipos: ${Object.keys(TIPOS).join(', ')}`);
  const limpio = limpiarNombre(tituloPedido || (def.titulo ? def.titulo(vault) : ''));
  if (!sinEmoji(limpio)) throw errorUso('Falta el título: okt nota nueva <tipo> "<título>"');
  if (def.obligatoria && !op.carpeta) throw errorUso(`Un ${tipoReal} vive dentro de un área, un proyecto u otro tema: usa --carpeta "<área o proyecto>[/<tema>]".`);

  // Sin --carpeta, lo que va dentro de un área o un proyecto entra a la Bandeja (para ubicarlo al procesarla).
  const sinUbicar = def.enCarpeta && !op.carpeta;
  const tipoNota = sinUbicar && tipoReal === 'nota' ? 'captura' : def.tipo || tipoReal;
  const emojiTipo = tipoNota === 'captura' && op.origen ? op.origen : tipoNota === 'captura' ? 'captura' : tipoPedido === 'articulo' ? 'articulo' : tipoReal;
  const titulo = conEmoji(emojiTipo, limpio);
  let carpeta;
  if (def.enCarpeta && op.carpeta) carpeta = carpetaDeDestino(vault, op.carpeta, { propia: def.propia });
  else if (op.carpeta) carpeta = resolverCarpeta(vault, op.carpeta);
  else carpeta = sinUbicar ? C.bandeja : def.carpeta;
  if (def.propia) carpeta = `${carpeta}/${titulo}`;
  const rel = `${carpeta}/${titulo}.md`;

  // «💡 Anemia» y «🩸 Anemia» son la misma nota: se compara sin el emoji.
  const iguales = mismasNotas(vault, titulo);
  if (iguales.length) {
    if (def.titulo) return { texto: `Ya existía: ${iguales[0]}`, datos: { ruta: iguales[0], creada: false } };
    throw errorUso(`Ya existe una nota llamada «${sinEmoji(titulo)}»: ${iguales[0]}. Actualízala en vez de duplicarla, o elige otro título.`, 3);
  }

  const hoy = fechaISO();
  const datos = { tipo: tipoNota, creado: hoy };
  if (!def.sinActualizado && tipoNota !== 'captura') datos.actualizado = hoy;
  if (def.estado && tipoNota !== 'captura') datos.estado = op.estado || def.estado;
  if (def.resumen && tipoNota !== 'captura') datos.resumen = op.resumen || '';
  if (tipoNota === 'captura') datos.origen = op.origen || 'nota';
  if (def.alias && sinEmoji(titulo) !== titulo) datos.aliases = [sinEmoji(titulo)];
  if (tipoNota === 'fuente') {
    if (op.origen) datos.origen = op.origen;
    if (op.url) datos.url = op.url;
    if (op.autor) datos.autor = op.autor;
    if (op.publicado) datos.publicado = op.publicado;
    if (op['id-externo']) datos.id_externo = op['id-externo'];
    if (op.adjunto) datos.adjunto = wiki(op.adjunto);
  } else {
    // Una nota que sale del chat lleva origen: conversacion (no cuenta como evidencia).
    if (tipoNota === 'nota' && op.origen) datos.origen = op.origen;
    if (op.url) datos.url = op.url;
  }
  if (def.fuentes && lista(op.fuentes).length) datos.fuentes = lista(op.fuentes).map(wiki);
  if (tipoReal === 'proyecto' && op.area) datos.area = wiki(nombreDeArea(vault, op.area));
  if (op.tags) datos.tags = lista(op.tags);

  const cuerpo = `\n# ${titulo}\n\n${def.cuerpo.map((s) => (s ? `## ${s}\n` : '')).join('\n')}`;
  const abs = join(vault, rel);
  mkdirSync(dirname(abs), { recursive: true });
  if (existsSync(abs)) throw new Error(`Ya existe: ${rel}`);
  writeFileSync(abs, escribirFrontmatter(datos, cuerpo));
  const aviso = sinUbicar ? ' (en la Bandeja: sin --carpeta; se ubica al procesarla)' : '';
  return { texto: `Creada: ${rel}${aviso}`, datos: { ruta: rel, creada: true } };
}

// Agrega «- [ ] texto» bajo ## Tareas de la nota diaria de hoy (la crea si falta). Usa la línea
// vacía que trae la plantilla de Obsidian, o va después de la última tarea de la sección.
export function agregarTarea(vault, texto) {
  const { ruta } = notaNueva(vault, 'diario', '').datos;
  const abs = join(vault, ruta);
  const lineas = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const tarea = `- [ ] ${String(texto).replace(/\s+/g, ' ').trim()}`;
  const i = lineas.findIndex((l) => /^##\s+Tareas\s*$/.test(l));
  if (i === -1) {
    while (lineas.length && lineas.at(-1) === '') lineas.pop();
    lineas.push('', '## Tareas', '', tarea, '');
  } else {
    let fin = lineas.findIndex((l, k) => k > i && /^#{1,2}\s/.test(l));
    if (fin === -1) fin = lineas.length;
    const vacia = lineas.findIndex((l, k) => k > i && k < fin && /^- \[ \]\s*$/.test(l));
    let ultima = -1;
    for (let k = i + 1; k < fin; k++) if (/^\s*- \[.\]/.test(lineas[k])) ultima = k;
    if (vacia !== -1) lineas[vacia] = tarea;
    else if (ultima !== -1) lineas.splice(ultima + 1, 0, tarea);
    else lineas.splice(i + 1, 0, '', tarea);
  }
  sobrescribir(abs, lineas.join('\n'));
  return { texto: `Tarea agregada a ${ruta}.`, datos: { ruta } };
}
