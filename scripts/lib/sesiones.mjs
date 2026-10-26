// Hooks de inicio y fin de Claude Code y de Antigravity. Nada de esto usa el modelo.
// - En el vault: baja Telegram, lanza en segundo plano los enlaces pendientes, sincroniza la memoria de los agentes y
//   carga hot.md como contexto.
// - En otra carpeta: detecta y sincroniza la memoria de su agente (CLAUDE.md, AGENTS.md; ver agentes.mjs).
// Los hooks nunca fallan: ante cualquier error, salen en silencio.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { leerConfigGlobal, guardarConfigGlobal, esVault, dentroDe, CLI, posix } from './rutas.mjs';
import { R, necesitaMigrar, AVISO_MIGRAR } from './estructura.mjs';
import { leerBloque } from './bloques.mjs';
import { commit } from './git.mjs';
import { actualizarAgents } from './init.mjs';
import { bajar as bajarTelegram, leerConfigTelegram } from './telegram.mjs';
import { lanzarSegundoPlano } from './importar-url.mjs';
import { alTrabajar, sincronizarTodas, modoElegido } from './agentes.mjs';

const TOPE_TELEGRAM_MS = 10000; // el hook tiene 15 s: la sesión nunca espera más que esto
const TOPE_CONTEXTO = 9500; // Claude Code recorta en silencio lo que pase de 10 000 caracteres.

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
  // Sin migrar, el bloque nuevo describiría carpetas que aún no existen: lo regenera okt migrar.
  if (necesitaMigrar(vault)) return;
  if (actualizarAgents(vault, actual)) commit(vault, 'okt: ruta del CLI actualizada en AGENTS.md');
}

// Si Telegram está configurado, baja la cola; un error o el tope de tiempo no frenan la sesión.
async function lineaTelegram(vault) {
  if (!leerConfigTelegram()) return '';
  try {
    // Cada archivo tarda ~5 s: solo se empieza uno si quedan 6 s del tope; los demás esperan a la bajada a mano.
    const r = await bajarTelegram(vault, { tope: TOPE_TELEGRAM_MS, reservaArchivo: 6000 });
    const { escritos, errores, diferidos } = r.datos;
    return escritos.length || errores.length || diferidos.length ? `${r.texto}\n\n` : '';
  } catch {
    return '';
  }
}

const PREGUNTA_AGENTES = 'Falta elegir qué guarda el vault de los agentes (memoria_agentes). Antes de otra cosa, pregúntale al usuario, en sus palabras: «¿Trabajas con Claude Code, Antigravity u otro agente en otras carpetas? ¿Quieres que lo que aprenden ahí (su CLAUDE.md o AGENTS.md) llegue a tu cerebro?». Opciones: «Sí, todas las carpetas» → okt config poner memoria_agentes detectar (cada carpeta nueva deja en la Bandeja una nota que pregunta dónde va); «Solo las que yo elija» → okt config poner memoria_agentes vinculadas (se siguen con «vincula esta carpeta a…»); «No» → okt config poner memoria_agentes no. Guarda su respuesta: no vuelvas a preguntar.';

// Lo que se hace al empezar a trabajar en el vault, antes de leer hot.md (que esas operaciones actualizan).
function alAbrirVault(vault) {
  let aviso = '';
  try {
    if (lanzarSegundoPlano(vault)) aviso += 'Hay enlaces en la Bandeja: su contenido (página o transcripción) se está trayendo en segundo plano.\n\n';
  } catch {}
  try {
    const { fichas, nuevas } = sincronizarTodas(vault, { silencioso: true }).datos;
    if (fichas.length || nuevas.length) aviso += `Memoria de los agentes: ${fichas.length} fichas de avance y ${nuevas.length} carpetas nuevas en la Bandeja.\n\n`;
  } catch {}
  if (!modoElegido(vault)) aviso += `${PREGUNTA_AGENTES}\n\n`;
  return aviso;
}

