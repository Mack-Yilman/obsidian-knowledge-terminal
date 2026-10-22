// Hooks de Claude Code y fichas de sesión. Nada de esto usa el modelo: solo git, el transcript
// (nombres de archivos editados) y el historial de agy (cuántos pedidos, nunca su texto).
// Los hooks nunca fallan: ante cualquier error, salen en silencio.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { leerConfigGlobal, guardarConfigGlobal, leerConfigVault, guardarConfigVault, esVault, dentroDe, dirConfig, CLI, posix } from './rutas.mjs';
import { leerBloque, reemplazarBloque } from './bloques.mjs';
import { escribirFrontmatter } from './frontmatter.mjs';
import { ahora, fechaISO, horaCorta } from './fechas.mjs';
import { cambiosDesde } from './git.mjs';
import { pareceSensible } from './sensibles.mjs';
import { limpiarNombre } from './nombres.mjs';
import { textoAgents } from './init.mjs';
import { bajar as bajarTelegram, leerConfigTelegram } from './telegram.mjs';

const TOPE_TELEGRAM_MS = 10000; // el hook tiene 15 s: la sesión nunca espera más que esto
const TOPE_CONTEXTO = 9500; // Claude Code recorta en silencio lo que pase de 10 000 caracteres.
const HERRAMIENTAS_DE_EDICION = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function leerEntrada(texto) {
  try {
    return JSON.parse(texto || '{}');
  } catch {
    return {};
  }
}

function vaultGlobal() {
  const { vault } = leerConfigGlobal();
  return vault && esVault(vault) ? resolve(vault) : null;
}

// Si el plugin cambió de ruta (actualización), renueva la ruta del CLI en la config y en AGENTS.md.
function renovarRutaCli(vault) {
  const cfg = leerConfigGlobal();
  const actual = posix(CLI);
  if (cfg.cli === actual) return;
  guardarConfigGlobal({ cli: actual });
  const ruta = join(vault, 'AGENTS.md');
  if (!existsSync(ruta)) return;
  const areas = (leerConfigVault(vault).areas || []).map((a) => `[[${a}]]`).join(', ');
  const nuevo = leerBloque(textoAgents({ fecha: fechaISO(), areas, cli: actual }));
  writeFileSync(ruta, reemplazarBloque(readFileSync(ruta, 'utf8'), nuevo));
}

const archivoSesion = (id) => join(dirConfig(), 'sesiones', `${String(id).replace(/[^\w-]/g, '')}.json`);

// Si Telegram está configurado, baja la cola; un error o el tope de tiempo no frenan la sesión.
async function lineaTelegram(vault) {
  if (!leerConfigTelegram()) return '';
  try {
    // Cada archivo tarda ~5 s: solo se empieza uno si quedan 6 s del tope; los demás esperan a la bajada a mano.
    const r = await bajarTelegram(vault, { tope: TOPE_TELEGRAM_MS, reservaArchivo: 6000 });
    const { escritos, retenidos, errores, diferidos } = r.datos;
    return escritos.length || retenidos.length || errores.length || diferidos.length ? `${r.texto}\n\n` : '';
  } catch {
    return '';
  }
}

export async function hookInicio(entradaTexto) {
  try {
    const e = leerEntrada(entradaTexto);
    const vault = vaultGlobal();
    if (!vault) return '';
    renovarRutaCli(vault);
    if (e.session_id) {
      mkdirSync(join(dirConfig(), 'sesiones'), { recursive: true });
      writeFileSync(archivoSesion(e.session_id), JSON.stringify({ inicio: Date.now(), cwd: e.cwd || '' }));
    }
    if (!e.cwd || !dentroDe(vault, e.cwd)) return '';
    const hot = existsSync(join(vault, '99-Sistema', 'hot.md')) ? leerBloque(readFileSync(join(vault, '99-Sistema', 'hot.md'), 'utf8')) || '' : '';
    const telegram = await lineaTelegram(vault);
    const cab = `# Segundo cerebro OKT\n\nEstás en el vault ${posix(vault)}. Sigue AGENTS.md. CLI: node "${posix(CLI)}". Para buscar: okt buscar "<tema>". Al terminar una operación: okt cerrar <skill> "<qué>".\n\n${telegram}## Contexto reciente (99-Sistema/hot.md)\n\n`;
    const texto = cab + hot;
    if (texto.length <= TOPE_CONTEXTO) return texto;
    return `${cab}hot.md tiene ${hot.length} caracteres y NO se cargó aquí para evitar un recorte silencioso. Léelo completo con tu herramienta de lectura: ${posix(join(vault, '99-Sistema', 'hot.md'))}`;
  } catch {
    return '';
  }
}

function editadosDelTranscript(ruta, cwd) {
  if (!ruta || !existsSync(ruta)) return [];
  const archivos = new Set();
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    if (!linea.includes('file_path')) continue;
    let o;
    try {
      o = JSON.parse(linea);
    } catch {
      continue;
    }
    const contenido = o?.message?.content;
    if (!Array.isArray(contenido)) continue;
    for (const c of contenido) {
      if (c?.type === 'tool_use' && HERRAMIENTAS_DE_EDICION.has(c.name) && c.input?.file_path) {
        const rel = posix(relative(cwd, c.input.file_path));
        archivos.add(rel.startsWith('..') ? basename(c.input.file_path) : rel);
      }
    }
  }
  return [...archivos];
}

