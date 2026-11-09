// Lectura del vault: carpetas del contrato, notas, adjuntos y enlaces.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
import { leerFrontmatter } from './frontmatter.mjs';
import { posix } from './rutas.mjs';
import { C, R, CARPETAS } from './estructura.mjs';
import { sinEmoji } from './nombres.mjs';

export { CARPETAS };

// Se ignoran las carpetas ocultas (.obsidian, .cerebro, .git, .trash) y las plantillas.
const IGNORAR = (rel) => rel.split('/').some((p) => p.startsWith('.')) || rel.startsWith(R.plantillas);

function recorrer(vault, dir, salida) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entradas) {
    const abs = join(dir, e.name);
    const rel = posix(relative(vault, abs));
    if (IGNORAR(rel)) continue;
    if (e.isDirectory()) recorrer(vault, abs, salida);
    else salida.push(rel);
  }
}

export function listarArchivos(vault) {
  const todos = [];
  recorrer(vault, vault, todos);
  return todos.sort();
}

export function listarNotas(vault) {
  return listarArchivos(vault)
    .filter((r) => r.toLowerCase().endsWith('.md'))
    .filter((r) => !['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md'].includes(r));
}

export function leerNota(vault, rel) {
  const texto = readFileSync(join(vault, rel), 'utf8');
  const { datos, cuerpo, tiene } = leerFrontmatter(texto);
  return { rel, nombre: basename(rel, extname(rel)), texto, datos, cuerpo, tieneFrontmatter: tiene };
}

export const esSistema = (rel) => rel.startsWith(`${C.sistema}/`);

// Limpia bloques de código preservando saltos de línea para mantener números de línea.
function limpiarCodigo(texto) {
  return String(texto || '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\r\n]/g, ' '))
    .replace(/`[^`\r\n]*`/g, (m) => ' '.repeat(m.length));
}

// Desglosa el contenido interior de un enlace [[...]] respetando enlaces incrustados anidados ![[...]]
function desglosarEnlace(contenido) {
  let profundidad = 0;
  let idxBarra = -1;
  for (let i = 0; i < contenido.length; i++) {
    if (contenido.startsWith('[[', i)) {
      profundidad++;
      i++;
    } else if (contenido.startsWith(']]', i)) {
      profundidad--;
      i++;
    } else if (profundidad === 0 && contenido[i] === '|' && idxBarra === -1) {
      idxBarra = i;
      break;
    }
  }
  const ref = idxBarra === -1 ? contenido : contenido.slice(0, idxBarra);
  const etiqueta = idxBarra === -1 ? '' : contenido.slice(idxBarra + 1);

  // Buscar '#' en ref fuera de enlaces anidados
  profundidad = 0;
  const hashes = [];
  for (let i = 0; i < ref.length; i++) {
    if (ref.startsWith('[[', i)) {
      profundidad++;
      i++;
    } else if (ref.startsWith(']]', i)) {
      profundidad--;
      i++;
    } else if (profundidad === 0 && ref[i] === '#') {
      hashes.push(i);
    }
  }

  let destino = '';
  let ancla = null;
  const tieneAncla = hashes.length > 0;

  if (tieneAncla) {
    destino = ref.slice(0, hashes[0]).trim();
    ancla = ref.slice(hashes[hashes.length - 1] + 1).trim();
  } else {
    destino = ref.trim();
  }

  return { destino, ancla, tieneAncla, etiqueta, ref };
}

// Número de línea de cada posición, contando solo los saltos desde la anterior (un libro tiene miles de enlaces:
// contar desde el inicio cada vez era cuadrático). Las posiciones llegan en orden creciente.
function contadorDeLineas(texto) {
  let pos = 0;
  let linea = 1;
  return (indice) => {
    for (; pos < indice; pos++) if (texto.charCodeAt(pos) === 10) linea++;
    return linea;
  };
}

// Enlaces [[destino#sección|alias]] y ![[adjunto]] fuera de bloques de código.
export function extraerEnlaces(texto) {
  const sinCodigo = limpiarCodigo(texto);
  const enlaces = [];
  const lineaDe = contadorDeLineas(sinCodigo);
  for (const m of sinCodigo.matchAll(/(!?)\[\[((?:!?\[\[[^\]\r\n]+\]\]|[^\]\r\n])+)\]\]/g)) {
    const { destino, ancla, etiqueta } = desglosarEnlace(m[2]);
    if (destino) {
      const linea = lineaDe(m.index);
      enlaces.push({
        destino,
        incrustado: m[1] === '!',
        ancla: ancla ?? '',
        etiqueta,
        crudo: m[0],
        linea,
      });
    }
  }
  return enlaces;
}

// Enlaces con ancla (#sección o #^id), incluidos los de la misma nota ([[#Sección]]).
export function extraerAnclas(texto) {
  const sinCodigo = limpiarCodigo(texto);
  const anclas = [];
  const lineaDe = contadorDeLineas(sinCodigo);
  for (const m of sinCodigo.matchAll(/(!?)\[\[((?:!?\[\[[^\]\r\n]+\]\]|[^\]\r\n])+)\]\]/g)) {
    const { destino, ancla, tieneAncla, etiqueta } = desglosarEnlace(m[2]);
    if (tieneAncla && ancla !== null) {
      const linea = lineaDe(m.index);
      anclas.push({
        destino,
        ancla,
        bloque: ancla.startsWith('^'),
        etiqueta,
        crudo: m[0],
        linea,
      });
    }
  }
  return anclas;
}

// Mapa nombre → rutas, para resolver enlaces como Obsidian (por nombre de archivo).
export function mapaDeNombres(vault) {
  const mapa = new Map();
  for (const rel of listarArchivos(vault)) {
    const nombre = rel.toLowerCase().endsWith('.md') ? basename(rel.slice(0, -3)) : basename(rel);
    const clave = nombre.toLowerCase();
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(rel);
    // Un enlace también puede llevar la ruta: [[carpeta/nota]].
    const sinExt = rel.toLowerCase().endsWith('.md') ? rel.slice(0, -3) : rel;
    if (sinExt.includes('/')) {
      const k = sinExt.toLowerCase();
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(rel);
    }
  }
  return mapa;
}

// Notas que son «la misma» aunque cambie el emoji: «💡 Anemia» y «🩸 Anemia». Sirve para no duplicar; los
// enlaces, en cambio, se resuelven por el nombre exacto, como en Obsidian (un alias no resuelve un enlace).
// Lo archivado no cuenta: un original en bruto no impide usar su nombre en la nota procesada.
export function mismasNotas(vault, nombre) {
  const base = sinEmoji(nombre).toLowerCase();
  return listarNotas(vault).filter((rel) => !esArchivado(rel) && sinEmoji(basename(rel, extname(rel))).toLowerCase() === base);
}

export const esArchivado = (rel) => rel.startsWith(`${C.archivo}/`);

export function existe(vault, rel) {
  return existsSync(join(vault, rel));
}
