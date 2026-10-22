// Estructura del vault: carpetas, archivos del sistema y emoji de cada tipo de nota. Es la única fuente de
// las rutas; ningún otro módulo escribe «00 │ 📥 Bandeja» a mano. El separador es U+2502 («│»): la barra «|»
// está prohibida en los nombres de Windows y en Obsidian separa el alias de un enlace.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { esVault, leerConfigVault } from './rutas.mjs';
import { emojiInicial, empiezaConEmoji, sinEmoji } from './nombres.mjs';

export const VERSION_ESTRUCTURA = 2;

export const C = {
  bandeja: '00 │ 📥 Bandeja',
  proyectos: '10 │ 🎯 Proyectos',
  areas: '20 │ 🧭 Areas',
  conocimiento: '30 │ 🧠 Conocimiento',
  fuentes: '40 │ 📚 Fuentes',
  diario: '50 │ 📅 Diario',
  archivo: '90 │ 🗄️ Archivo',
  sistema: '99 │ ⚙️ Sistema',
};

export const R = {
  notas: `${C.bandeja}/📝 notas`,
  sesiones: `${C.bandeja}/💻 sesiones`,
  importados: `${C.bandeja}/📦 importados`,
  telegram: `${C.bandeja}/📲 telegram`,
  conceptos: `${C.conocimiento}/💡 conceptos`,
  entidades: `${C.conocimiento}/🏷️ entidades`,
  sintesis: `${C.conocimiento}/🧩 sintesis`,
  adjuntos: `${C.fuentes}/📎 adjuntos`,
  plantillas: `${C.sistema}/🧱 plantillas`,
  hot: `${C.sistema}/🔥 hot.md`,
  bitacora: `${C.sistema}/📜 bitacora.md`,
  pendientes: `${C.sistema}/✅ pendientes.md`,
  indice: `${C.sistema}/🗂️ indice.md`,
};

// Subcarpetas de adjuntos por origen.
export const ADJUNTOS = {
  pdf: '📕 pdf',
  imagenes: '🖼️ imagenes',
  audio: '🎧 audio',
  video: '🎬 video',
  documentos: '📃 documentos',
  notion: '🗒️ notion',
  drive: '☁️ drive',
  telegram: '📲 telegram',
  notebooklm: '🤖 notebooklm',
  otros: '📁 otros',
};

export const carpetaAdjuntos = (origen) => `${R.adjuntos}/${ADJUNTOS[origen] || (empiezaConEmoji(origen) ? origen : `📁 ${origen}`)}`;

export const CARPETAS = [R.notas, R.sesiones, R.importados, R.telegram, C.proyectos, C.areas, R.conceptos, R.entidades, R.sintesis, R.adjuntos, C.diario, C.archivo, R.plantillas];

// Emoji fijo de cada tipo (y de cada origen de lo importado).
export const EMOJI = {
  concepto: '💡',
  entidad: '🏷️',
  sintesis: '🧩',
  proyecto: '🎯',
  area: '🧭',
  fuente: '📄',
  articulo: '🔬',
  diario: '📅',
  semanal: '🗓️',
  nota: '📝',
  sesion: '💻',
  telegram: '📲',
  notion: '🗒️',
  drive: '☁️',
  notebooklm: '🤖',
  sistema: '⚙️',
};

// En estos tipos el emoji lo elige la IA según el tema; si no viene ninguno, va el del tipo.
export const TEMATICOS = new Set(['concepto', 'entidad', 'sintesis', 'proyecto', 'area']);

// «🩸 Anemia» → igual (temático); «Anemia» → «💡 Anemia»; en los tipos fijos el emoji siempre es el del tipo.
export function conEmoji(tipo, titulo) {
  const base = sinEmoji(titulo);
  if (!base) return titulo;
  if (TEMATICOS.has(tipo) && empiezaConEmoji(titulo)) return `${emojiInicial(titulo)} ${base}`;
  return EMOJI[tipo] ? `${EMOJI[tipo]} ${base}` : base;
}

// ---------- nota diaria ----------

