// okt importar url "<enlace>" y okt importar enlaces. Traen al vault, sin pasar por el modelo:
// - una página web completa con Defuddle (el motor de Obsidian Web Clipper), con sus imágenes descargadas;
// - la transcripción de un video de YouTube con yt-dlp (solo los subtítulos: el video no se descarga);
// - un enlace de Drive, con importarDrive (un video de Drive tampoco se descarga).
// Todo entra a la Bandeja en bruto, entre marcas okt, para ordenarlo al procesarla. «enlaces» completa en su
// lugar las capturas de la Bandeja que solo traen una url (las de Telegram): lo lanza el hook de inicio en segundo
// plano, así que la sesión no lo espera.
import { readFileSync, utimesSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ejecutar, jsonDe } from './binarios.mjs';
import { errorUso, escribirImportada, descargarAdjunto } from './importacion.mjs';
import { importarDrive, idDeDrive } from './importar-drive.mjs';
import { C } from './estructura.mjs';
import { listarArchivos, leerNota } from './vault.mjs';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { spawn } from 'node:child_process';
import { CLI, sobrescribir, tomarCandado, rutaCandado } from './rutas.mjs';
import { cerrar } from './sistema.mjs';

const MAX_IMAGENES = 40; // shortcut: las imágenes que pasan de aquí quedan enlazadas a la web; subirlo si hace falta
const PARRAFO_MS = 60000; // la transcripción se agrupa en párrafos de un minuto, cada uno con su marca de tiempo
const ESPERA_CANDADO_MS = 10 * 60000; // a mano se espera al proceso de segundo plano en vez de fallar
const IMAGEN_MD = /!\[([^\]]*)\]\(((?:\\\)|[^)\s])+)(?:\s+"[^"]*")?\)/g;

const dos = (n) => String(n).padStart(2, '0');

