// Estructura del vault: carpetas, archivos del sistema y emoji de cada tipo de nota. Es la única fuente de
// las rutas; ningún otro módulo escribe «00 │ 📥 Bandeja» a mano. El separador es U+2502 («│»): la barra «|»
// está prohibida en los nombres de Windows y en Obsidian separa el alias de un enlace.
//
// Versión 3 (OKT 0.4.0): el conocimiento vive dentro de cada área y cada proyecto, en carpetas de tema anidadas
// tantas veces como pida el dominio (Área → Rama → Grupo → … → nota; sin límite desde la 0.5.0). Cada área, proyecto y tema es una carpeta con una nota principal del
// mismo nombre, que lleva el índice automático de lo que contiene.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { esVault, leerConfigVault } from './rutas.mjs';
import { emojiInicial, empiezaConEmoji, sinEmoji } from './nombres.mjs';

// Versión 4 (OKT 0.7.0): las raíces se numeran de 00 a 05, y el Archivo se ordena por motivo.
export const VERSION_ESTRUCTURA = 4;

export const C = {
  bandeja: '00 │ 📥 Bandeja',
  proyectos: '01 │ 🎯 Proyectos',
  areas: '02 │ 🧭 Areas',
  diario: '03 │ 📅 Diario',
  archivo: '04 │ 🗄️ Archivo',
  sistema: '05 │ ⚙️ Sistema',
};

// Raíces de la versión 3 (0.4 a 0.6), para okt migrar.
export const C3 = {
  bandeja: '00 │ 📥 Bandeja',
  proyectos: '10 │ 🎯 Proyectos',
  areas: '20 │ 🧭 Areas',
  diario: '50 │ 📅 Diario',
  archivo: '90 │ 🗄️ Archivo',
  sistema: '99 │ ⚙️ Sistema',
};

export const R = {
  adjuntos: `${C.sistema}/📎 adjuntos`,
  plantillas: `${C.sistema}/🧱 plantillas`,
  bruto: `${C.archivo}/📥 Bruto`,
  descartes: `${C.archivo}/🗑️ Descartes`,
  terminados: `${C.archivo}/✅ Terminados`,
  inactivos: `${C.archivo}/💤 Inactivos`,
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
  web: '🌐 web',
  otros: '📁 otros',
};

export const carpetaAdjuntos = (origen) => `${R.adjuntos}/${ADJUNTOS[origen] || (empiezaConEmoji(origen) ? origen : `📁 ${origen}`)}`;

export const CARPETAS = [C.bandeja, C.proyectos, C.areas, C.diario, C.archivo, R.adjuntos, R.plantillas];

// Emoji fijo de cada tipo (y de cada origen de lo que entra a la Bandeja). concepto, entidad y sintesis son
// los tipos de la versión 2: se aceptan como alias de nota.
export const EMOJI = {
  nota: '💡',
  tema: '📂',
  proyecto: '🎯',
  area: '🧭',
  fuente: '📄',
  articulo: '🔬',
  diario: '📅',
  semanal: '🗓️',
  captura: '📝',
  sesion: '💻',
  telegram: '📲',
  notion: '🗒️',
  drive: '☁️',
  notebooklm: '🤖',
  web: '🌐',
  youtube: '▶️',
  agente: '🛠️',
  bruto: '📥',
  sistema: '⚙️',
  concepto: '💡',
  entidad: '🏷️',
  sintesis: '🧩',
};

// En estos tipos el emoji lo elige la IA según el tema; si no viene ninguno, va el del tipo.
export const TEMATICOS = new Set(['nota', 'tema', 'proyecto', 'area', 'concepto', 'entidad', 'sintesis']);

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

// ---------- jerarquía: áreas, proyectos y temas ----------

// «20 │ 🧭 Areas/🩺 Medicina/🫀 Cardiología/x.md» → { raiz: 'areas', base: '20 │ 🧭 Areas/🩺 Medicina', niveles: 1 }.
// niveles cuenta las carpetas de tema entre la del área o el proyecto y el archivo.
export function ubicar(rel) {
  const partes = String(rel).replace(/\\/g, '/').split('/');
  const raiz = partes[0] === C.areas ? 'areas' : partes[0] === C.proyectos ? 'proyectos' : null;
  // Solo las carpetas cuentan: «20 │ 🧭 Areas/x.md» está suelto en la raíz, sin área.
  const dirs = /\.[^/]+$/.test(partes.at(-1)) ? partes.slice(0, -1) : partes;
  if (!raiz || dirs.length < 2) return { raiz, base: null, niveles: 0 };
  return { raiz, base: `${dirs[0]}/${dirs[1]}`, niveles: dirs.length - 2 };
}