// Formatos del nombre de la nota diaria (okt config poner formato_diario). «/» no puede ir en un nombre de archivo
// (Obsidian crearía carpetas 22/10/26), así que «DD/MM/YY» se escribe con la barra de división ∕ (U+2215).
const dos = (n) => String(n).padStart(2, '0');
export const FORMATOS_DIARIO = {
  'AAAA-MM-DD': { titulo: (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, obsidian: `[${EMOJI.diario}] YYYY-MM-DD` },
  'DD/MM/YY': { titulo: (d) => `${dos(d.getDate())}∕${dos(d.getMonth() + 1)}∕${dos(d.getFullYear() % 100)}`, obsidian: `[${EMOJI.diario}] DD∕MM∕YY` },
};

export function formatoDiario(vault) {
  const f = vault ? leerConfigVault(vault).formato_diario : null;
  return FORMATOS_DIARIO[f] ? f : 'AAAA-MM-DD';
}

export const tituloDiario = (vault, fecha) => FORMATOS_DIARIO[formatoDiario(vault)].titulo(fecha);

// ---------- estructura anterior (0.2.x) ----------

const SISTEMA_ANTIGUO = { 'hot.md': R.hot, 'bitacora.md': R.bitacora, 'pendientes.md': R.pendientes, 'indice.md': R.indice };

// Carpetas antiguas → nuevas, de la más específica a la más general.
export const ANTIGUAS = [
  ['00-Bandeja/notas', R.notas],
  ['00-Bandeja/sesiones', R.sesiones],
  ['00-Bandeja/importados', R.importados],
  ['00-Bandeja/telegram', R.telegram],
  ['00-Bandeja', C.bandeja],
  ['10-Proyectos', C.proyectos],
  ['20-Areas', C.areas],
  ['30-Conocimiento/conceptos', R.conceptos],
  ['30-Conocimiento/entidades', R.entidades],
  ['30-Conocimiento/sintesis', R.sintesis],
  ['30-Conocimiento', C.conocimiento],
  ...Object.entries(ADJUNTOS).map(([k, v]) => [`40-Fuentes/adjuntos/${k}`, `${R.adjuntos}/${v}`]),
  ['40-Fuentes/adjuntos', R.adjuntos],
  ['40-Fuentes', C.fuentes],
  ['50-Diario', C.diario],
  ['90-Archivo', C.archivo],
  ['99-Sistema/plantillas', R.plantillas],
  ['99-Sistema', C.sistema],
];

// Ruta antigua → nueva (solo carpetas y los cuatro archivos del sistema; los nombres de nota no cambian aquí).
// 90-Archivo conserva la ruta relativa de lo archivado, que también se traduce.
export function traducir(rel) {
  const r = String(rel).replace(/\\/g, '/').replace(/\/$/, '');
  if (r.startsWith('99-Sistema/') && SISTEMA_ANTIGUO[r.slice(11)]) return SISTEMA_ANTIGUO[r.slice(11)];
  if (r.startsWith('90-Archivo/')) return `${C.archivo}/${traducir(r.slice(11))}`;
  for (const [antigua, nueva] of ANTIGUAS) {
    if (r === antigua) return nueva;
    if (r.startsWith(`${antigua}/`)) return nueva + r.slice(antigua.length);
  }
  return r;
}

export const esEstructuraAntigua = (rel) => ANTIGUAS.some(([a]) => rel === a || rel.startsWith(`${a}/`));

export function necesitaMigrar(vault) {
  return Boolean(vault) && esVault(vault) && (Number(leerConfigVault(vault).version) || 1) < VERSION_ESTRUCTURA;
}

export const AVISO_MIGRAR = 'Este vault usa la estructura anterior a OKT 0.3.0 (carpetas sin emojis). Ejecuta «okt migrar» para ver qué cambia y «okt migrar --aplicar» para migrarlo (hace commit: se puede deshacer con git).';

// --carpeta acepta la ruta nueva, la antigua («10-Proyectos/Tesis») o una corta («proyectos/Tesis»), y el
// nombre de una subcarpeta sin su emoji («proyectos/Tesis» → «10 │ 🎯 Proyectos/📝 Tesis» si existe así).
const CORTAS = { bandeja: C.bandeja, proyectos: C.proyectos, areas: C.areas, conocimiento: C.conocimiento, fuentes: C.fuentes, diario: C.diario, archivo: C.archivo, sistema: C.sistema, ...Object.fromEntries(Object.entries(R).filter(([, v]) => !v.endsWith('.md'))) };

export function resolverCarpeta(vault, rel) {
  if (!rel || rel === true) return rel;
  let r = traducir(String(rel).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
  const [primera, ...resto] = r.split('/');
  const corta = CORTAS[primera.toLowerCase()] || Object.values(C).find((c) => sinEmoji(c.replace(/^\d+ │ /, '')).toLowerCase() === sinEmoji(primera.replace(/^\d+\s*[│|-]?\s*/, '')).toLowerCase());
  if (corta) r = [corta, ...resto].join('/');
  // Cada tramo que no exista (carpeta o nota) se busca por su nombre sin emoji.
  const partes = r.split('/');
  let actual = '';
  for (let i = 0; i < partes.length; i++) {
    let p = partes[i];
    const dir = join(vault, actual);
    if (!existsSync(join(dir, p)) && existsSync(dir)) {
      const igual = readdirSync(dir).find((n) => sinEmoji(n).toLowerCase() === sinEmoji(p).toLowerCase());
      if (igual) p = igual;
    }
    actual = actual ? `${actual}/${p}` : p;
  }
  return actual;
}
