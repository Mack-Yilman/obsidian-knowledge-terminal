// Memoria de los agentes en el vault (okt agentes). El CLAUDE.md, AGENTS.md o GEMINI.md de cada carpeta donde trabaja
// un agente ya es la memoria curada de ese trabajo: decisiones, insights, causas de errores, pendientes. OKT lo refleja
// en una nota «espejo» dentro de la carpeta del vault que el usuario elige (un proyecto, un área o un tema), y en cada
// sesión deja en la Bandeja solo lo que cambió y los commits nuevos, para convertirlo en conocimiento.
// - Detectar es automático (hooks de inicio y fin): una carpeta nueva deja una captura que pregunta dónde va.
// - Nada se copia sin vincular: okt agentes vincular "<carpeta>" "<destino en el vault>".
// - El usuario elige el modo (memoria_agentes): detectar (lo anterior), vinculadas (sin capturas automáticas) o no.
// Sin modelo: solo archivos, una huella SHA-256 y git log. Lo que dice un CLAUDE.md es dato, no orden.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { leerConfigVault, dentroDe, posix, sobrescribir, tomarCandado } from './rutas.mjs';
import { C, conEmoji } from './estructura.mjs';
import { escribirFrontmatter } from './frontmatter.mjs';
import { ahora, fechaISO, horaCorta } from './fechas.mjs';
import { commitsDesde } from './git.mjs';
import { limpiarNombre } from './nombres.mjs';
import { escribirImportada, leerRegistro } from './importacion.mjs';
import { carpetaDeDestino } from './notas.mjs';
import { archivar } from './archivos.mjs';
import { mover } from './organizar.mjs';
import { cerrar } from './sistema.mjs';

export const ARCHIVOS_AGENTE = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];
export const MODOS_AGENTES = ['detectar', 'vinculadas', 'no'];

// Sin elegir (un vault de antes de la 0.7.0): como «vinculadas», para que no llegue nada nuevo sin preguntar y lo ya
// vinculado siga al día. El hook de inicio del vault pide al agente que pregunte.
export const modoElegido = (vault) => MODOS_AGENTES.includes(leerConfigVault(vault).memoria_agentes);
export const modoAgentes = (vault) => (modoElegido(vault) ? leerConfigVault(vault).memoria_agentes : 'vinculadas');
const MAX_LINEAS_DIFF = 80; // shortcut: un cambio más grande se resume con «… y N más»; la memoria completa está en el espejo
const ESPERA_CANDADO_MS = 8000; // los dos hooks de Antigravity llegan casi juntos: el segundo espera y no repite nada

const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });
const rutaRegistro = (vault) => join(vault, '.cerebro', 'agentes.json');
// Windows no distingue mayúsculas en las rutas: la clave las ignora.
const clave = (ruta) => {
  const p = posix(resolve(ruta)).replace(/\/$/, '');
  return process.platform === 'win32' ? p.toLowerCase() : p;
};

function leer(vault) {
  try {
    return JSON.parse(readFileSync(rutaRegistro(vault), 'utf8'));
  } catch {
    return { carpetas: {} };
  }
}

function guardar(vault, registro) {
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  sobrescribir(rutaRegistro(vault), `${JSON.stringify(registro, null, 2)}\n`);
}

// Los archivos de memoria de una carpeta, con su texto.
function memoria(dir) {
  const archivos = {};
  for (const a of ARCHIVOS_AGENTE) if (existsSync(join(dir, a))) archivos[a] = readFileSync(join(dir, a), 'utf8').replace(/\r\n/g, '\n');
  return archivos;
}

const huella = (archivos) => createHash('sha256').update(JSON.stringify(Object.entries(archivos).sort())).digest('hex').slice(0, 16);

export function excluida(vault, dir) {
  const lista = leerConfigVault(vault).excluir_proyectos || [];
  const nombre = basename(dir).toLowerCase();
  return lista.some((x) => x.toLowerCase() === nombre || posix(dir).toLowerCase().includes(posix(x).toLowerCase()));
}