// Contexto de inicio, igual para Claude Code y Antigravity: cabecera, lo que llegó de Telegram y hot.md.
async function contextoInicio(vault) {
  // Con la estructura anterior no se baja Telegram: escribiría en carpetas nuevas junto a las viejas.
  const migrar = necesitaMigrar(vault);
  const avisos = migrar ? `${AVISO_MIGRAR} Propónselo al usuario antes de cualquier otra operación.\n\n` : (await lineaTelegram(vault)) + alAbrirVault(vault);
  const rutaHot = existsSync(join(vault, R.hot)) ? join(vault, R.hot) : join(vault, '99-Sistema', 'hot.md');
  const hot = existsSync(rutaHot) ? leerBloque(readFileSync(rutaHot, 'utf8')) || '' : '';
  const cab = `# Segundo cerebro OKT\n\nEstás en el vault ${posix(vault)}. Sigue AGENTS.md. CLI: node "${posix(CLI)}". Para buscar: okt buscar "<tema>". Al terminar una operación: okt cerrar <skill> "<qué>".\n\n${avisos}## Contexto reciente (${posix(rutaHot.slice(vault.length + 1))})\n\n`;
  const texto = cab + hot;
  if (texto.length <= TOPE_CONTEXTO) return texto;
  return `${cab}hot.md tiene ${hot.length} caracteres y NO se cargó aquí para evitar un recorte silencioso. Léelo completo con tu herramienta de lectura: ${posix(rutaHot)}`;
}

// En otra carpeta: la memoria de su agente se sincroniza al empezar y al terminar (sin contexto para la sesión).
function enOtraCarpeta(vault, cwd) {
  if (!cwd || !existsSync(cwd) || dentroDe(vault, cwd) || necesitaMigrar(vault)) return;
  alTrabajar(vault, cwd);
}

export async function hookInicio(entradaTexto) {
  try {
    const e = leerEntrada(entradaTexto);
    const vault = vaultGlobal();
    if (!vault) return '';
    renovarRutaCli(vault);
    if (!e.cwd || !dentroDe(vault, e.cwd)) {
      enOtraCarpeta(vault, e.cwd);
      return '';
    }
    return await contextoInicio(vault);
  } catch {
    return '';
  }
}

// Antigravity corre el hook del vault (<vault>/.agents/hooks.json) y el global (~/.gemini/config/hooks.json) en
// la misma conversación, con ~0,2 s de diferencia (sonda en la App, 2026-10-23). El primero que llega anota el
// conversationId y el otro no repite la bajada ni el contexto.
// En la caché (ignorada por git): cambia en cada conversación.
const rutaHookAgy = (vault) => join(vault, '.cerebro', 'cache', 'hook-agy.json');

function primeraVez(vault, id) {
  if (!id) return true;
  try {
    const previo = JSON.parse(readFileSync(rutaHookAgy(vault), 'utf8'));
    if (previo.conversationId === id) return false;
  } catch {}
  mkdirSync(join(vault, '.cerebro', 'cache'), { recursive: true });
  writeFileSync(rutaHookAgy(vault), JSON.stringify({ conversationId: id, hora: new Date().toISOString() }));
  return true;
}

// SessionStart de Antigravity (App, CLI y, cuando los cargue, el IDE). Entrega las carpetas abiertas en
// workspacePaths y espera {"injectSteps":[{"systemMessage":{"systemMessage":"…"}}]} (verificado en agy 1.4.5 y en
// la App). Si alguna carpeta abierta es el vault (o está dentro de él), da el contexto; las demás sincronizan la
// memoria de su agente. No renueva la ruta del CLI: la de AGENTS.md es la de Claude Code, y cambiarla haría que los
// dos agentes se la pisaran. Antigravity no tiene hook de cierre: lo de esa sesión se recoge al empezar la siguiente.
export async function hookInicioAntigravity(entradaTexto) {
  try {
    const e = leerEntrada(entradaTexto);
    if (e.invocationNum > 0) return '{}';
    const vault = vaultGlobal();
    if (!vault) return '{}';
    const carpetas = [...new Set([...[].concat(e.workspacePaths || []), e.cwd].filter(Boolean).map((c) => posix(resolve(c))))];
    for (const c of carpetas) if (!dentroDe(vault, c)) enOtraCarpeta(vault, c);
    if (!carpetas.some((c) => dentroDe(vault, c))) return '{}';
    if (!primeraVez(vault, e.conversationId)) return '{}';
    const texto = await contextoInicio(vault);
    return texto ? JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: texto } }] }) : '{}';
  } catch {
    return '{}';
  }
}

export function hookFin(entradaTexto) {
  try {
    const e = leerEntrada(entradaTexto);
    const vault = vaultGlobal();
    if (vault && e.cwd) enOtraCarpeta(vault, resolve(e.cwd));
    return '';
  } catch {
    return '';
  }
}
