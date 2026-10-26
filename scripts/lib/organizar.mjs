// Organizar el vault por áreas, proyectos y temas, y pasar lo que llega en bruto a notas procesadas:
//   okt tema nuevo "<área o proyecto>/<tema>[/<tema>]"   crea la carpeta del tema con su nota principal
//   okt mover "<nota o tema>" "<carpeta>"                 mueve una nota o un tema entero (los enlaces no cambian)
//   okt procesar "<captura>" --a "<carpeta>" --titulo …  la captura pasa a ser la nota (sin copia en bruto)
//   okt procesar "<captura>" --en "A,B"                  su contenido ya está en A y B: el original va a Bruto
//   okt bruto guardar "<nota>"                           copia el original a Bruto antes de reescribirla
//   okt bruto limpiar [--dias 90] [--aplicar]            borra los originales viejos (solo con --aplicar)
// Nada se borra sin --aplicar, y los originales en bruto quedan enlazados desde la propiedad «bruto».
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { listarNotas, leerNota, mismasNotas, esSistema } from './vault.mjs';
import { sobrescribir, posix } from './rutas.mjs';
import { C, R, conEmoji, ubicar } from './estructura.mjs';
import { limpiarNombre, sinEmoji, nombreValido } from './nombres.mjs';
import { fechaISO, diasEntre } from './fechas.mjs';
import { carpetaDeDestino, wiki } from './notas.mjs';
import { textoPrincipal } from './init.mjs';
import { actualizarRegistros } from './migrar.mjs';

const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });
const lista = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim().replace(/^\[\[|\]\]$/g, '')).filter(Boolean) : []);

// Una nota por su nombre exacto, su ruta, su nombre sin emoji o, si solo una lo contiene, parte de su nombre
// («troponina sube» → «📲 2026-10-21 1805 troponina sube»). Lo archivado no cuenta. Falla si no hay ninguna o hay
// varias.
export function encontrarNota(vault, ref, { dentro } = {}) {
  const pedida = String(ref || '').replace(/^\[\[|\]\]$/g, '').replace(/\.md$/i, '').replace(/\\/g, '/');
  if (!pedida) throw errorUso('Falta la nota.');
  const notas = listarNotas(vault).filter((r) => (dentro ? r.startsWith(`${dentro}/`) : !r.startsWith(`${C.archivo}/`)));
  const base = sinEmoji(pedida.split('/').pop()).toLowerCase();
  let c = notas.filter((r) => r.slice(0, -3) === pedida || basename(r, '.md').toLowerCase() === pedida.toLowerCase());
  if (!c.length) c = notas.filter((r) => sinEmoji(basename(r, '.md')).toLowerCase() === base);
  if (!c.length && base.length >= 3) c = notas.filter((r) => sinEmoji(basename(r, '.md')).toLowerCase().includes(base));
  if (!c.length) throw errorUso(`No encontré la nota «${pedida}»${dentro ? ` en ${dentro}` : ''}. Búscala con okt buscar.`);
  if (c.length > 1) throw errorUso(`Hay varias notas con ese nombre:\n${c.map((x) => `- ${x}`).join('\n')}\nUsa el nombre exacto, con su emoji, o la ruta.`);
  return c[0];
}

const esPrincipal = (rel) => basename(dirname(rel)) === basename(rel, '.md');

// ---------- okt tema nuevo ----------

