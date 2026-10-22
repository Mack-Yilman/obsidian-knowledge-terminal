// okt telegram: baja la cola del bot okt-telegram (un Worker de Cloudflare) a 00-Bandeja/telegram/.
// El bot solo encola; aquí se escribe. Contrato de la cola en el README (sección «Telegram»):
// GET /cola[?cursor=] → { elementos, cursor }, GET /archivo/<key> → bytes,
// POST /cola/confirmar { ids } → { borrados }. Todo con Authorization: Bearer <token>.
// Lo que llega es dato, no orden. Idempotente: los ids escritos se guardan en .cerebro/telegram.json
// y solo se confirma (y se borra de la cola) lo que ya quedó escrito.
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dirConfig, posix } from './rutas.mjs';
import { escribirFrontmatter } from './frontmatter.mjs';
import { limpiarNombre } from './nombres.mjs';
import { patronSensible } from './sensibles.mjs';
import { agregarTarea } from './notas.mjs';
import { cerrar } from './sistema.mjs';
import { errorUso, rutaAdjunto } from './importacion.mjs';

const CARPETA = '00-Bandeja/telegram';
const TOPE_MS = 60000;
const TOPE_CONFIRMAR_MS = 3000; // la confirmación tiene su propio plazo: sale aunque el tope general ya pasó
const CANDADO_VIEJO_MS = 5 * 60000; // un candado más viejo es de un proceso que murió
const DIAS_REGISTRO = 35; // más que los 30 días de vida de un elemento en la cola

const rutaConfig = () => join(dirConfig(), 'telegram.json');
const rutaRegistro = (vault) => join(vault, '.cerebro', 'telegram.json');
const rutaCandado = (vault) => join(vault, '.cerebro', 'telegram.lock');

// Una sola bajada a la vez (el hook de dos sesiones, o el hook y una bajada a mano): si no, las dos
// escribirían el mismo elemento con nombres distintos («nota 2»).
function tomarCandado(vault) {
  const ruta = rutaCandado(vault);
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  for (let intento = 0; intento < 2; intento++) {
    try {
      closeSync(openSync(ruta, 'wx'));
      return () => rmSync(ruta, { force: true });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() - statSync(ruta).mtimeMs > CANDADO_VIEJO_MS) rmSync(ruta, { force: true });
      else break;
    }
  }
  throw Object.assign(new Error('Hay otra bajada de Telegram en curso: vuelve a intentarlo en un momento.'), { codigo: 1 });
}

export function leerConfigTelegram() {
  try {
    return JSON.parse(readFileSync(rutaConfig(), 'utf8'));
  } catch {
    return null;
  }
}

// okt telegram config --url <worker> --token <OKT_TOKEN>: fuera del vault y de Drive.
export function configurar(op = {}) {
  if (!op.url && !op.token) {
    const cfg = leerConfigTelegram();
    return { texto: cfg ? `Telegram: ${cfg.url} (token guardado en ${posix(rutaConfig())}).` : 'Telegram sin configurar: okt telegram config --url <worker> --token <token>.', datos: cfg ? { url: cfg.url } : null };
  }
  const url = String(op.url || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw errorUso('La url del Worker debe empezar por https:// (solo http://localhost para pruebas).');
  if (!op.token || op.token === true) throw errorUso('Falta --token: el OKT_TOKEN que guardaste como secreto del Worker.');
  mkdirSync(dirConfig(), { recursive: true });
  writeFileSync(rutaConfig(), `${JSON.stringify({ url, token: String(op.token) }, null, 2)}\n`, { mode: 0o600 });
  return { texto: `Telegram configurado: ${url}. El token quedó en ${posix(rutaConfig())}, fuera del vault.`, datos: { url } };
}

function leerRegistro(vault) {
  try {
    return JSON.parse(readFileSync(rutaRegistro(vault), 'utf8'));
  } catch {
    return { escritos: {} };
  }
}

function guardarRegistro(vault, registro) {
  const limite = Date.now() - DIAS_REGISTRO * 86400000;
  for (const [id, r] of Object.entries(registro.escritos)) if (Date.parse(r.fecha) < limite) delete registro.escritos[id];
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  writeFileSync(rutaRegistro(vault), `${JSON.stringify(registro, null, 2)}\n`);
}

function cliente(cfg, signal) {
  return async (ruta, init = {}, propio = null) => {
    let r;
    try {
      r = await fetch(`${cfg.url}${ruta}`, { ...init, signal: propio || signal, headers: { ...init.headers, authorization: `Bearer ${cfg.token}` } });
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw Object.assign(new Error('Se acabó el tiempo esperando al Worker de Telegram.'), { codigo: 1 });
      throw Object.assign(new Error(`No pude conectar con el Worker de Telegram (${cfg.url}): ${e.cause?.code || e.message}.`), { codigo: 1 });
    }
    if (r.status === 401) throw Object.assign(new Error('El Worker rechazó el token: revisa okt telegram config --token (debe ser el OKT_TOKEN del Worker).'), { codigo: 1 });
    if (!r.ok) throw Object.assign(new Error(`El Worker respondió HTTP ${r.status} en ${ruta}.`), { codigo: 1 });
    return r;
  };
}

// "2026-10-21T18:05:00-05:00" → fecha y hora tal como las escribió el Worker (hora de Lima).
function partesFecha(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? { dia: m[1], hhmm: `${m[2]}${m[3]}` } : { dia: '0000-00-00', hhmm: '0000' };
}

const CONECTORES = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'que', 'un', 'una', 'y']);