function excluido(vault, cwd) {
  const lista = leerConfigVault(vault).excluir_proyectos || [];
  const nombre = basename(cwd).toLowerCase();
  return lista.some((x) => x.toLowerCase() === nombre || posix(cwd).toLowerCase().includes(posix(x).toLowerCase()));
}

function escribirFicha(vault, { proyecto, cwd, agente, inicio, git, editados = [], pedidos, conversaciones }) {
  const limpios = (xs) => xs.filter((x) => x && !pareceSensible(x)).slice(0, 30);
  const commits = limpios(git?.commits || []);
  const archivos = limpios([...new Set([...editados, ...(git?.cambiados || [])])]);
  if (!commits.length && !archivos.length && !pedidos) return null;
  const nombre = limpiarNombre(`${fechaISO(inicio)} ${horaCorta(inicio).replace(':', '')} ${proyecto}`);
  const rel = `00-Bandeja/sesiones/${nombre}.md`;
  const datos = { tipo: 'sesion', creado: fechaISO(inicio), agente, proyecto, ruta: posix(cwd) };
  if (git?.rama) datos.rama = git.rama;
  if (pedidos) datos.pedidos = String(pedidos);
  const partes = [`\n# Sesión ${agente} · ${proyecto}\n`];
  if (conversaciones?.length) partes.push(`Conversaciones de agy: ${conversaciones.join(', ')}\n`);
  partes.push(`## Commits\n\n${commits.length ? commits.map((c) => `- ${c}`).join('\n') : '- (ninguno)'}\n`);
  partes.push(`## Archivos tocados\n\n${archivos.length ? archivos.map((a) => `- ${a}`).join('\n') : '- (ninguno)'}\n`);
  partes.push('## Para procesar\n\nFicha automática, sin resumen del modelo. Al procesar la bandeja: lo general va a 30-Conocimiento y lo propio del proyecto se propone para el `## Insights` de su CLAUDE.md.\n');
  mkdirSync(join(vault, '00-Bandeja', 'sesiones'), { recursive: true });
  let abs = join(vault, rel);
  for (let i = 2; existsSync(abs); i++) abs = join(vault, `00-Bandeja/sesiones/${nombre} ${i}.md`);
  writeFileSync(abs, escribirFrontmatter(datos, partes.join('\n')));
  return posix(relative(vault, abs));
}

export function hookFin(entradaTexto) {
  try {
    const e = leerEntrada(entradaTexto);
    const vault = vaultGlobal();
    const cwd = e.cwd ? resolve(e.cwd) : null;
    if (!vault || !cwd || !existsSync(cwd) || dentroDe(vault, cwd) || excluido(vault, cwd)) return '';
    let inicioMs = Date.now() - 12 * 3600 * 1000;
    if (e.session_id && existsSync(archivoSesion(e.session_id))) {
      inicioMs = JSON.parse(readFileSync(archivoSesion(e.session_id), 'utf8')).inicio - 60000;
      rmSync(archivoSesion(e.session_id), { force: true });
    }
    const git = cambiosDesde(cwd, new Date(inicioMs).toISOString());
    const editados = editadosDelTranscript(e.transcript_path, cwd);
    escribirFicha(vault, { proyecto: basename(cwd), cwd, agente: 'claude', inicio: ahora(), git, editados });
    return '';
  } catch {
    return '';
  }
}

// okt sesiones agy: fichas a partir del historial de agy (solo pedidos interactivos).
export function sesionesAgy(vault) {
  const ruta = process.env.OKT_AGY_HISTORIAL || join(homedir(), '.gemini', 'antigravity-cli', 'history.jsonl');
  if (!existsSync(ruta)) return { texto: `No encontré el historial de agy (${posix(ruta)}).`, datos: { fichas: [] } };
  const cfg = leerConfigVault(vault);
  const desde = cfg.agy_ultimo || 0;
  const grupos = new Map();
  let maximo = desde;
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    let o;
    try {
      o = JSON.parse(linea);
    } catch {
      continue;
    }
    if (!o.timestamp || o.timestamp <= desde || !o.workspace) continue;
    maximo = Math.max(maximo, o.timestamp);
    const fecha = new Date(o.timestamp);
    const clave = `${o.workspace}|${fechaISO(fecha)}`;
    if (!grupos.has(clave)) grupos.set(clave, { cwd: o.workspace, inicio: fecha, pedidos: 0, conversaciones: new Set() });
    const g = grupos.get(clave);
    g.pedidos++;
    if (o.conversationId) g.conversaciones.add(o.conversationId.slice(0, 8));
  }
  const fichas = [];
  for (const g of grupos.values()) {
    const cwd = resolve(g.cwd);
    if (dentroDe(vault, cwd) || excluido(vault, cwd)) continue;
    const git = existsSync(cwd) ? cambiosDesde(cwd, g.inicio.toISOString()) : null;
    const f = escribirFicha(vault, { proyecto: basename(cwd), cwd, agente: 'antigravity', inicio: g.inicio, git, pedidos: g.pedidos, conversaciones: [...g.conversaciones] });
    if (f) fichas.push(f);
  }
  guardarConfigVault(vault, { agy_ultimo: maximo });
  return { texto: `${fichas.length} fichas de sesiones de agy en 00-Bandeja/sesiones.${fichas.length ? `\n${fichas.map((f) => `- ${f}`).join('\n')}` : ''}`, datos: { fichas } };
}