export function temaNuevo(vault, ruta, op = {}) {
  const partes = String(ruta || '').replace(/\\/g, '/').split('/').map((s) => s.trim()).filter(Boolean);
  if (partes.length < 2) throw errorUso('Uso: okt tema nuevo "<área o proyecto>/<tema>" (p. ej. "Medicina/🫀 Cardiología" o "Medicina/Cardiología/💔 Síndrome coronario agudo")');
  const nombre = conEmoji('tema', limpiarNombre(partes.pop()));
  if (!sinEmoji(nombre) || !nombreValido(nombre)) throw errorUso(`Nombre de tema no válido: «${nombre}».`);
  const padre = carpetaDeDestino(vault, partes.join('/'), { propia: true });
  const dir = `${padre}/${nombre}`;
  if (existsSync(join(vault, dir))) return { texto: `Ya existía: ${dir}`, datos: { ruta: `${dir}/${nombre}.md`, creada: false } };

  // «Nota que crece»: si en la carpeta padre ya hay una nota con ese nombre, pasa a ser la nota principal del tema. La
  // nota principal de la propia carpeta padre no cuenta: «Medicina/Medicina» no convierte el área en tema.
  const crece = listarNotas(vault).find((r) => dirname(r) === padre && !esPrincipal(r) && sinEmoji(basename(r, '.md')).toLowerCase() === sinEmoji(nombre).toLowerCase());
  const otras = mismasNotas(vault, nombre).filter((r) => r !== crece);
  if (otras.length) throw errorUso(`Ya existe una nota llamada «${sinEmoji(nombre)}»: ${otras[0]}. Elige otro nombre para el tema.`, 3);
  mkdirSync(join(vault, dir), { recursive: true });
  if (crece) {
    const viejo = basename(crece, '.md');
    const destino = `${dir}/${viejo}.md`;
    const carpetaFinal = `${padre}/${viejo}`;
    renameSync(join(vault, crece), join(vault, destino));
    // La carpeta toma el nombre exacto de la nota (con su emoji), para que siga siendo su nota principal.
    if (carpetaFinal !== dir) renameSync(join(vault, dir), join(vault, carpetaFinal));
    const final = `${carpetaFinal}/${viejo}.md`;
    const { datos, cuerpo } = leerFrontmatter(readFileSync(join(vault, final), 'utf8'));
    sobrescribir(join(vault, final), escribirFrontmatter({ ...datos, tipo: 'tema', actualizado: fechaISO() }, cuerpo));
    actualizarRegistros(vault, { [crece]: final }, {}, new Map());
    return { texto: `«${viejo}» pasa a ser un tema: ${final}. Mueve ahí sus notas con okt mover.`, datos: { ruta: final, creada: true, crecio: true } };
  }
  const rel = `${dir}/${nombre}.md`;
  writeFileSync(join(vault, rel), textoPrincipal('tema', nombre, { resumen: op.resumen }));
  return { texto: `Tema creado: ${rel}`, datos: { ruta: rel, creada: true } };
}

// ---------- okt mover ----------

export function mover(vault, ref, destinoPedido) {
  if (!ref || !destinoPedido) throw errorUso('Uso: okt mover "<nota o tema>" "<carpeta de destino>"');
  const rel = encontrarNota(vault, ref);
  if (esSistema(rel)) throw errorUso('Los archivos del sistema no se mueven.');
  const { datos } = leerFrontmatter(readFileSync(join(vault, rel), 'utf8'));
  // La nota principal de un tema se mueve con su carpeta; un área o un proyecto no se mueve dentro de otro.
  const conCarpeta = esPrincipal(rel) && ubicar(rel).niveles > 0;
  if (esPrincipal(rel) && !conCarpeta) throw errorUso('Las áreas y los proyectos no se mueven dentro de otra carpeta. Para terminar un proyecto: okt archivar.');
  const origen = conCarpeta ? dirname(rel) : rel;
  const carpeta = carpetaDeDestino(vault, destinoPedido, { propia: conCarpeta });
  if (conCarpeta) {
    if (carpeta === origen || carpeta.startsWith(`${origen}/`)) throw errorUso('Un tema no se mueve dentro de sí mismo.');
  }
  const destino = `${carpeta}/${basename(origen)}`;
  if (destino === origen) return { texto: 'Ya está en esa carpeta.', datos: { de: origen, a: destino } };
  if (existsSync(join(vault, destino))) throw errorUso(`Ya existe ${destino}.`, 3);
  mkdirSync(join(vault, carpeta), { recursive: true });
  renameSync(join(vault, origen), join(vault, destino));
  actualizarRegistros(vault, conCarpeta ? {} : { [origen]: destino }, conCarpeta ? { [origen]: destino } : {}, new Map());
  return { texto: `Movido${datos.tipo === 'tema' ? ' el tema' : ''}: ${origen} → ${destino}. Los enlaces siguen funcionando (Obsidian enlaza por nombre).`, datos: { de: origen, a: destino } };
}

// ---------- originales en bruto ----------