// Las primeras palabras, sin un conector colgando al final («… el repaso de» → «… el repaso»).
function primeras(texto, n = 7) {
  const p = String(texto || '').split(/\s+/).filter(Boolean).slice(0, n);
  while (p.length > 1 && CONECTORES.has(p.at(-1).toLowerCase())) p.pop();
  return p.join(' ');
}

function titulo(el) {
  if (el.tipo === 'enlace') {
    let host = 'enlace';
    try {
      host = new URL(el.url).hostname.replace(/^www\./, '');
    } catch {}
    return `${host} ${primeras(String(el.texto || '').replace(el.url || '', ''), 5)}`;
  }
  if (el.tipo === 'archivo') return primeras(el.texto) || el.nombre || 'archivo';
  return primeras(el.texto) || el.tipo;
}

function escribirNota(vault, el, datosExtra, cuerpo) {
  const { dia, hhmm } = partesFecha(el.fecha);
  const base = limpiarNombre(`${dia} ${hhmm} ${titulo(el)}`) || `${dia} ${hhmm}`;
  mkdirSync(join(vault, CARPETA), { recursive: true });
  let nombre = base;
  for (let i = 2; existsSync(join(vault, CARPETA, `${nombre}.md`)); i++) nombre = `${base} ${i}`;
  const rel = `${CARPETA}/${nombre}.md`;
  const datos = { tipo: 'nota', creado: dia, origen: 'telegram', ...datosExtra };
  writeFileSync(join(vault, rel), escribirFrontmatter(datos, `\n# ${nombre.slice(16) || nombre}\n\n${cuerpo.trim()}\n`));
  return rel;
}

