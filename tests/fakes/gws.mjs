// Fake de gws. Regla real: --output solo acepta una ruta dentro del directorio actual. Los errores
// salen como JSON en stdout. Solo implementa lecturas: cualquier escritura falla.
import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { datos, registrar, fallar, opcion } from './comun.mjs';

const args = process.argv.slice(2);
registrar('gws', args);
const d = datos().drive;
const params = JSON.parse(opcion(args, '--params') || '{}');
const salida = opcion(args, '--output');
const [servicio, recurso, metodo] = args;

function error(code, message) {
  console.log(JSON.stringify({ error: { code, message } }));
  process.exit(1);
}

if (servicio === '--version') {
  console.log('gws 0.0.0-fake');
  process.exit(0);
}
if (servicio !== 'drive' || recurso !== 'files') fallar(`fake gws: no soportado ${args.join(' ')}`, 2);
if (salida && (isAbsolute(salida) || salida.includes('..') || /[\\/]/.test(salida))) error(400, '--output must be a relative path inside the current directory');

const f = d.archivos[params.fileId];
if (metodo === 'get' && params.alt !== 'media') {
  if (!f) error(404, 'File not found');
  const { contenido, ...meta } = f;
  console.log(JSON.stringify(meta));
} else if (metodo === 'get' && params.alt === 'media') {
  if (!f) error(404, 'File not found');
  if (f.mimeType.startsWith('application/vnd.google-apps')) error(403, 'Only files with binary content can be downloaded. Use Export with Docs Editors files.');
  writeFileSync(salida, f.contenido);
} else if (metodo === 'export') {
  if (!f) error(404, 'File not found');
  if (params.mimeType !== 'text/markdown') error(400, 'unsupported export mime');
  writeFileSync(salida, f.contenido);
} else if (metodo === 'list') {
  const padre = params.q.match(/'([^']+)' in parents/)[1];
  console.log(JSON.stringify({ files: Object.values(d.archivos).filter((x) => x.padre === padre).map(({ contenido, padre: _, ...m }) => m) }));
} else {
  error(403, `fake gws: método no permitido (solo lectura): ${metodo}`);
}