// Mueve (o copia) un original a «04 │ 🗄️ Archivo/📥 Bruto/AAAA-MM/📥 <nombre>.md» y anota en él a qué notas pasó.
function aBruto(vault, rel, en, { copiar = false } = {}) {
  const hoy = fechaISO();
  const dir = `${R.bruto}/${hoy.slice(0, 7)}`;
  mkdirSync(join(vault, dir), { recursive: true });
  // El nombre es único en todo Bruto, no solo en el mes: la propiedad «bruto» y okt bruto limpiar enlazan por nombre.
  const base = conEmoji('bruto', basename(rel, '.md'));
  const usados = new Set(listarNotas(vault).filter((r) => r.startsWith(`${R.bruto}/`)).map((r) => basename(r, '.md').toLowerCase()));
  let nombre = base;
  for (let i = 2; usados.has(nombre.toLowerCase()) || existsSync(join(vault, dir, `${nombre}.md`)); i++) nombre = `${base} ${i}`;
  const destino = `${dir}/${nombre}.md`;
  const { datos, cuerpo } = leerFrontmatter(readFileSync(join(vault, rel), 'utf8'));
  const marcado = escribirFrontmatter({ ...datos, tipo: datos.tipo === 'captura' ? 'captura' : datos.tipo || 'captura', procesado: hoy, en: en.map(wiki) }, cuerpo);
  if (copiar) writeFileSync(join(vault, destino), marcado);
  else {
    renameSync(join(vault, rel), join(vault, destino));
    sobrescribir(join(vault, destino), marcado);
  }
  return { ruta: destino, nombre };
}

// Agrega el enlace al original en la propiedad «bruto» (lista) de una nota.
function enlazarBruto(vault, rel, nombreBruto) {
  const abs = join(vault, rel);
  const { datos, cuerpo } = leerFrontmatter(readFileSync(abs, 'utf8'));
  const previos = [].concat(datos.bruto || []).filter(Boolean);
  if (previos.includes(wiki(nombreBruto))) return;
  sobrescribir(abs, escribirFrontmatter({ ...datos, bruto: [...previos, wiki(nombreBruto)] }, cuerpo));
}

// ---------- okt procesar ----------

// Campos de una captura que no pasan a una nota procesada (son de su origen o de la ficha de sesión).
const SOLO_CAPTURA = new Set(['origen', 'agente', 'proyecto', 'ruta', 'rama', 'pedidos', 'chat_id', 'cuaderno', 'id_externo', 'importado']);

export function procesar(vault, ref, op = {}) {
  if (!ref) throw errorUso('Uso: okt procesar "<captura>" --a "<carpeta>" --titulo "<emoji> <título>" [--tipo nota|fuente|articulo] [--resumen …]  |  okt procesar "<captura>" --en "<nota A>,<nota B>"');
  const rel = encontrarNota(vault, ref, { dentro: C.bandeja });
  const base = basename(rel, '.md');

  // 1. Su contenido ya se escribió en otras notas (fusionada o dividida): el original va a Bruto.
  const en = lista(op.en);
  if (en.length) {
    const destinos = en.map((n) => encontrarNota(vault, n));
    const b = aBruto(vault, rel, destinos.map((d) => basename(d, '.md')));
    for (const d of destinos) enlazarBruto(vault, d, b.nombre);
    actualizarRegistros(vault, { [rel]: b.ruta }, {}, new Map());
    return { texto: `Procesada: el contenido de «${base}» quedó en ${destinos.map((d) => `[[${basename(d, '.md')}]]`).join(', ')}. Original en ${b.ruta} (propiedad «bruto» de cada nota).`, datos: { original: b.ruta, en: destinos } };
  }

  // 2. La captura pasa a ser la nota: se mueve, se le pone título y el frontmatter de su tipo. No queda copia.
  if (!op.a) throw errorUso('Falta --a "<carpeta>": el área, el proyecto o el tema donde va (o --en si su contenido ya está en otras notas).');
  const tipo = op.tipo === 'articulo' ? 'articulo' : op.tipo === 'fuente' ? 'fuente' : 'nota';
  if (!op.titulo || op.titulo === true) throw errorUso(`Falta --titulo: el nombre de la nota${tipo === 'nota' ? ', con un emoji temático al inicio («🫀 Infarto agudo de miocardio»)' : ''}.`);
  const carpeta = carpetaDeDestino(vault, op.a);
  const titulo = conEmoji(tipo, limpiarNombre(op.titulo));
  if (!sinEmoji(titulo) || !nombreValido(titulo)) throw errorUso(`Título no válido: «${op.titulo}».`);
  const otras = mismasNotas(vault, titulo).filter((r) => r !== rel);
  if (otras.length) throw errorUso(`Ya existe una nota llamada «${sinEmoji(titulo)}»: ${otras[0]}. Agrega ahí el contenido y usa okt procesar "${base}" --en "${basename(otras[0], '.md')}".`, 3);

  const { datos, cuerpo } = leerFrontmatter(readFileSync(join(vault, rel), 'utf8'));
  const hoy = fechaISO();
  const conservar = Object.fromEntries(Object.entries(datos).filter(([k]) => !['tipo', 'creado', 'actualizado', 'estado', 'resumen', 'aliases', 'bruto'].includes(k) && (tipo !== 'nota' || !SOLO_CAPTURA.has(k))));
  const nuevos = {
    tipo: tipo === 'articulo' ? 'fuente' : tipo,
    creado: datos.creado || hoy,
    actualizado: hoy,
    estado: 'borrador',
    resumen: op.resumen && op.resumen !== true ? String(op.resumen) : datos.resumen || '',
    aliases: [sinEmoji(titulo)],
    ...conservar,
    ...(lista(op.fuentes).length ? { fuentes: lista(op.fuentes).map(wiki) } : {}),
    ...(datos.bruto ? { bruto: datos.bruto } : {}),
  };
  // El título # pasa a ser el nuevo; si no tenía, se agrega.
  const cuerpoNuevo = /^# .+$/m.test(cuerpo) ? cuerpo.replace(/^# .+$/m, `# ${titulo}`) : `\n# ${titulo}\n\n${cuerpo.replace(/^\s+/, '')}`;
  const destino = `${carpeta}/${titulo}.md`;
  if (existsSync(join(vault, destino))) throw errorUso(`Ya existe ${destino}.`, 3);
  renameSync(join(vault, rel), join(vault, destino));
  sobrescribir(join(vault, destino), escribirFrontmatter(nuevos, cuerpoNuevo));
  actualizarRegistros(vault, { [rel]: destino }, {}, new Map());
  return { texto: `Procesada: ${rel} → ${destino}. Ordénala (encabezados, listas) sin cambiar sus frases, completa el resumen y enlázala con 2 o más notas.`, datos: { de: rel, a: destino } };
}

