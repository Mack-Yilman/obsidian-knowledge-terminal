// okt importar notion <enlace o id> [--seleccion 1,3|todo] [--carpeta <destino>] [--forzar]
// Copia SOLO el contenido (Markdown) de la página, o de las páginas elegidas de una base. Las
// propiedades de Notion no se copian y Notion no se modifica (solo lectura con ntn).
import { ejecutar, jsonDe } from './binarios.mjs';
import { errorUso, parsearSeleccion, revisarSensible, escribirImportada, descargarAdjunto } from './importacion.mjs';

const HOSTS_NOTION = /(prod-files-secure\.s3|s3\.us-west-2\.amazonaws\.com|file\.notion\.so|notion-static\.com|notion\.so\/image|notionusercontent\.com)/;

export function idDeNotion(ref) {
  const sinQuery = String(ref).split(/[?#]/)[0];
  const m = sinQuery.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?!.*[0-9a-f]{32})/i);
  if (!m) return null;
  const h = m[1].replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function ntn(args) {
  const r = ejecutar('ntn', args, { timeout: 120000 });
  if (r.faltante) throw Object.assign(new Error('Falta el CLI de Notion (ntn). Instálalo y conéctalo: npm install -g ntn && ntn login'), { codigo: 5 });
  return r;
}

const tituloDe = (pagina) => {
  for (const p of Object.values(pagina?.properties || {})) {
    if (p?.type === 'title') return (p.title || []).map((t) => t.plain_text || t.text?.content || '').join('').trim();
  }
  return '';
};

function infoPagina(id) {
  const r = ntn(['api', `/v1/pages/${id}`]);
  const j = r.ok ? jsonDe(r.salida) : null;
  return { titulo: tituloDe(j) || 'Página de Notion', url: j?.url || '', editado: (j?.last_edited_time || '').slice(0, 10) };
}

function listarBase(ref) {
  const r = ntn(['datasources', 'query', ref, '--json', '--limit', '100']);
  if (!r.ok) return null;
  const j = jsonDe(r.salida);
  const filas = Array.isArray(j) ? j : j?.results || [];
  return filas.map((p) => ({ id: p.id, titulo: tituloDe(p) || '(sin título)', editado: (p.last_edited_time || '').slice(0, 10), url: p.url || '' }));
}

// Imágenes y archivos alojados en Notion: sus URL caducan, así que se descargan ya.
async function traerAdjuntos(vault, markdown, base) {
  let n = 0;
  const reemplazos = [];
  for (const m of markdown.matchAll(/(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (!HOSTS_NOTION.test(m[3])) continue;
    n++;
    try {
      const nombre = await descargarAdjunto(vault, m[3], 'notion', `${base} ${n}`);
      reemplazos.push([m[0], m[1] ? `![[${nombre}]]` : `[[${nombre}|${m[2] || nombre}]]`]);
    } catch (e) {
      reemplazos.push([m[0], `${m[0]} <!-- no se pudo descargar: ${e.message} -->`]);
    }
  }
  let salida = markdown;
  for (const [a, b] of reemplazos) salida = salida.replace(a, b);
  return salida;
}

async function importarPagina(vault, id, op, meta) {
  const r = ntn(['pages', 'get', id]);
  if (!r.ok) throw new Error(`Notion no devolvió la página ${id}: ${r.error || r.salida}`.trim());
  const info = meta || infoPagina(id);
  let md = r.salida.replace(/\r\n/g, '\n').trim();
  const j = md.startsWith('{') ? jsonDe(md) : null;
  if (j) md = String(j.markdown ?? j.content ?? '').trim();
  md = md.replace(new RegExp(`^#\\s+${info.titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), '');
  revisarSensible(md, op, info.titulo);
  md = await traerAdjuntos(vault, md, info.titulo);
  return escribirImportada(vault, {
    clave: `notion:${id}`,
    titulo: info.titulo,
    contenido: md,
    datos: { origen: 'notion', url: info.url || `https://www.notion.so/${id.replace(/-/g, '')}`, id_externo: id },
    op,
  });
}

export async function importarNotion(vault, ref, op = {}) {
  if (!ref) throw errorUso('Uso: okt importar notion <enlace o id> [--seleccion 1,3|todo] [--carpeta <destino>]');
  const id = idDeNotion(ref);
  if (!id) throw errorUso(`No encontré un id de Notion en «${ref}». Copia el enlace de la página o de la base («Copiar enlace»).`);
  const esBase = /[?&]v=/.test(String(ref));

  if (!esBase) {
    const r = ntn(['pages', 'get', id]);
    if (r.ok) {
      const info = infoPagina(id);
      if (!op.seleccion && !op.aplicar) {
        return { texto: `Página de Notion: «${info.titulo}» (editada ${info.editado || '?'}).\nPara importarla: okt importar notion ${ref} --aplicar`, datos: { tipo: 'pagina', ...info } };
      }
      const res = await importarPagina(vault, id, op, info);
      return { texto: `Notion → ${res.ruta} (${res.accion}).`, datos: { importadas: [res] } };
    }
  }
  const paginas = listarBase(ref.startsWith('http') ? ref : id);
  if (!paginas) throw new Error('Notion no devolvió ni una página ni una base con ese enlace. Revisa que la integración de ntn tenga acceso (las vistas enlazadas no son accesibles por la API).');
  if (!op.seleccion) {
    const lista = paginas.map((p, i) => `${i + 1}. ${p.titulo}${p.editado ? ` · ${p.editado}` : ''}`).join('\n');
    return { texto: `Base de Notion con ${paginas.length} páginas:\n${lista}\n\nElige cuáles importar: okt importar notion "${ref}" --seleccion 1,3 (o --seleccion todo)`, datos: { tipo: 'base', paginas } };
  }
  const importadas = [];
  const fallidas = [];
  for (const i of parsearSeleccion(op.seleccion, paginas.length)) {
    const p = paginas[i];
    try {
      importadas.push(await importarPagina(vault, p.id, op, { titulo: p.titulo, url: p.url, editado: p.editado }));
    } catch (e) {
      fallidas.push({ titulo: p.titulo, error: e.message });
    }
  }
  const texto = [
    `Notion: ${importadas.length} importadas${fallidas.length ? `, ${fallidas.length} sin importar` : ''}.`,
    ...importadas.map((x) => `- ${x.ruta} (${x.accion})`),
    ...fallidas.map((x) => `- ✖ ${x.titulo}: ${x.error}`),
  ].join('\n');
  return { texto, datos: { importadas, fallidas }, codigo: importadas.length ? 0 : 1 };
}