// El proyecto donde trabaja el agente: la carpeta con memoria más cercana (la de trabajo o, si se abrió una subcarpeta,
// la primera de arriba que la tenga, sin llegar a ~ ni a la raíz del disco), más las subcarpetas inmediatas de la de
// trabajo con memoria propia (una carpeta que agrupa proyectos). Las de más arriba suelen ser reglas generales, no
// proyectos: no se detectan solas (se vinculan a mano). El vault y lo que está dentro de él no cuentan.
export function carpetasConMemoria(vault, cwd) {
  const casa = clave(homedir());
  const sirve = (dir) => !dentroDe(vault, dir) && !dentroDe(dir, vault) && Object.keys(memoria(dir)).length && !excluida(vault, dir);
  const inicio = resolve(cwd);
  let hijas = [];
  if (clave(inicio) !== casa && dirname(inicio) !== inicio) {
    try {
      hijas = readdirSync(inicio, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
        .map((d) => join(inicio, d.name))
        .filter(sirve);
    } catch {}
  }
  const salida = [];
  for (let dir = inicio; clave(dir) !== casa && dirname(dir) !== dir; dir = dirname(dir)) {
    // Una carpeta que agrupa proyectos sin memoria propia no sube a buscar las reglas de más arriba.
    if (dir !== inicio && hijas.length) break;
    // El proyecto más cercano corta la búsqueda aunque esté excluido: si no, aparecerían las reglas de más arriba.
    if (!dentroDe(vault, dir) && !dentroDe(dir, vault) && Object.keys(memoria(dir)).length) {
      if (!excluida(vault, dir)) salida.push(dir);
      break;
    }
  }
  return [...salida, ...hijas];
}

// Primeras líneas de la memoria, para que el usuario reconozca la carpeta al decidir dónde va.
function presentacion(archivos) {
  const [nombre, texto] = Object.entries(archivos)[0] || [];
  if (!texto) return '';
  const lineas = texto.split('\n').filter((l) => l.trim()).slice(0, 12);
  return `## Qué es (primeras líneas de su ${nombre})\n\n${lineas.map((l) => `> ${l}`).join('\n')}\n`;
}

function escribirEnBandeja(vault, base, datos, cuerpo) {
  mkdirSync(join(vault, C.bandeja), { recursive: true });
  let nombre = base;
  for (let i = 2; existsSync(join(vault, C.bandeja, `${nombre}.md`)); i++) nombre = `${base} ${i}`;
  const rel = `${C.bandeja}/${nombre}.md`;
  writeFileSync(join(vault, rel), escribirFrontmatter(datos, cuerpo));
  return rel;
}

// Una carpeta que aparece por primera vez deja una captura que pregunta dónde va (una sola vez por carpeta).
function registrarNueva(vault, registro, dir) {
  const k = clave(dir);
  const padre = Object.values(registro.carpetas).find((c) => c.estado === 'vinculada' && dentroDe(c.ruta, dir));
  const sugerencia = padre ? `\n\nSu carpeta superior ya está vinculada a «${padre.destino}»: puede ir dentro de ella, en una subcarpeta.` : '';
  const nombre = basename(dir);
  const titulo = conEmoji('agente', limpiarNombre(`Carpeta nueva - ${nombre}`));
  const cuerpo = `\n# ${titulo}\n\nUn agente trabajó en \`${posix(dir)}\`, que guarda su memoria en ${Object.keys(memoria(dir)).join(' y ')}. ¿Dónde la sigo en tu vault?${sugerencia}\n\n- **Vincularla:** \`okt agentes vincular "${posix(dir)}" "<área o proyecto>[/<tema>]"\`. Proyecto si el trabajo termina; área si es continuo o temporal.\n- **No seguirla:** \`okt agentes ignorar "${posix(dir)}"\`.\n- **No quiero estas capturas para ninguna carpeta:** \`okt config poner memoria_agentes vinculadas\` (solo las que vincule a mano) o \`okt config poner memoria_agentes no\` (nada de los agentes en el vault).\n\n${presentacion(memoria(dir))}`;
  const captura = escribirEnBandeja(vault, titulo, { tipo: 'captura', creado: fechaISO(), origen: 'agente', carpeta_agente: posix(dir) }, cuerpo);
  registro.carpetas[k] = { ruta: posix(dir), estado: 'detectada', captura, detectada: fechaISO() };
  return captura;
}

// Líneas agregadas y quitadas (como multiconjunto: el orden no importa, una línea cambiada cuenta en las dos).
export function diferencia(antes, despues) {
  const lineas = (t) => String(t || '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !/^```/.test(l.trim()));
  const resta = (a, b) => {
    const quedan = new Map();
    for (const l of b) quedan.set(l, (quedan.get(l) || 0) + 1);
    return a.filter((l) => {
      const n = quedan.get(l) || 0;
      if (n) quedan.set(l, n - 1);
      return !n;
    });
  };
  const a = lineas(antes);
  const d = lineas(despues);
  return { agregadas: resta(d, a), quitadas: resta(a, d) };
}

const citar = (lineas) => {
  const extra = lineas.length - MAX_LINEAS_DIFF;
  return [...lineas.slice(0, MAX_LINEAS_DIFF).map((l) => `> ${l}`), ...(extra > 0 ? [`> … y ${extra} líneas más (ver el espejo)`] : [])].join('\n');
};

function escribirEspejo(vault, c, archivos) {
  const partes = Object.entries(archivos).map(([a, t]) => `**📄 ${a}** · \`${c.ruta}/${a}\`\n\n${t.trim()}`);
  const contenido = `Copia de la memoria del agente en \`${c.ruta}\`. Se actualiza sola en cada sesión: escribe tus notas fuera de las marcas.\n\n${partes.join('\n\n---\n\n')}`;
  return escribirImportada(vault, {
    clave: `agente:${clave(c.ruta)}`,
    titulo: `${basename(c.ruta)} - memoria del agente`,
    contenido,
    carpeta: c.destino,
    datos: { origen: 'agente', tipo: 'fuente', resumen: `Memoria del agente en ${basename(c.ruta)} (${Object.keys(archivos).join(', ')}).`, carpeta_agente: c.ruta },
  });
}

// Refleja una carpeta vinculada si cambió su memoria, y deja la ficha de avance si hubo cambios o commits nuevos.
function sincronizarUna(vault, c) {
  const archivos = memoria(c.ruta);
  const h = huella(archivos);
  // La primera vez solo se anota el último commit: la historia anterior no es avance de esta sesión.
  const git = commitsDesde(c.ruta, c.commit);
  const commits = git?.commits || [];
  const cambio = h !== c.huella;
  const salida = { espejo: null, ficha: null };
  if (cambio && Object.keys(archivos).length) salida.espejo = escribirEspejo(vault, c, archivos).ruta;
  const espejo = salida.espejo || leerRegistro(vault)[`agente:${clave(c.ruta)}`]?.ruta;
  const nombreEspejo = espejo ? basename(espejo, '.md') : '';
  const secciones = [];
  if (cambio && c.previo) {
    for (const a of new Set([...Object.keys(c.previo), ...Object.keys(archivos)])) {
      const { agregadas, quitadas } = diferencia(c.previo[a], archivos[a]);
      if (!agregadas.length && !quitadas.length) continue;
      secciones.push(`## Qué aprendió o cambió (${a})\n${agregadas.length ? `\n**Nuevo:**\n\n${citar(agregadas)}\n` : ''}${quitadas.length ? `\n**Ya no está:**\n\n${citar(quitadas)}\n` : ''}`);
    }
  }
  if (commits.length) secciones.push(`## Avances (commits)\n\n${commits.slice(0, 30).map((s) => `- ${s}`).join('\n')}\n`);
  if (secciones.length) {
    const nombre = basename(c.ruta);
    const d = ahora();
    const titulo = conEmoji('sesion', limpiarNombre(`${fechaISO(d)} ${horaCorta(d).replace(':', '')} ${nombre}`));
    const enlace = nombreEspejo ? `[[${nombreEspejo}]]` : 'su espejo';
    const datos = { tipo: 'captura', creado: fechaISO(d), origen: 'sesion', proyecto: nombre, carpeta_agente: c.ruta, ...(nombreEspejo ? { memoria: enlace } : {}) };
    // El espejo pudo moverse con okt mover o reorganizar: el avance va donde está él, no donde se vinculó.
    const donde = espejo ? dirname(espejo) : c.destino;
    const cuerpo = `\n# Avance · ${nombre}\n\n${secciones.join('\n')}\n## Para procesar\n\nLo que sirve más allá de esta carpeta (trampas de herramientas, reglas del dominio, decisiones) va a una nota de su área, citando ${enlace}. El avance va a la nota principal de «${donde}». Memoria completa: ${enlace}.\n`;
    salida.ficha = escribirEnBandeja(vault, titulo, datos, cuerpo);
  }
  Object.assign(c, { huella: h, previo: archivos, sincronizado: new Date().toISOString(), ...(git ? { commit: git.head } : {}) });
  return salida;
}

function conCandado(vault, fn, { silencioso = false } = {}) {
  let soltar;
  try {
    soltar = tomarCandado(vault, 'agentes', 'Otra sincronización de los agentes está en curso: vuelve a intentarlo en un momento.', { esperarMs: ESPERA_CANDADO_MS });
  } catch (e) {
    if (silencioso) return null;
    throw e;
  }
  try {
    return fn();
  } finally {
    soltar();
  }
}

// Hooks de inicio y fin: detecta las carpetas nuevas y sincroniza las vinculadas de la cadena de cwd. Nunca falla.
export function alTrabajar(vault, cwd) {
  try {
    const modo = modoAgentes(vault);
    if (modo === 'no') return null;
    // Más las ya vinculadas de más arriba (una carpeta de reglas que el usuario decidió seguir).
    const vinculadas = Object.values(leer(vault).carpetas).filter((c) => c.estado === 'vinculada' && dentroDe(c.ruta, cwd)).map((c) => c.ruta);
    const carpetas = [...carpetasConMemoria(vault, cwd), ...vinculadas];
    if (!carpetas.length) return null;
    return conCandado(vault, () => sincronizar(vault, { rutas: carpetas, detectar: modo === 'detectar' }), { silencioso: true });
  } catch {
    return null;
  }
}

// okt agentes sincronizar [--silencioso]: todas las vinculadas, una sincronización a la vez.
export function sincronizarTodas(vault, op = {}) {
  if (modoAgentes(vault) === 'no') return { texto: 'La memoria de los agentes está apagada (memoria_agentes: no).', datos: { espejos: [], fichas: [], nuevas: [] } };
  return conCandado(vault, () => sincronizar(vault), { silencioso: op.silencioso }) || { texto: '', datos: { espejos: [], fichas: [], nuevas: [] } };
}

// Las vinculadas (o solo rutas). Con detectar, registra las que aparecen por primera vez. Sin candado: lo pone quien llama.
function sincronizar(vault, { rutas = null, detectar = false } = {}) {
  const registro = leer(vault);
  const nuevas = [];
  if (detectar) for (const dir of rutas || []) if (!registro.carpetas[clave(dir)]) nuevas.push(registrarNueva(vault, registro, dir));
  const pedidas = rutas ? new Set(rutas.map(clave)) : null;
  const espejos = [];
  const fichas = [];
  for (const [k, c] of Object.entries(registro.carpetas)) {
    if (c.estado !== 'vinculada' || (pedidas && !pedidas.has(k)) || !existsSync(c.ruta)) continue;
    const r = sincronizarUna(vault, c);
    if (r.espejo) espejos.push(r.espejo);
    if (r.ficha) fichas.push(r.ficha);
  }
  guardar(vault, registro);
  if (nuevas.length || espejos.length || fichas.length) cerrar(vault, 'agentes', `${espejos.length} memorias de agente actualizadas, ${fichas.length} fichas de avance, ${nuevas.length} carpetas nuevas`);
  const texto = [`Agentes: ${espejos.length} memorias actualizadas, ${fichas.length} fichas de avance${nuevas.length ? `, ${nuevas.length} carpetas nuevas por ubicar` : ''}.`, ...[...espejos, ...fichas, ...nuevas].map((r) => `- ${r}`)].join('\n');
  return { texto, datos: { espejos, fichas, nuevas } };
}

// okt agentes vincular "<carpeta>" "<destino>": crea el espejo y archiva la captura que preguntaba dónde iba.
export function vincular(vault, ruta, destinoPedido) {
  if (!ruta || !destinoPedido) throw errorUso('Uso: okt agentes vincular "<carpeta de trabajo>" "<área o proyecto>[/<tema>]"');
  const dir = resolve(String(ruta));
  if (!Object.keys(memoria(dir)).length) throw errorUso(`«${ruta}» no tiene ${ARCHIVOS_AGENTE.join(', ')}.`);
  if (dentroDe(vault, dir)) throw errorUso('El vault no se vincula consigo mismo.');
  if (modoAgentes(vault) === 'no') throw errorUso('La memoria de los agentes está apagada. Para seguir solo las carpetas que vincules: okt config poner memoria_agentes vinculadas.');
  const destino = carpetaDeDestino(vault, destinoPedido);
  return conCandado(vault, () => {
    const registro = leer(vault);
    const previa = registro.carpetas[clave(dir)];
    // Volver a vincular a otro destino conserva lo ya visto (no repite el diff ni los commits) y mueve el espejo.
    const ya = previa?.estado === 'vinculada';
    const c = { ...(ya ? previa : {}), ruta: posix(dir), estado: 'vinculada', destino, vinculada: fechaISO() };
    registro.carpetas[clave(dir)] = c;
    const anterior = leerRegistro(vault)[`agente:${clave(dir)}`]?.ruta;
    if (ya && anterior && existsSync(join(vault, anterior)) && dirname(anterior) !== destino) mover(vault, anterior, destino);
    const espejo = sincronizarUna(vault, c).espejo || leerRegistro(vault)[`agente:${clave(dir)}`]?.ruta;
    if (previa?.captura && existsSync(join(vault, previa.captura))) archivar(vault, [previa.captura]);
    guardar(vault, registro);
    cerrar(vault, 'agentes', `vinculó ${basename(dir)} a ${destino}`, { notas: espejo ? basename(espejo, '.md') : undefined });
    return { texto: `Vinculada: ${posix(dir)} → ${destino}.\nEspejo: ${espejo}. Desde ahora, cada sesión deja en la Bandeja solo lo que cambió.`, datos: { ...c, espejo } };
  });
}

// okt agentes ignorar "<carpeta>": no se vuelve a preguntar por ella ni se sincroniza.
export function ignorar(vault, ruta) {
  if (!ruta) throw errorUso('Uso: okt agentes ignorar "<carpeta de trabajo>"');
  return conCandado(vault, () => {
    const registro = leer(vault);
    const dir = resolve(String(ruta));
    const previa = registro.carpetas[clave(dir)];
    registro.carpetas[clave(dir)] = { ruta: posix(dir), estado: 'ignorada', ignorada: fechaISO() };
    if (previa?.captura && existsSync(join(vault, previa.captura))) archivar(vault, [previa.captura]);
    guardar(vault, registro);
    return { texto: `Ignorada: ${posix(dir)}. Para seguirla de nuevo: okt agentes vincular "${posix(dir)}" "<destino>".`, datos: registro.carpetas[clave(dir)] };
  });
}

// okt agentes [listar]
export function listar(vault) {
  const carpetas = Object.values(leer(vault).carpetas);
  const modo = modoAgentes(vault);
  const como = modo === 'detectar' ? 'aparecen solas cuando un agente (Claude Code o Antigravity) trabaja en una que tiene CLAUDE.md o AGENTS.md' : modo === 'vinculadas' ? 'se siguen las que vincules con okt agentes vincular' : 'la memoria de los agentes está apagada (okt config poner memoria_agentes detectar|vinculadas)';
  if (!carpetas.length) return { texto: `Todavía no sigo ninguna carpeta: ${como}.`, datos: [] };
  const linea = (c) => `- ${c.ruta}: ${c.estado}${c.destino ? ` → ${c.destino}` : ''}${c.sincronizado ? ` (sincronizada ${c.sincronizado.slice(0, 10)})` : ''}`;
  return { texto: `Carpetas de agentes:\n${carpetas.map(linea).join('\n')}`, datos: carpetas };
}