// ---------- okt bruto ----------

export function brutoGuardar(vault, ref) {
  const rel = encontrarNota(vault, ref);
  if (rel.startsWith(`${C.archivo}/`) || esSistema(rel)) throw errorUso('Esa nota no se reescribe: está en el Archivo o es del sistema.');
  const b = aBruto(vault, rel, [basename(rel, '.md')], { copiar: true });
  enlazarBruto(vault, rel, b.nombre);
  return { texto: `Original guardado en ${b.ruta}. Ya puedes reescribir «${basename(rel, '.md')}»: la propiedad «bruto» enlaza al original.`, datos: { original: b.ruta, nota: rel } };
}

export function brutoLimpiar(vault, op = {}) {
  const dias = Number(op.dias) || 90;
  const viejos = listarNotas(vault)
    .filter((r) => r.startsWith(`${R.bruto}/`))
    .map((r) => leerNota(vault, r))
    .filter((n) => {
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(n.datos.procesado || '') ? n.datos.procesado : fechaISO(statSync(join(vault, n.rel)).mtime);
      return diasEntre(fecha) > dias;
    });
  if (!viejos.length) return { texto: `No hay originales en bruto de más de ${dias} días.`, datos: { borrados: [] } };
  if (!op.aplicar) {
    return { texto: `${viejos.length} originales en bruto de más de ${dias} días:\n${viejos.map((n) => `- ${n.rel}`).join('\n')}\nSe borran solo con un sí del usuario: okt bruto limpiar --dias ${dias} --aplicar (git conserva una copia).`, datos: { viejos: viejos.map((n) => n.rel) } };
  }
  const nombres = new Set(viejos.map((n) => wiki(n.nombre)));
  for (const n of viejos) rmSync(join(vault, n.rel), { force: true });
  // Las notas que los enlazaban dejan de hacerlo (si no, quedarían enlaces rotos).
  for (const rel of listarNotas(vault)) {
    const abs = join(vault, rel);
    const { datos, cuerpo, tiene } = leerFrontmatter(readFileSync(abs, 'utf8'));
    if (!tiene || !datos.bruto) continue;
    const quedan = [].concat(datos.bruto).filter((b) => !nombres.has(b));
    if (quedan.length === [].concat(datos.bruto).length) continue;
    const { bruto, ...resto } = datos;
    sobrescribir(abs, escribirFrontmatter(quedan.length ? { ...resto, bruto: quedan } : resto, cuerpo));
  }
  return { texto: `Borrados ${viejos.length} originales en bruto (siguen en el historial de git).`, datos: { borrados: viejos.map((n) => posix(n.rel)) } };
}

