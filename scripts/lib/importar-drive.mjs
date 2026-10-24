// okt importar drive <enlace o id> [--seleccion 1,3|todo] [--aplicar] [--carpeta <destino>]
// Solo lectura en Drive (gws). Un Google Doc se exporta a Markdown; un PDF u otro archivo se baja a
// la carpeta de adjuntos de Drive con una nota que lo enlaza; una carpeta se lista para elegir.
// Las hojas de cálculo no se importan: en Drive suele haber datos clínicos.
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ejecutar, jsonDe } from './binarios.mjs';
import { errorUso, parsearSeleccion, escribirImportada, rutaAdjunto, leerRegistro } from './importacion.mjs';
import { limpiarNombre } from './nombres.mjs';
import { carpetaAdjuntos } from './estructura.mjs';

const CARPETA = 'application/vnd.google-apps.folder';
const DOC = 'application/vnd.google-apps.document';
const HOJA = /spreadsheet|ms-excel|officedocument\.spreadsheetml|text\/csv/;
const TEXTO = /^text\/(plain|markdown)$/;

export function idDeDrive(ref) {
  const s = String(ref);
  const m = s.match(/\/(?:d|folders)\/([\w-]{15,})/) || s.match(/[?&]id=([\w-]{15,})/) || s.match(/^([\w-]{15,})$/);
  return m ? m[1] : null;
}

function gws(args, opciones = {}) {
  const r = ejecutar('gws', args, { timeout: 180000, ...opciones });
  if (r.faltante) throw Object.assign(new Error('Falta el CLI de Google Workspace (gws). Instálalo y conéctalo: npm install -g @googleworkspace/cli && gws auth login'), { codigo: 5 });
  const j = jsonDe(r.salida);
  if (j?.error) throw new Error(`Drive: ${j.error.message || j.error.code}`);
  if (!r.ok) throw new Error(`Drive: ${r.error || r.salida}`.trim());
  return j;
}

const meta = (id) => gws(['drive', 'files', 'get', '--params', JSON.stringify({ fileId: id, fields: 'id,name,mimeType,modifiedTime,webViewLink', supportsAllDrives: true })]);

// gws --output solo acepta rutas dentro del directorio actual: se ejecuta con cwd = carpeta destino.
function bajar(args, dir, nombre) {
  mkdirSync(dir, { recursive: true });
  gws([...args, '--output', nombre], { cwd: dir });
  if (!existsSync(join(dir, nombre))) throw new Error('Drive no devolvió el archivo.');
}

async function importarArchivo(vault, f, op) {
  const quien = f.name;
  if (f.mimeType === CARPETA) throw new Error('es una carpeta: ábrela con su propio enlace');
  if (HOJA.test(f.mimeType)) throw new Error('las hojas de cálculo no se importan: Drive solo exporta la primera pestaña como texto (descárgala como PDF o pásala a un Doc)');
  const datos = { origen: 'drive', url: f.webViewLink || `https://drive.google.com/file/d/${f.id}`, id_externo: f.id };
  const cache = join(vault, '.cerebro', 'cache', 'drive');

  if (f.mimeType === DOC || TEXTO.test(f.mimeType)) {
    const nombre = `${f.id}.md`;
    if (f.mimeType === DOC) bajar(['drive', 'files', 'export', '--params', JSON.stringify({ fileId: f.id, mimeType: 'text/markdown' })], cache, nombre);
    else bajar(['drive', 'files', 'get', '--params', JSON.stringify({ fileId: f.id, alt: 'media', supportsAllDrives: true })], cache, nombre);
    const md = readFileSync(join(cache, nombre), 'utf8');
    rmSync(join(cache, nombre), { force: true });
    return escribirImportada(vault, { clave: `drive:${f.id}`, titulo: f.name.replace(/\.(md|txt)$/i, ''), contenido: md, datos, op });
  }

  // Binario (PDF, imagen, Word…): se guarda el original y una nota que lo enlaza.
  const dir = join(vault, carpetaAdjuntos('drive'));
  let base = limpiarNombre(f.name) || f.id;
  if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += f.mimeType === 'application/pdf' ? '.pdf' : '';
  // Reimportar el mismo archivo reemplaza su propio adjunto; otro archivo con el mismo nombre lleva sufijo.
  const previo = String(leerRegistro(vault)[`drive:${f.id}`]?.adjunto || '');
  let nombre = previo || base;
  for (let i = 2; !previo && existsSync(join(dir, nombre)); i++) nombre = base.replace(/(\.[^.]+)?$/, ` ${i}$1`);
  bajar(['drive', 'files', 'get', '--params', JSON.stringify({ fileId: f.id, alt: 'media', supportsAllDrives: true })], dir, nombre);
  const incrustar = /^image\/|application\/pdf/.test(f.mimeType) ? '!' : '';
  const contenido = `Archivo original: ${incrustar}[[${nombre}]]\n\nUbicación: \`${rutaAdjunto('drive', nombre)}\`. Pide «procesa mi bandeja» para resumirlo en una ficha de fuente.`;
  return escribirImportada(vault, { clave: `drive:${f.id}`, titulo: f.name.replace(/\.[a-z0-9]{2,5}$/i, ''), contenido, datos: { ...datos, adjunto: `[[${nombre}]]` }, op });
}

