// okt importar notion <enlace o id> [--seleccion 1,3|todo] [--carpeta <destino>] [--forzar]
// Copia SOLO el contenido (Markdown) de la página, o de las páginas elegidas de una base. Las
// propiedades de Notion no se copian y Notion no se modifica (solo lectura con ntn).
import { ejecutar, jsonDe } from './binarios.mjs';
import { notionAObsidian } from './notion-markdown.mjs';
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
  for (const [a, b] of reemplazos) salida = salida.replace(a, () => b);
  return salida;
}


const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

// ntn pages get antepone las propiedades de Notion como frontmatter YAML. Se separan: las propiedades
// NO se copian al vault, pero sus relaciones (listas de ids) sirven para navegar a las páginas
// relacionadas (módulos, capítulos…).
export function separarPropiedades(markdown) {
  const md = markdown.replace(/\r\n/g, '\n');
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { propiedades: {}, contenido: md.trim() };
  const propiedades = {};
  let clave = null;
  for (const linea of m[1].split('\n')) {
    const item = linea.match(/^\s*-\s+(.*)$/);
    if (item && clave) {
      if (!Array.isArray(propiedades[clave])) propiedades[clave] = [];
      propiedades[clave].push(item[1].trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const par = linea.match(/^(['"]?)(.+?)\1:\s*(.*)$/);
    if (par && !linea.startsWith(' ')) {
      clave = par[2];
      propiedades[clave] = par[3].trim();
    }
  }
  return { propiedades, contenido: md.slice(m[0].length).trim() };
}

export function relacionesDe(propiedades) {
  return Object.entries(propiedades)
    .filter(([, v]) => Array.isArray(v) && v.length && v.every((x) => UUID.test(x)))
    .map(([nombre, ids]) => ({ nombre, ids: ids.map((x) => idDeNotion(x)) }));
}

// Las bases incrustadas llegan como <database url="…">: se dejan como aviso, no se importan solas.
function limpiarEtiquetas(contenido) {
  return contenido.replace(/<database url="([^"]+)"[^>]*>\s*<\/database>/g, (_, url) => `> Base de Notion incrustada (no importada): ${url}`);
}

const sinContenido = (c) => !c.replace(/^> Base de Notion incrustada.*$/gm, '').replace(/^#+\s.*$/gm, '').replace(/^---$/gm, '').trim();

function leerPagina(id) {
  const r = ntn(['pages', 'get', id]);
  if (!r.ok) return null;
  let md = r.salida;
  const j = md.trim().startsWith('{') ? jsonDe(md) : null;
  if (j) md = String(j.markdown ?? j.content ?? '');
  const { propiedades, contenido } = separarPropiedades(md);
  return { propiedades, contenido: notionAObsidian(limpiarEtiquetas(contenido)), relaciones: relacionesDe(propiedades) };
}

async function importarPagina(vault, id, op, meta, pagina) {
  const p = pagina || leerPagina(id);
  if (!p) throw new Error(`Notion no devolvió la página ${id}.`);
  const info = meta || infoPagina(id);
  let md = p.contenido.replace(new RegExp(`^#\\s+${info.titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), '');
  if (sinContenido(md)) {
    const subs = p.relaciones.map((r) => `«${r.nombre}» (${r.ids.length})`).join(', ');
    throw new Error(`no tiene contenido propio${subs ? `; su contenido está en las páginas relacionadas ${subs}: okt importar notion ${id}` : ''}`);
  }
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

async function importarVarias(vault, paginas, op) {
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

const MAX_RELACIONADAS = 60;

export async function importarNotion(vault, ref, op = {}) {
  if (!ref) throw errorUso('Uso: okt importar notion <enlace o id> [--seleccion 1,3|todo] [--aplicar] [--carpeta <destino>]');
  const id = idDeNotion(ref);
  if (!id) throw errorUso(`No encontré un id de Notion en «${ref}». Copia el enlace de la página o de la base («Copiar enlace»).`);
  const esBase = /[?&]v=/.test(String(ref));

  const pagina = esBase ? null : leerPagina(id);
  if (pagina) {
    const info = infoPagina(id);
    // Páginas relacionadas (por propiedad), numeradas en orden, para elegir o para bajar de nivel.
    const relacionadas = [];
    for (const rel of pagina.relaciones) {
      for (const rid of rel.ids.slice(0, MAX_RELACIONADAS - relacionadas.length)) {
        const ri = infoPagina(rid);
        relacionadas.push({ id: rid, titulo: ri.titulo, url: ri.url, editado: ri.editado, propiedad: rel.nombre });
      }
    }
    if (op.seleccion) {
      if (!relacionadas.length) throw errorUso('Esta página no tiene páginas relacionadas: impórtala con --aplicar.');
      return importarVarias(vault, relacionadas, op);
    }
    if (op.aplicar) {
      const res = await importarPagina(vault, id, op, info, pagina);
      return { texto: `Notion → ${res.ruta} (${res.accion}).`, datos: { importadas: [res] } };
    }
    const largo = sinContenido(pagina.contenido) ? 'sin contenido propio' : `${pagina.contenido.length} caracteres de contenido`;
    const lineas = [`Página de Notion: «${info.titulo}» (${largo}; editada ${info.editado || '?'}).`];
    let propiedadActual = null;
    relacionadas.forEach((r, i) => {
      if (r.propiedad !== propiedadActual) {
        propiedadActual = r.propiedad;
        lineas.push(`\nPáginas relacionadas en «${r.propiedad}»:`);
      }
      lineas.push(`${i + 1}. ${r.titulo} · ${r.id}`);
    });
    const incrustadas = (pagina.contenido.match(/^> Base de Notion incrustada/gm) || []).length;
    if (incrustadas) lineas.push(`\n${incrustadas} base(s) incrustada(s): si es una vista enlazada, la API no la lee; usa las relaciones de arriba.`);
    lineas.push('');
    if (!sinContenido(pagina.contenido)) lineas.push(`Importar esta página: okt importar notion ${id} --aplicar`);
    if (relacionadas.length) {
      lineas.push(`Importar relacionadas: okt importar notion ${id} --seleccion 1,3 (o todo)`);
      lineas.push('Ver lo que hay dentro de una relacionada: okt importar notion <su id>');
    }
    return { texto: lineas.join('\n'), datos: { tipo: 'pagina', ...info, contenido: pagina.contenido.length, relacionadas } };
  }

  const paginas = listarBase(ref.startsWith('http') ? ref : id);
  if (!paginas) throw new Error('Notion no devolvió ni una página ni una base con ese enlace. Revisa que la integración de ntn tenga acceso (las vistas enlazadas no son accesibles por la API: abre la base original o navega por las relaciones de la página).');
  if (!op.seleccion) {
    const lista = paginas.map((p, i) => `${i + 1}. ${p.titulo}${p.editado ? ` · ${p.editado}` : ''} · ${p.id}`).join('\n');
    return { texto: `Base de Notion con ${paginas.length} páginas:\n${lista}\n\nElige cuáles importar: okt importar notion "${ref}" --seleccion 1,3 (o --seleccion todo)`, datos: { tipo: 'base', paginas } };
  }
  return importarVarias(vault, paginas, op);
}
