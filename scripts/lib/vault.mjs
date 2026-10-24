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

// Enlaces [[destino#sección|alias]] y ![[adjunto]] fuera de bloques de código.
export function extraerEnlaces(texto) {
  const sinCodigo = texto.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const enlaces = [];
  for (const m of sinCodigo.matchAll(/(!?)\[\[([^\]\n]+?)\]\]/g)) {
    const destino = m[2].split('|')[0].split('#')[0].trim();
    if (destino) enlaces.push({ destino, incrustado: m[1] === '!' });
  }
  return enlaces;
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