export function idDeYoutube(url) {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function tipoDeUrl(url) {
  if (idDeYoutube(url)) return 'youtube';
  if (/^https?:\/\/(drive|docs)\.google\.com\//i.test(url) && idDeDrive(url)) return 'drive';
  return 'web';
}

function cli(nombre, args, como) {
  const r = ejecutar(nombre, args, { timeout: 120000 });
  if (r.faltante) throw Object.assign(new Error(`Falta ${nombre}. Instálalo: ${como}`), { codigo: 5 });
  if (!r.ok) throw new Error(`${nombre}: ${(r.error || r.salida).split('\n').filter(Boolean).pop() || 'falló'}`);
  return r.salida;
}

// ---------- web ----------

async function web(vault, url) {
  const j = jsonDe(cli('defuddle', ['parse', url, '--json', '--md'], 'npm install -g defuddle'));
  if (!String(j?.content || '').trim()) throw new Error('la página no devolvió contenido (¿muro de pago, o se arma con JavaScript?)');
  const titulo = String(j.title || new URL(url).hostname).trim();
  const imagenes = new Map(); // markdown original → ![[adjunto]]
  for (const m of j.content.matchAll(IMAGEN_MD)) {
    if (imagenes.has(m[0]) || imagenes.size >= MAX_IMAGENES) continue;
    let src;
    try {
      src = new URL(m[2].replace(/\\([()])/g, '$1'), url).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(src)) continue;
    try {
      imagenes.set(m[0], `![[${await descargarAdjunto(vault, src, 'web', `${titulo} ${imagenes.size + 1}`)}]]`);
    } catch {
      // Sin descargar, la imagen queda enlazada a la web.
    }
  }
  const md = j.content.replace(IMAGEN_MD, (todo) => imagenes.get(todo) ?? todo);
  const publicado = j.published ? String(j.published).slice(0, 10) : '';
  const datos = { url, ...(j.author ? { autor: String(j.author) } : {}), ...(publicado ? { publicado } : {}) };
  const cabecera = [`**${titulo}**`, [...new Set([j.site, j.author, publicado].filter(Boolean))].join(' · '), url].filter(Boolean).join('\n');
  return { clave: `web:${url}`, titulo, datos, contenido: `${cabecera}\n\n${md.trim()}` };
}

// ---------- YouTube ----------

const json3 = (formatos) => (formatos || []).find((f) => f.ext === 'json3');

// Subtítulos manuales antes que automáticos; el idioma del video, luego español, luego inglés. En los automáticos,
// «<idioma>-orig» es el reconocimiento de voz original (los demás son traducciones automáticas).
export function elegirPista(info) {
  const lang = info.language;
  const manual = info.subtitles || {};
  const claves = Object.keys(manual).filter((k) => k !== 'live_chat');
  const m = [lang, claves.find((k) => k.startsWith('es')), claves.find((k) => k.startsWith('en')), claves[0]].find((k) => k && claves.includes(k) && json3(manual[k]));
  if (m) return { url: json3(manual[m]).url, idioma: m, automatica: false };
  const auto = info.automatic_captions || {};
  const a = [lang && `${lang}-orig`, Object.keys(auto).find((k) => k.endsWith('-orig')), lang, 'es', 'en'].find((k) => k && json3(auto[k]));
  return a ? { url: json3(auto[a]).url, idioma: a.replace(/-orig$/, ''), automatica: true } : null;
}

export function reloj(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${dos(m)}` : m}:${dos(s % 60)}`;
}

// Subtítulos json3 de YouTube → párrafos de un minuto (por capítulo, si el video los tiene), cada uno con su marca
// de tiempo enlazada a ese momento del video.
export function transcripcion(datos, { id, capitulos = [] } = {}) {
  const enlace = (ms) => `[${reloj(ms)}](https://youtu.be/${id}?t=${Math.floor(ms / 1000)})`;
  const bloques = [];
  let cap = -1;
  let parrafo = null;
  for (const e of datos.events || []) {
    const texto = (e.segs || []).map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const ms = e.tStartMs || 0;
    while (cap + 1 < capitulos.length && ms >= capitulos[cap + 1].start_time * 1000) {
      cap++;
      bloques.push({ titulo: capitulos[cap].title, ms: capitulos[cap].start_time * 1000, parrafos: [] });
      parrafo = null;
    }
    if (!bloques.length) bloques.push({ parrafos: [] });
    if (!parrafo || ms - parrafo.ms >= PARRAFO_MS) {
      parrafo = { ms, textos: [] };
      bloques.at(-1).parrafos.push(parrafo);
    }
    parrafo.textos.push(texto);
  }
  return bloques
    .filter((b) => b.parrafos.length)
    .map((b) => [b.titulo ? `### ${enlace(b.ms)} ${b.titulo}` : '', ...b.parrafos.map((p) => `${enlace(p.ms)} ${p.textos.join(' ')}`)].filter(Boolean).join('\n\n'))
    .join('\n\n');
}

async function youtube(vault, url) {
  const id = idDeYoutube(url);
  const video = `https://www.youtube.com/watch?v=${id}`;
  // -J: solo los datos del video (incluidas las url de cada pista de subtítulos). Pedir las pistas con
  // --write-auto-subs baja también decenas de traducciones automáticas y YouTube responde 429.
  const info = jsonDe(cli('yt-dlp', ['-J', '--skip-download', '--no-playlist', '--no-warnings', '--js-runtimes', 'node', video], 'uv tool install yt-dlp'));
  if (!info) throw new Error('yt-dlp no devolvió los datos del video');
  const pista = elegirPista(info);
  let texto = '';
  if (pista) {
    const r = await fetch(pista.url, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`subtítulos de YouTube: HTTP ${r.status}`);
    texto = transcripcion(await r.json(), { id, capitulos: info.chapters || [] });
  }
  const titulo = String(info.title || id).trim();
  const u = String(info.upload_date || '');
  const publicado = /^\d{8}$/.test(u) ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : '';
  const datos = { url: video, ...(info.channel ? { autor: String(info.channel) } : {}), ...(publicado ? { publicado } : {}) };
  const meta = [info.channel, publicado, info.duration ? reloj(info.duration * 1000) : ''].filter(Boolean).join(' · ');
  const cuerpo = texto
    ? `## Transcripción${pista.automatica ? ' automática' : ''} (${pista.idioma}, en bruto)\n\n${pista.automatica ? '> Subtítulos automáticos de YouTube: revisa nombres y cifras.\n\n' : ''}${texto}`
    : '## Transcripción\n\nEl video no tiene subtítulos. Para su contenido, agrégalo como fuente de un cuaderno de NotebookLM (skill notebooklm).';
  return { clave: `youtube:${id}`, titulo, datos, contenido: `![](${video})\n\n**${titulo}**\n${meta}\n\n${cuerpo}`, sinSubtitulos: !texto };
}

// ---------- comandos ----------

// op.ruta: la captura de la Bandeja que se completa en su lugar (conserva su nombre y su origen).
export async function importarUrl(vault, url, op = {}) {
  const enlace = String(url || '').trim();
  if (!/^https?:\/\//i.test(enlace)) throw errorUso('Uso: okt importar url "<enlace web, de YouTube o de Drive>" [--carpeta <destino>]');
  const tipo = tipoDeUrl(enlace);
  if (tipo === 'drive') {
    const r = await importarDrive(vault, enlace, { ...op, aplicar: true });
    const nota = r.datos.importadas?.[0];
    // Una carpeta de Drive se lista y espera una selección: desde la Bandeja no hay a quién preguntarle.
    if (op.ruta && !nota) throw new Error('es una carpeta de Drive: impórtala a mano con okt importar drive "<enlace>" --seleccion 1,3');
    if (op.ruta && nota) escribirImportada(vault, { clave: `enlace:${enlace}`, contenido: `Importado de Drive: [[${nota.ruta.split('/').pop().replace(/\.md$/, '')}]]`, ruta: op.ruta });
    return { ...r, datos: { ...r.datos, tipo } };
  }
  const res = tipo === 'youtube' ? await youtube(vault, enlace) : await web(vault, enlace);
  const datos = op.ruta ? res.datos : { origen: tipo, ...(op.carpeta ? { tipo: 'fuente' } : {}), ...res.datos };
  const nota = escribirImportada(vault, { clave: res.clave, titulo: res.titulo, contenido: res.contenido, datos, ruta: op.ruta, op });
  return { texto: `${tipo === 'youtube' ? 'YouTube' : 'Web'} → ${nota.ruta} (${nota.accion}${res.sinSubtitulos ? ', sin subtítulos' : ''}).`, datos: { ...nota, tipo } };
}

// Capturas de la Bandeja con url que todavía no se trajeron (las que fallaron, solo con --reintentar).
export function enlacesPendientes(vault, { reintentar = false } = {}) {
  return listarArchivos(vault)
    .filter((r) => r.startsWith(`${C.bandeja}/`) && r.endsWith('.md'))
    .map((r) => leerNota(vault, r))
    .filter((n) => n.datos.tipo === 'captura' && n.datos.url && !n.datos.importado && (reintentar || !n.datos.importar_error));
}

function anotarError(vault, rel, mensaje) {
  const abs = join(vault, rel);
  if (!existsSync(abs)) return; // se procesó o se archivó mientras tanto
  const { datos, cuerpo } = leerFrontmatter(readFileSync(abs, 'utf8'));
  sobrescribir(abs, escribirFrontmatter({ ...datos, importar_error: String(mensaje).slice(0, 200) }, cuerpo));
}

// Al empezar a trabajar en el vault (hooks de inicio y tarea del IDE): si hay enlaces pendientes, los trae un proceso
// aparte, desacoplado, para que la sesión no lo espere. OKT_SIN_SEGUNDO_PLANO=1 (las pruebas) no lo lanza.
export function lanzarSegundoPlano(vault) {
  if (!enlacesPendientes(vault).length) return null;
  const args = [CLI, 'importar', 'enlaces', '--silencioso', '--vault', vault];
  if (process.env.OKT_SIN_SEGUNDO_PLANO !== '1') spawn(process.execPath, args, { cwd: vault, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return args;
}

// okt importar enlaces [--reintentar] [--silencioso]. --silencioso (el proceso de segundo plano del hook) no espera
// ni falla si otro proceso ya los está trayendo.
export async function importarEnlaces(vault, op = {}) {
  const vacio = { texto: '', datos: { listos: [], fallidos: [] } };
  let soltar;
  try {
    soltar = tomarCandado(vault, 'enlaces', 'Otro proceso está trayendo los enlaces: vuelve a intentarlo en un momento.', { esperarMs: op.silencioso ? 0 : ESPERA_CANDADO_MS });
  } catch (e) {
    if (op.silencioso) return vacio;
    throw e;
  }
  try {
    const listos = [];
    const fallidos = [];
    for (const n of enlacesPendientes(vault, op)) {
      try {
        await importarUrl(vault, n.datos.url, { ruta: n.rel });
        listos.push(n.rel);
      } catch (e) {
        anotarError(vault, n.rel, e.message);
        fallidos.push({ ruta: n.rel, error: e.message });
      }
      // Un candado sin tocar por 5 min se da por muerto: se renueva en cada enlace.
      const candado = rutaCandado(vault, 'enlaces');
      if (existsSync(candado)) utimesSync(candado, new Date(), new Date());
    }
    if (listos.length) cerrar(vault, 'importar', `${listos.length} enlaces traídos a la bandeja`);
    if (!listos.length && !fallidos.length) return { ...vacio, texto: op.silencioso ? '' : 'No hay enlaces pendientes en la Bandeja.' };
    const texto = [`Enlaces: ${listos.length} traídos${fallidos.length ? `, ${fallidos.length} con error (quedan con importar_error; reintenta con --reintentar)` : ''}.`, ...listos.map((r) => `- ${r}`), ...fallidos.map((f) => `- ✖ ${f.ruta}: ${f.error}`)].join('\n');
    return { texto, datos: { listos, fallidos }, codigo: fallidos.length && !listos.length ? 1 : 0 };
  } finally {
    soltar();
  }
}