// Ruta de la nota principal de una carpeta: «…/🫀 Cardiología» → «…/🫀 Cardiología/🫀 Cardiología.md».
export const notaPrincipal = (carpeta) => `${carpeta}/${carpeta.split('/').pop()}.md`;

// ---------- Archivo por motivo ----------

const sinNumero = (raiz) => raiz.replace(/^\d+\s*│\s*/, '');
const MOTIVOS = { [sinNumero(C.bandeja)]: R.descartes, [sinNumero(C.proyectos)]: R.terminados, [sinNumero(C.areas)]: R.inactivos };

// Dónde va algo que se archiva, según de dónde sale: «00 │ 📥 Bandeja/x.md» → «…/🗑️ Descartes/x.md»,
// «01 │ 🎯 Proyectos/🎓 Tesis» → «…/✅ Terminados/🎓 Tesis», «02 │ 🧭 Areas/🩺 Medicina/🫀 Cardiología» →
// «…/💤 Inactivos/🩺 Medicina/🫀 Cardiología», y el resto a Inactivos con su raíz sin número
// («03 │ 📅 Diario/x.md» → «…/💤 Inactivos/📅 Diario/x.md»). Acepta raíces de cualquier versión numerada.
export function destinoArchivo(rel) {
  const [raiz, ...resto] = String(rel).replace(/\\/g, '/').split('/');
  const nombre = sinNumero(raiz);
  return MOTIVOS[nombre] ? [MOTIVOS[nombre], ...resto].join('/') : [R.inactivos, nombre, ...resto].join('/');
}

// ---------- estructuras anteriores ----------

// Versión 2 (OKT 0.3.x): conocimiento y fuentes en carpetas propias, bandeja con subcarpetas por origen.
export const C2 = {
  bandeja: C.bandeja,
  proyectos: C.proyectos,
  areas: C.areas,
  conocimiento: '30 │ 🧠 Conocimiento',
  fuentes: '40 │ 📚 Fuentes',
  diario: C.diario,
  archivo: C.archivo,
  sistema: C.sistema,
};

export const R2 = {
  notas: `${C2.bandeja}/📝 notas`,
  sesiones: `${C2.bandeja}/💻 sesiones`,
  importados: `${C2.bandeja}/📦 importados`,
  telegram: `${C2.bandeja}/📲 telegram`,
  conceptos: `${C2.conocimiento}/💡 conceptos`,
  entidades: `${C2.conocimiento}/🏷️ entidades`,
  sintesis: `${C2.conocimiento}/🧩 sintesis`,
  adjuntos: `${C2.fuentes}/📎 adjuntos`,
  plantillas: R.plantillas,
};

export const CARPETAS2 = [R2.notas, R2.sesiones, R2.importados, R2.telegram, C2.proyectos, C2.areas, R2.conceptos, R2.entidades, R2.sintesis, R2.adjuntos, C2.diario, C2.archivo, R2.plantillas];

const SISTEMA_ANTIGUO = { 'hot.md': R.hot, 'bitacora.md': R.bitacora, 'pendientes.md': R.pendientes, 'indice.md': R.indice };

// Versión 1 (OKT 0.2.x) → versión 2, de la más específica a la más general.
export const ANTIGUAS = [
  ['00-Bandeja/notas', R2.notas],
  ['00-Bandeja/sesiones', R2.sesiones],
  ['00-Bandeja/importados', R2.importados],
  ['00-Bandeja/telegram', R2.telegram],
  ['00-Bandeja', C2.bandeja],
  ['10-Proyectos', C2.proyectos],
  ['20-Areas', C2.areas],
  ['30-Conocimiento/conceptos', R2.conceptos],
  ['30-Conocimiento/entidades', R2.entidades],
  ['30-Conocimiento/sintesis', R2.sintesis],
  ['30-Conocimiento', C2.conocimiento],
  ...Object.entries(ADJUNTOS).map(([k, v]) => [`40-Fuentes/adjuntos/${k}`, `${R2.adjuntos}/${v}`]),
  ['40-Fuentes/adjuntos', R2.adjuntos],
  ['40-Fuentes', C2.fuentes],
  ['50-Diario', C2.diario],
  ['90-Archivo', C2.archivo],
  ['99-Sistema/plantillas', R2.plantillas],
  ['99-Sistema', C2.sistema],
];

// Ruta de la versión 1 → versión 2 (solo carpetas y los cuatro archivos del sistema; los nombres de nota no
// cambian aquí). 90-Archivo conserva la ruta relativa de lo archivado, que también se traduce.
export function traducir(rel) {
  const r = String(rel).replace(/\\/g, '/').replace(/\/$/, '');
  if (r.startsWith('99-Sistema/') && SISTEMA_ANTIGUO[r.slice(11)]) return SISTEMA_ANTIGUO[r.slice(11)];
  if (r.startsWith('90-Archivo/')) return `${C2.archivo}/${traducir(r.slice(11))}`;
  for (const [antigua, nueva] of ANTIGUAS) {
    if (r === antigua) return nueva;
    if (r.startsWith(`${antigua}/`)) return nueva + r.slice(antigua.length);
  }
  return r;
}