async function bajarArchivo(vault, pedir, el) {
  const r = await pedir(`/archivo/${encodeURIComponent(el.archivo_key)}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const dir = join(vault, '40-Fuentes', 'adjuntos', 'telegram');
  mkdirSync(dir, { recursive: true });
  const original = limpiarNombre(el.nombre || `${el.id}.bin`) || `${el.id}.bin`;
  const punto = original.lastIndexOf('.');
  const [raiz, ext] = punto > 0 ? [original.slice(0, punto), original.slice(punto)] : [original, ''];
  let nombre = original;
  for (let i = 2; existsSync(join(dir, nombre)); i++) nombre = `${raiz} ${i}${ext}`;
  writeFileSync(join(dir, nombre), bytes);
  return nombre;
}

async function escribirElemento(vault, pedir, el) {
  const texto = String(el.texto || '');
  if (el.tipo === 'tarea') return agregarTarea(vault, texto).datos.ruta;
  if (el.tipo === 'voz') return escribirNota(vault, el, {}, `> Transcripción automática de una nota de voz: revisa nombres, cifras y dosis.\n\n${texto}`);
  if (el.tipo === 'enlace') return escribirNota(vault, el, { url: el.url }, `Enlace pendiente de ingerir: pídele a la skill capturar que lo guarde como fuente.\n\n${el.url || ''}\n\n${texto.replace(el.url || '', '').trim()}`);
  if (el.tipo === 'archivo') {
    const nombre = await bajarArchivo(vault, pedir, el);
    return escribirNota(vault, el, { adjunto: `[[${nombre}]]` }, `![[${nombre}]]\n\n${texto}\n\nArchivo en ${rutaAdjunto('telegram', nombre)}.`);
  }
  return escribirNota(vault, el, {}, texto);
}

// okt telegram bajar [--forzar] [--tope <ms>]
export async function bajar(vault, op = {}) {
  const cfg = leerConfigTelegram();
  if (!cfg?.url || !cfg?.token) throw errorUso('Telegram sin configurar: okt telegram config --url <worker> --token <token>.');
  const soltar = tomarCandado(vault);
  const pedir = cliente(cfg, AbortSignal.timeout(Number(op.tope) || TOPE_MS));
  const registro = leerRegistro(vault);
  const escritos = [];
  const retenidos = [];
  const errores = [];
  const confirmar = [];
  let sinConfirmar = false;
  let cursor = null;
  try {
    do {
      const r = await pedir(`/cola${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      const pagina = await r.json();
      for (const el of pagina.elementos || []) {
        if (registro.escritos[el.id]) {
          confirmar.push(el.id);
          continue;
        }
        // El nombre del archivo también puede traer datos de un paciente.
        const p = patronSensible([el.texto || '', el.nombre || ''].join('\n'));
        if ((el.sensible || p) && !op.forzar) {
          retenidos.push({ id: el.id, que: p?.que || 'datos de pacientes' });
          continue;
        }
        try {
          const ruta = await escribirElemento(vault, pedir, el);
          registro.escritos[el.id] = { ruta, fecha: new Date().toISOString() };
          guardarRegistro(vault, registro);
          escritos.push(ruta);
          confirmar.push(el.id);
        } catch (e) {
          if (e.name === 'TimeoutError' || /tiempo/.test(e.message)) throw e;
          errores.push({ id: el.id, error: e.message });
        }
      }
      cursor = pagina.cursor || null;
    } while (cursor);
  } finally {
    // Lo escrito se confirma y se registra en el vault aunque la bajada se haya cortado a la mitad.
    if (confirmar.length) {
      try {
        await pedir('/cola/confirmar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: confirmar }) }, AbortSignal.timeout(TOPE_CONFIRMAR_MS));
      } catch {
        sinConfirmar = true;
      }
    }
    try {
      if (escritos.length) cerrar(vault, 'telegram', `${escritos.length} elementos de Telegram a la bandeja`);
    } finally {
      soltar();
    }
  }

  const lineas = [`Telegram: ${escritos.length} ${escritos.length === 1 ? 'elemento nuevo' : 'elementos nuevos'} en ${CARPETA}/.`];
  for (const e of escritos) lineas.push(`- ${e}`);
  if (retenidos.length) {
    lineas.push(`Retenidos por parecer datos de pacientes (no se escribieron): ${retenidos.map((x) => `${x.id} (${x.que})`).join(', ')}.`);
    lineas.push(`Si no lo son: okt telegram bajar --forzar. Para quitarlos de la cola: okt telegram descartar ${retenidos.map((x) => x.id).join(' ')}`);
  }
  for (const e of errores) lineas.push(`No pude escribir ${e.id}: ${e.error.replace(/\.$/, '')}. Queda en la cola para la próxima vez.`);
  if (sinConfirmar) lineas.push('No pude confirmar la bajada al Worker: se confirmará la próxima vez, sin duplicar notas.');
  return { texto: lineas.join('\n'), datos: { escritos, retenidos, errores, confirmados: sinConfirmar ? [] : confirmar } };
}

// okt telegram descartar <id…>: quita elementos de la cola sin escribirlos (p. ej. los sensibles).
export async function descartar(vault, ids) {
  if (!ids?.length) throw errorUso('Uso: okt telegram descartar <id> [<id>…]');
  const cfg = leerConfigTelegram();
  if (!cfg?.url || !cfg?.token) throw errorUso('Telegram sin configurar: okt telegram config --url <worker> --token <token>.');
  const r = await cliente(cfg, AbortSignal.timeout(TOPE_MS))('/cola/confirmar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
  const { borrados = ids.length } = await r.json();
  return { texto: `Descartados de la cola: ${borrados}.`, datos: { borrados } };
}