export async function importarDrive(vault, ref, op = {}) {
  if (!ref) throw errorUso('Uso: okt importar drive <enlace o id> [--seleccion 1,3|todo] [--aplicar]');
  const id = idDeDrive(ref);
  if (!id) throw errorUso(`No encontré un id de Drive en «${ref}». Usa el enlace de «Compartir → Copiar enlace».`);
  const f = meta(id);

  if (f.mimeType !== CARPETA) {
    if (!op.aplicar && !op.seleccion) {
      return { texto: `Drive: «${f.name}» (${f.mimeType}, modificado ${(f.modifiedTime || '').slice(0, 10)}).\nPara importarlo: okt importar drive ${ref} --aplicar`, datos: { tipo: 'archivo', archivo: f } };
    }
    const res = await importarArchivo(vault, f, op);
    return { texto: `Drive → ${res.ruta} (${res.accion}).`, datos: { importadas: [res] } };
  }

  const lista = gws(['drive', 'files', 'list', '--params', JSON.stringify({ q: `'${id}' in parents and trashed=false`, fields: 'files(id,name,mimeType,modifiedTime,webViewLink)', pageSize: 100, orderBy: 'name', supportsAllDrives: true, includeItemsFromAllDrives: true })]);
  const archivos = (lista?.files || []).filter((x) => x.mimeType !== CARPETA);
  if (!op.seleccion) {
    const filas = archivos.map((x, i) => `${i + 1}. ${x.name}${HOJA.test(x.mimeType) ? ' (hoja: no se importa)' : ''} · ${(x.modifiedTime || '').slice(0, 10)}`).join('\n');
    return { texto: `Carpeta de Drive «${f.name}» con ${archivos.length} archivos:\n${filas || '(vacía)'}\n\nElige cuáles importar: okt importar drive "${ref}" --seleccion 1,3`, datos: { tipo: 'carpeta', archivos } };
  }
  const importadas = [];
  const fallidas = [];
  for (const i of parsearSeleccion(op.seleccion, archivos.length)) {
    try {
      importadas.push(await importarArchivo(vault, archivos[i], op));
    } catch (e) {
      fallidas.push({ titulo: archivos[i].name, error: e.message });
    }
  }
  const texto = [`Drive: ${importadas.length} importados${fallidas.length ? `, ${fallidas.length} sin importar` : ''}.`, ...importadas.map((x) => `- ${x.ruta} (${x.accion})`), ...fallidas.map((x) => `- ✖ ${x.titulo}: ${x.error}`)].join('\n');
  return { texto, datos: { importadas, fallidas }, codigo: importadas.length ? 0 : 1 };
}