// Ruta de la versión 2 → versión 3, para lo que se traduce solo por la carpeta: las subcarpetas de la bandeja se
// aplanan y los adjuntos pasan al Sistema. Las notas de Conocimiento y Fuentes no tienen traducción por carpeta:
// okt migrar decide su destino nota por nota.
export function traducirV3(rel) {
  const r = String(rel).replace(/\\/g, '/').replace(/\/$/, '');
  if (r === R2.adjuntos || r.startsWith(`${R2.adjuntos}/`)) return R.adjuntos + r.slice(R2.adjuntos.length);
  for (const sub of [R2.notas, R2.sesiones, R2.importados, R2.telegram]) {
    if (r === sub) return C.bandeja;
    if (r.startsWith(`${sub}/`)) return `${C.bandeja}/${r.slice(sub.length + 1).split('/').pop()}`;
  }
  return r;
}

export const esEstructuraAntigua = (rel) => ANTIGUAS.some(([a]) => rel === a || rel.startsWith(`${a}/`));

export function versionDe(vault) {
  return Number(leerConfigVault(vault).version) || 1;
}

export function necesitaMigrar(vault) {
  return Boolean(vault) && esVault(vault) && versionDe(vault) < VERSION_ESTRUCTURA;
}

export const AVISO_MIGRAR = 'Este vault usa una estructura anterior a OKT 0.7.0 (carpetas raíz 10, 20, 50, 90 y 99, o una más antigua). Cierra Obsidian y ejecuta «okt migrar» para ver qué cambia y «okt migrar --aplicar» para migrarlo (hace commit: se puede deshacer con git).';

// ---------- --carpeta ----------

// --carpeta acepta la ruta completa, la de una versión anterior, un nombre corto («bandeja», «proyectos/Tesis») o
// la ruta desde un área o un proyecto sin escribir su carpeta raíz ni los emojis: «Medicina/Cardiología» →
// «20 │ 🧭 Areas/🩺 Medicina/🫀 Cardiología» si existe así.
const CORTAS = {
  bandeja: C.bandeja,
  proyectos: C.proyectos,
  areas: C.areas,
  diario: C.diario,
  archivo: C.archivo,
  sistema: C.sistema,
  adjuntos: R.adjuntos,
  plantillas: R.plantillas,
  bruto: R.bruto,
  // Nombres cortos de la 0.3 (skills de Antigravity sin reinstalar): sus carpetas ahora son la Bandeja.
  notas: C.bandeja,
  sesiones: C.bandeja,
  importados: C.bandeja,
  telegram: C.bandeja,
};

const igualSinEmoji = (a, b) => sinEmoji(a).toLowerCase() === sinEmoji(b).toLowerCase();

function hijoParecido(dir, nombre) {
  if (!existsSync(dir)) return null;
  try {
    return readdirSync(dir).find((n) => igualSinEmoji(n, nombre)) || null;
  } catch {
    return null;
  }
}

export function resolverCarpeta(vault, rel) {
  if (!rel || rel === true) return rel;
  let r = traducirV3(traducir(String(rel).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')));
  const [primera, ...resto] = r.split('/');
  const corta = CORTAS[primera.toLowerCase()] || Object.values(C).find((c) => igualSinEmoji(c.replace(/^\d+ │ /, ''), primera.replace(/^\d+\s*[│|-]?\s*/, '')));
  if (corta) r = [corta, ...resto].join('/');
  else if (!existsSync(join(vault, primera))) {
    // Sin carpeta raíz: el primer tramo es un área o un proyecto.
    const area = hijoParecido(join(vault, C.areas), primera);
    const proyecto = !area && hijoParecido(join(vault, C.proyectos), primera);
    if (area) r = [C.areas, area, ...resto].join('/');
    else if (proyecto) r = [C.proyectos, proyecto, ...resto].join('/');
  }
  // Cada tramo que no exista (carpeta o nota) se busca por su nombre sin emoji.
  const partes = r.split('/');
  let actual = '';
  for (let i = 0; i < partes.length; i++) {
    let p = partes[i];
    const dir = join(vault, actual);
    if (!existsSync(join(dir, p))) p = hijoParecido(dir, p) || p;
    actual = actual ? `${actual}/${p}` : p;
  }
  return actual;
}

// true si la ruta cae dentro de una de las carpetas principales del vault.
export const dentroDeLaEstructura = (rel) => Object.values(C).some((c) => rel === c || String(rel).startsWith(`${c}/`));
