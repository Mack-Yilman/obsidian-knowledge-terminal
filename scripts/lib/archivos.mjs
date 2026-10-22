// okt adjuntar (copia un archivo local a los adjuntos de Fuentes sin tocar el original y sin duplicar) y
// okt archivar (mueve a la carpeta Archivo conservando la ruta; nada se borra).
import { readFileSync, existsSync, mkdirSync, copyFileSync, renameSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { dentroDe, posix, sobrescribir } from './rutas.mjs';
import { C, carpetaAdjuntos, resolverCarpeta } from './estructura.mjs';
import { limpiarNombre } from './nombres.mjs';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { fechaISO } from './fechas.mjs';

const errorUso = (m) => Object.assign(new Error(m), { codigo: 2 });
const ORIGEN_POR_EXT = { '.pdf': 'pdf', '.png': 'imagenes', '.jpg': 'imagenes', '.jpeg': 'imagenes', '.gif': 'imagenes', '.webp': 'imagenes', '.svg': 'imagenes', '.mp3': 'audio', '.m4a': 'audio', '.wav': 'audio', '.mp4': 'video', '.docx': 'documentos', '.pptx': 'documentos', '.epub': 'documentos' };

function leerHuellas(vault) {
  try {
    return JSON.parse(readFileSync(join(vault, '.cerebro', 'fuentes.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function adjuntar(vault, ruta, op = {}) {
  if (!ruta) throw errorUso('Uso: okt adjuntar "<ruta del archivo>" [--origen pdf]');
  const abs = resolve(ruta);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw errorUso(`No existe el archivo: ${ruta}`);
  const bytes = readFileSync(abs);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const huellas = leerHuellas(vault);
  if (huellas[sha] && existsSync(join(vault, huellas[sha]))) {
    return { texto: `Ya estaba: ${huellas[sha]} (mismo contenido). Usa [[${basename(huellas[sha])}]].`, datos: { ruta: huellas[sha], nombre: basename(huellas[sha]), nuevo: false, sha256: sha } };
  }
  const ext = extname(abs).toLowerCase();
  const origen = op.origen || ORIGEN_POR_EXT[ext] || 'otros';
  const dir = join(vault, carpetaAdjuntos(origen));
  mkdirSync(dir, { recursive: true });
  const base = limpiarNombre(basename(abs, extname(abs))) || 'archivo';
  let nombre = `${base}${ext}`;
  for (let i = 2; existsSync(join(dir, nombre)); i++) nombre = `${base} ${i}${ext}`;
  copyFileSync(abs, join(dir, nombre));
  const rel = posix(relative(vault, join(dir, nombre)));
  huellas[sha] = rel;
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  sobrescribir(join(vault, '.cerebro', 'fuentes.json'), `${JSON.stringify(huellas, null, 2)}\n`);
  return { texto: `Copiado a ${rel}. Enlázalo como [[${nombre}]] (el original no se tocó).`, datos: { ruta: rel, nombre, nuevo: true, sha256: sha } };
}

function marcarArchivado(abs) {
  if (statSync(abs).isDirectory()) {
    for (const e of readdirSync(abs)) marcarArchivado(join(abs, e));
    return;
  }
  if (!abs.endsWith('.md')) return;
  const texto = readFileSync(abs, 'utf8');
  const { datos, cuerpo, tiene } = leerFrontmatter(texto);
  if (!tiene || !('estado' in datos)) return;
  sobrescribir(abs, escribirFrontmatter({ ...datos, estado: 'archivado', actualizado: fechaISO() }, cuerpo));
}

export function archivar(vault, rutas) {
  if (!rutas.length) throw errorUso('Uso: okt archivar "<ruta>" […]');
  const movidos = [];
  for (const r of rutas) {
    const abs = resolve(vault, resolverCarpeta(vault, r));
    const rel = posix(relative(resolve(vault), abs));
    // Lo de la raíz (AGENTS.md, las carpetas principales) no se archiva: solo lo que está dentro.
    const prohibido = !dentroDe(vault, abs) || !rel.includes('/') || rel.startsWith(`${C.archivo}/`) || rel.startsWith(`${C.sistema}/`) || rel.startsWith('.');
    if (!existsSync(abs) || prohibido) throw errorUso(`No se puede archivar «${r}»: debe existir dentro de una carpeta del vault que no sea ${C.archivo}, ${C.sistema} ni una carpeta oculta.`);
    let dest = join(vault, C.archivo, rel);
    for (let i = 2; existsSync(dest); i++) dest = join(vault, C.archivo, rel.replace(/(\.[^./]+)?$/, ` ${i}$1`));
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(abs, dest);
    marcarArchivado(dest);
    movidos.push(`${rel} → ${posix(relative(vault, dest))}`);
  }
  return { texto: `Archivado:\n${movidos.map((m) => `- ${m}`).join('\n')}`, datos: { movidos } };
}
