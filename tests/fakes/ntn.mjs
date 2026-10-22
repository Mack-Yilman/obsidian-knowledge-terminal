// Fake de ntn (Notion CLI). Reglas reales: ids de 32 hex con o sin guiones; las vistas enlazadas dan 404;
// pages get devuelve Markdown.
import { datos, registrar, fallar, opcion } from './comun.mjs';

const args = process.argv.slice(2);
registrar('ntn', args);
const d = datos().notion;
const norm = (x) => String(x).replace(/-/g, '').toLowerCase().match(/[0-9a-f]{32}/)?.[0];

const [grupo, accion, ref] = args;
if (grupo === '--version') {
  console.log('ntn 0.0.0-fake');
} else if (grupo === 'pages' && accion === 'get') {
  const p = d.paginas[norm(ref)];
  if (!p) fallar('object_not_found: Could not find page');
  // Como el ntn real: las propiedades salen primero como frontmatter YAML.
  const props = Object.entries(p.props || {}).map(([k, v]) => (Array.isArray(v) ? `${/\s|%/.test(k) ? `'${k}'` : k}:\n${v.map((x) => `- ${x}`).join('\n')}` : `${/\s|%/.test(k) ? `'${k}'` : k}: ${v}`));
  process.stdout.write(`${props.length ? `---\n${props.join('\n')}\n---\n\n` : ''}${p.markdown}`);
} else if (grupo === 'api') {
  const id = norm(accion);
  if (!accion.startsWith('/v1/')) fallar('400 invalid_request_url');
  const p = d.paginas[id];
  if (!p) fallar('404 object_not_found');
  console.log(JSON.stringify({ object: 'page', id, url: `https://www.notion.so/${id}`, last_edited_time: p.editado, properties: { Nombre: { type: 'title', title: [{ plain_text: p.titulo }] } } }));
} else if (grupo === 'datasources' && accion === 'query') {
  const b = d.bases[norm(ref)];
  if (!b) fallar('404 object_not_found (linked databases are not supported)');
  if (!args.includes('--json')) fallar('usa --json en el fake');
  const limite = Number(opcion(args, '--limit') || 25);
  const results = b.slice(0, limite).map((id) => ({ object: 'page', id, url: `https://www.notion.so/${id}`, last_edited_time: d.paginas[id].editado, properties: { Nombre: { type: 'title', title: [{ plain_text: d.paginas[id].titulo }] }, Curso: { type: 'select', select: { name: 'X' } } } }));
  console.log(JSON.stringify({ object: 'list', results, has_more: false }));
} else {
  fallar(`fake ntn: comando no soportado ${args.join(' ')}`, 2);
}
