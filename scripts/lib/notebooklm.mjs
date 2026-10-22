// okt notebooklm …: consultar cuadernos de NotebookLM y traer sus notas, respuestas y contenidos de
// Studio (infografías, presentaciones, audio, mapas, informes, tablas) al vault. Todo a pedido.
// Usa el CLI nlm (notebooklm-mcp-cli). Solo lectura sobre las fuentes del cuaderno; crear un
// contenido de Studio consume cuota de NotebookLM y lo pide el usuario.
import { readFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { ejecutar, jsonDe } from './binarios.mjs';
import { errorUso, parsearSeleccion, revisarSensible, escribirImportada, rutaAdjunto } from './importacion.mjs';
import { leerConfigVault, guardarConfigVault, posix } from './rutas.mjs';
import { limpiarNombre } from './nombres.mjs';
import { fechaISO } from './fechas.mjs';

const ESTUDIO = {
  infografia: { crear: ['infographic', 'create'], bajar: 'infographic', ext: 'png', opciones: { orientacion: '--orientation', detalle: '--detail', estilo: '--style', idioma: '--language', enfoque: '--focus' } },
  presentacion: { crear: ['slides', 'create'], bajar: 'slide-deck', ext: 'pdf', opciones: { idioma: '--language', enfoque: '--focus', duracion: '--length' } },
  audio: { crear: ['audio', 'create'], bajar: 'audio', ext: 'm4a', opciones: { idioma: '--language', enfoque: '--focus', duracion: '--length' } },
  video: { crear: ['video', 'create'], bajar: 'video', ext: 'mp4', opciones: { idioma: '--language', enfoque: '--focus' } },
  mapa: { crear: ['mindmap', 'create'], bajar: 'mind-map', ext: 'json', opciones: { titulo: '--title' } },
  informe: { crear: ['report', 'create'], bajar: 'report', ext: 'md', opciones: { idioma: '--language', enfoque: '--prompt' } },
  tabla: { crear: ['data-table', 'create'], bajar: 'data-table', ext: 'csv', opciones: { idioma: '--language' }, descripcion: true },
};
const TIPO_NLM = { infografia: 'infographic', presentacion: 'slide_deck', audio: 'audio', video: 'video', mapa: 'mind_map', informe: 'report', tabla: 'data_table' };

function nlm(args, timeout = 180000) {
  const r = ejecutar('nlm', args, { timeout });
  if (r.faltante) throw Object.assign(new Error('Falta el CLI de NotebookLM (nlm). Instálalo y conéctalo: uv tool install notebooklm-mcp-cli && nlm login'), { codigo: 5 });
  if (!r.ok) {
    const auth = /auth|login|cookie|expired|401/i.test(r.error + r.salida);
    throw Object.assign(new Error(auth ? 'La sesión de NotebookLM venció: ejecuta «nlm login».' : `NotebookLM: ${(r.error || r.salida).split('\n').slice(-3).join(' ').trim()}`), { codigo: auth ? 6 : 1 });
  }
  return r.salida;
}

export function listarCuadernos() {
  const j = jsonDe(nlm(['list', 'notebooks', '--json']));
  return (Array.isArray(j) ? j : j?.notebooks || []).map((n) => ({ id: n.id, titulo: n.title || n.titulo || '(sin título)', fuentes: n.source_count ?? '', actualizado: (n.updated_at || '').slice(0, 10) }));
}

const esId = (x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);

// El cuaderno puede venir por --cuaderno (id, alias de nlm o parte del título) o por el vínculo de la
// carpeta actual (okt notebooklm vincular).
export function resolverCuaderno(vault, op, cwd = process.cwd()) {
  let ref = op.cuaderno;
  if (!ref) {
    const vinculos = leerConfigVault(vault).cuadernos || {};
    let rel = posix(relative(vault, cwd));
    if (op.carpeta) rel = op.carpeta;
    let mejor = null;
    for (const [carpeta, v] of Object.entries(vinculos)) if ((rel === carpeta || rel.startsWith(`${carpeta}/`)) && (!mejor || carpeta.length > mejor[0].length)) mejor = [carpeta, v];
    if (!mejor) throw errorUso('¿De qué cuaderno? Usa --cuaderno "<título o id>" o vincula esta carpeta: okt notebooklm vincular <carpeta> "<cuaderno>". Lista: okt notebooklm cuadernos');
    return mejor[1];
  }
  if (esId(ref)) return { id: ref, titulo: ref };
  const cuadernos = listarCuadernos();
  const n = ref.toLowerCase();
  const exactos = cuadernos.filter((c) => c.titulo.toLowerCase() === n);
  const parciales = exactos.length ? exactos : cuadernos.filter((c) => c.titulo.toLowerCase().includes(n));
  if (parciales.length === 1) return { id: parciales[0].id, titulo: parciales[0].titulo };
  if (!parciales.length) return { id: ref, titulo: ref }; // quizá es un alias de nlm
  throw errorUso(`Hay varios cuadernos que coinciden con «${ref}»:\n${parciales.map((c) => `- ${c.titulo}`).join('\n')}\nSé más específico.`);
}

export function cuadernos() {
  const lista = listarCuadernos();
  return { texto: lista.length ? lista.map((c, i) => `${i + 1}. ${c.titulo} · ${c.fuentes} fuentes · ${c.actualizado} · ${c.id}`).join('\n') : 'No hay cuadernos.', datos: lista };
}

export function vincular(vault, carpeta, ref) {
  if (!carpeta || !ref) throw errorUso('Uso: okt notebooklm vincular <carpeta del vault> "<cuaderno>"');
  if (!existsSync(join(vault, carpeta))) throw errorUso(`La carpeta ${carpeta} no existe en el vault.`);
  const c = resolverCuaderno(vault, { cuaderno: ref });
  const cuadernosCfg = { ...(leerConfigVault(vault).cuadernos || {}), [posix(carpeta).replace(/\/$/, '')]: c };
  guardarConfigVault(vault, { cuadernos: cuadernosCfg });
  return { texto: `${carpeta} ↔ ${c.titulo}`, datos: c };
}

const carpetaAdjuntos = (c) => `notebooklm/${limpiarNombre(c.titulo).slice(0, 60) || c.id.slice(0, 8)}`;

export function notas(vault, op) {
  const c = resolverCuaderno(vault, op);
  const j = jsonDe(nlm(['note', 'list', c.id, '--json']));
  const lista = j?.notes || (Array.isArray(j) ? j : []);
  if (!op.seleccion) {
    return { texto: lista.length ? `Notas del cuaderno «${c.titulo}»:\n${lista.map((n, i) => `${i + 1}. ${n.title || '(sin título)'}`).join('\n')}\n\nElige cuáles traer: okt notebooklm notas --cuaderno "${c.titulo}" --seleccion 1,2` : `El cuaderno «${c.titulo}» no tiene notas.`, datos: lista };
  }
  const importadas = [];
  for (const i of parsearSeleccion(op.seleccion, lista.length)) {
    const n = lista[i];
    revisarSensible(n.content || '', op, n.title);
    importadas.push(escribirImportada(vault, { clave: `notebooklm:nota:${n.id}`, titulo: n.title || `Nota de ${c.titulo}`, contenido: n.content || n.preview || '', datos: { origen: 'notebooklm', id_externo: `${c.id}/${n.id}`, cuaderno: c.titulo }, op }));
  }
  return { texto: `NotebookLM: ${importadas.length} notas traídas.\n${importadas.map((x) => `- ${x.ruta} (${x.accion})`).join('\n')}`, datos: importadas };
}

export function preguntar(vault, pregunta, op) {
  if (!pregunta) throw errorUso('Uso: okt notebooklm preguntar "<pregunta>" [--cuaderno …]');
  const c = resolverCuaderno(vault, op);
  const salida = nlm(['query', 'notebook', c.id, pregunta, '--json', '--timeout', '240'], 300000);
  const j = jsonDe(salida) || {};
  const respuesta = String(j.answer ?? j.response ?? j.text ?? j.content ?? (typeof j === 'string' ? j : salida)).trim();
  // nlm devuelve references: [{ citation_number, source_id, cited_text }]; el id se traduce a título y URL.
  const refs = Array.isArray(j.references) ? j.references : [];
  let fuentes = [];
  if (refs.length) {
    const lista = jsonDe(nlm(['source', 'list', c.id, '--json'])) || [];
    const porId = new Map((Array.isArray(lista) ? lista : lista.sources || []).map((s) => [s.id, s]));
    fuentes = refs
      .sort((a, b) => (a.citation_number ?? 0) - (b.citation_number ?? 0))
      .map((r) => {
        const s = porId.get(r.source_id) || {};
        const cita = String(r.cited_text || '').replace(/\s+/g, ' ').trim();
        return `[${r.citation_number}] ${s.title || r.source_id}${s.url ? ` (${s.url})` : ''}${cita ? `: «${cita.slice(0, 200)}${cita.length > 200 ? '…' : ''}»` : ''}`;
      });
  } else {
    fuentes = [].concat(j.sources || []).map((s) => (typeof s === 'string' ? s : s.title || s.name || '')).filter(Boolean);
  }
  revisarSensible(respuesta, op, pregunta);
  const contenido = `**Pregunta:** ${pregunta}\n\n**Cuaderno:** ${c.titulo}\n\n${respuesta}${fuentes.length ? `\n\n**Fuentes citadas por NotebookLM:**\n${[...new Set(fuentes)].map((f) => `- ${f}`).join('\n')}` : ''}\n\n> Respuesta generada por NotebookLM: es una síntesis, no evidencia. Verifica en las fuentes antes de pasarla a 30-Conocimiento.`;
  const res = escribirImportada(vault, { clave: `notebooklm:pregunta:${c.id}:${fechaISO()}:${pregunta.slice(0, 60)}`, titulo: `NotebookLM - ${pregunta.slice(0, 70)}`, contenido, datos: { origen: 'notebooklm', id_externo: c.id, cuaderno: c.titulo }, op });
  return { texto: `${respuesta}\n\n→ Guardado en ${res.ruta}`, datos: { respuesta, fuentes, ...res } };
}

function estadoEstudio(c) {
  const j = jsonDe(nlm(['studio', 'status', c.id, '--json']));
  return Array.isArray(j) ? j : j?.artifacts || [];
}

export function estado(vault, op) {
  const c = resolverCuaderno(vault, op);
  const lista = estadoEstudio(c);
  return { texto: lista.length ? lista.map((a) => `- ${a.type} · ${a.status} · ${a.artifact_id || a.id}`).join('\n') : 'Sin contenidos de Studio.', datos: lista };
}

// Convierte lo descargado en algo que Obsidian muestre bien.
function contenidoDescargado(abs, nombre, tipo) {
  if (tipo === 'informe') return readFileSync(abs, 'utf8');
  if (tipo === 'mapa') {
    const j = jsonDe(readFileSync(abs, 'utf8'));
    const lineas = [];
    const recorrer = (n, nivel) => {
      if (!n) return;
      const t = n.name || n.title || n.text || n.label;
      if (t) lineas.push(`${'  '.repeat(nivel)}- ${t}`);
      for (const h of n.children || n.nodes || []) recorrer(h, t ? nivel + 1 : nivel);
    };
    recorrer(j?.mind_map || j?.root || j, 0);
    return `${lineas.join('\n') || '(mapa vacío)'}\n\nOriginal: [[${nombre}]]`;
  }
  if (tipo === 'tabla') {
    const filas = readFileSync(abs, 'utf8').trim().split(/\r?\n/).map((l) => l.split(',').map((x) => x.replace(/^"|"$/g, '').replace(/\|/g, '\\|')));
    if (!filas.length) return `[[${nombre}]]`;
    return [`| ${filas[0].join(' | ')} |`, `| ${filas[0].map(() => '---').join(' | ')} |`, ...filas.slice(1).map((f) => `| ${f.join(' | ')} |`)].join('\n') + `\n\nOriginal: [[${nombre}]]`;
  }
  return `![[${nombre}]]`;
}

export function descargar(vault, tipo, op) {
  const def = ESTUDIO[tipo];
  if (!def) throw errorUso(`Tipo de Studio desconocido: ${tipo}. Tipos: ${Object.keys(ESTUDIO).join(', ')}`);
  const c = op._cuaderno || resolverCuaderno(vault, op);
  let id = op.id;
  if (!id) {
    const listos = estadoEstudio(c).filter((a) => a.type === TIPO_NLM[tipo] && a.status === 'completed');
    if (!listos.length) throw new Error(`No hay ${tipo} terminado en «${c.titulo}». Créalo con: okt notebooklm crear ${tipo}`);
    id = listos[0].artifact_id || listos[0].id;
  }
  const subcarpeta = carpetaAdjuntos(c);
  const dir = join(vault, '40-Fuentes', 'adjuntos', ...subcarpeta.split('/'));
  mkdirSync(dir, { recursive: true });
  let nombre = `${limpiarNombre(`${tipo} ${c.titulo}`).slice(0, 80)} ${fechaISO()}.${def.ext}`;
  for (let i = 2; existsSync(join(dir, nombre)); i++) nombre = nombre.replace(/( \d+)?\.(\w+)$/, ` ${i}.$2`);
  // Se baja primero a la caché: solo pasa a adjuntos si no parece traer datos de pacientes.
  const cache = join(vault, '.cerebro', 'cache', 'notebooklm');
  mkdirSync(cache, { recursive: true });
  const temporal = join(cache, `${id}.${def.ext}`);
  nlm(['download', def.bajar, c.id, '--output', temporal, '--id', id], 600000);
  if (!existsSync(temporal)) throw new Error('NotebookLM no entregó el archivo.');
  const convertido = contenidoDescargado(temporal, nombre, tipo);
  try {
    revisarSensible(convertido, op, `${tipo} de ${c.titulo}`);
  } catch (e) {
    rmSync(temporal, { force: true });
    throw e;
  }
  const abs = join(dir, nombre);
  renameSync(temporal, abs);
  const contenido = `${convertido}\n\nCuaderno: ${c.titulo} · ${tipo} · ${fechaISO()} · \`${rutaAdjunto(subcarpeta, nombre)}\``;
  const res = escribirImportada(vault, { clave: `notebooklm:${tipo}:${id}`, titulo: `${tipo[0].toUpperCase()}${tipo.slice(1)} - ${c.titulo}`, contenido, datos: { origen: 'notebooklm', id_externo: `${c.id}/${id}`, cuaderno: c.titulo, adjunto: `[[${nombre}]]` }, op });
  return { texto: `Descargado ${basename(abs)} → nota ${res.ruta} (${res.accion}).`, datos: { archivo: posix(relative(vault, abs)), ...res } };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function crear(vault, tipo, op) {
  const def = ESTUDIO[tipo];
  if (!def) throw errorUso(`Tipo de Studio desconocido: ${tipo}. Tipos: ${Object.keys(ESTUDIO).join(', ')}`);
  const c = resolverCuaderno(vault, op);
  const args = [...def.crear, c.id];
  if (def.descripcion) {
    if (!op.descripcion) throw errorUso('La tabla necesita --descripcion "<qué tabla quieres>".');
    args.push(op.descripcion);
  }
  if (!op.idioma && def.opciones.idioma) op.idioma = 'es';
  for (const [k, flag] of Object.entries(def.opciones)) if (op[k]) args.push(flag, String(op[k]));
  args.push('--confirm', '--json');
  const j = jsonDe(nlm(args, 300000)) || {};
  const id = j.artifact_id || j.id || j.artifact?.id;
  if (!id) throw new Error('NotebookLM no devolvió el id del contenido creado.');
  const esperar = Number(op.esperar ?? 600) * 1000;
  const intervalo = Number(process.env.OKT_INTERVALO_MS || 15000);
  const limite = Date.now() + esperar;
  for (;;) {
    const a = estadoEstudio(c).find((x) => (x.artifact_id || x.id) === id);
    if (a?.status === 'completed') return descargar(vault, tipo, { ...op, id, _cuaderno: c });
    if (a && /fail|error/i.test(a.status)) throw new Error(`NotebookLM no pudo crear el ${tipo} (${a.status}).`);
    if (Date.now() >= limite) {
      return { texto: `El ${tipo} sigue en proceso en NotebookLM (id ${id}). Cuando esté listo: okt notebooklm descargar ${tipo} --cuaderno "${c.titulo}" --id ${id}`, datos: { id, pendiente: true }, codigo: 0 };
    }
    await dormir(intervalo);
  }
}

export const TIPOS_ESTUDIO = Object.keys(ESTUDIO);
