// okt instalar antigravity [--aplicar]: instala OKT como plugin de Antigravity en ~/.gemini/config/plugins/
// obsidian-knowledge-terminal/ (plugin.json en la raíz, que es el formato de agy, y sus skills dentro: así «dos niveles
// arriba» de cada skill ya es la raíz del plugin). Quita lo de la instalación anterior (skills sueltas okt-* y la copia
// en ~/.okt/plugin). Repetirlo después de actualizar el plugin.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { RAIZ_PLUGIN, posix, guardarConfigGlobal, leerConfigGlobal, esVault, sobrescribir } from './rutas.mjs';

export const FRASE_RAIZ = 'dos niveles arriba del directorio base de esta skill';
const PARTES_PLUGIN = ['scripts', 'references', 'plantillas', 'skills', 'package.json'];

export const dirOkt = () => process.env.OKT_HOME || join(homedir(), '.okt');
export const dirSkillsAgy = () => process.env.OKT_AGY_SKILLS || join(homedir(), '.gemini', 'config', 'skills');
const dirAgyCli = () => process.env.OKT_AGY_CLI_DIR || join(homedir(), '.gemini', 'antigravity-cli');

// agy solo carga los hooks de un workspace de confianza (trustedWorkspaces, que incluye sus subcarpetas).
export function deConfianza(vault) {
  try {
    const { trustedWorkspaces = [] } = JSON.parse(readFileSync(join(dirAgyCli(), 'settings.json'), 'utf8'));
    const v = resolve(vault).toLowerCase();
    return trustedWorkspaces.some((t) => {
      const r = resolve(t).toLowerCase();
      return v === r || v.startsWith(r + sep);
    });
  } catch {
    return false;
  }
}

// Archivo JSON de configuración: se mezcla la entrada de OKT con lo que ya tenga. Si no es JSON válido, no se toca.
function mezclarJson(ruta, cambiar) {
  let datos = {};
  if (existsSync(ruta)) {
    try {
      datos = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch {
      return { aviso: `No toqué ${posix(ruta)}: no es JSON válido. Corrígelo y repite okt instalar antigravity --aplicar.` };
    }
  }
  const nuevo = cambiar(datos);
  mkdirSync(dirname(ruta), { recursive: true });
  sobrescribir(ruta, `${JSON.stringify(nuevo, null, 2)}\n`);
  return { ruta: posix(ruta) };
}

// Hook SessionStart para que Antigravity baje Telegram y cargue hot.md al abrir una conversación, como Claude Code.
// Va en dos lugares (sonda del 2026-10-23): el del vault (App y CLI, si el vault es de confianza) y el global de
// ~/.gemini/config/hooks.json (App y CLI en cualquier carpeta; el hook solo actúa si la carpeta abierta es el vault, y
// el de la misma conversación que llegue segundo no repite nada). agy no interpreta comillas en el comando y lo
// corre desde .agents/ o desde ~/.gemini/config/: va la ruta absoluta y sin espacios.
export const dirAgyConfig = () => process.env.OKT_AGY_CONFIG_DIR || join(homedir(), '.gemini', 'config');
const hookOkt = (cli) => ({ SessionStart: [{ type: 'command', command: `node ${cli} hook inicio --formato antigravity`, timeout: 20 }] });

function instalarHooks(vault, cli) {
  if (/\s/.test(cli)) return [{ aviso: `No instalé el hook de inicio: la ruta ${cli} tiene espacios y agy no admite comillas en el comando.` }];
  const conHook = (hooks) => ({ ...hooks, okt: hookOkt(cli) });
  return [mezclarJson(join(vault, '.agents', 'hooks.json'), conHook), mezclarJson(join(dirAgyConfig(), 'hooks.json'), conHook)];
}

// El Antigravity IDE (2.5.5) no carga hooks: una tarea de VS Code con runOn folderOpen baja Telegram al abrir la
// carpeta del vault. La primera vez, el IDE pregunta si se permiten las tareas automáticas.
export const ETIQUETA_TAREA = 'OKT: bajar Telegram';

function instalarTareaIde(vault, cli) {
  const tarea = {
    label: ETIQUETA_TAREA,
    type: 'process',
    command: 'node',
    args: [cli, 'telegram', 'bajar', '--silencioso', '--vault', posix(vault)],
    runOptions: { runOn: 'folderOpen' },
    presentation: { reveal: 'silent', panel: 'dedicated', close: true },
    problemMatcher: [],
  };
  return mezclarJson(join(vault, '.vscode', 'tasks.json'), (t) => ({ version: '2.0.0', ...t, tasks: [...[].concat(t.tasks || []).filter((x) => x?.label !== ETIQUETA_TAREA), tarea] }));
}

// okt instalar obsidian-skills [--aplicar]: las skills de kepano/obsidian-skills (Markdown de Obsidian, Bases, Canvas,
// CLI de Obsidian) para Antigravity, que no tiene marketplace de plugins. En Claude Code se instalan como plugin:
// claude plugin marketplace add kepano/obsidian-skills && claude plugin install obsidian@obsidian-skills.
// OKT_OBSIDIAN_SKILLS_REPO reemplaza el repositorio (pruebas sin red).
const REPO_OBSIDIAN_SKILLS = () => process.env.OKT_OBSIDIAN_SKILLS_REPO || 'https://github.com/kepano/obsidian-skills.git';
export const SKILL_OBSIDIAN = 'obsidian-markdown'; // la que comprueba okt doctor

export function instalarObsidianSkills(op = {}) {
  const repo = join(dirOkt(), 'obsidian-skills');
  const destino = dirSkillsAgy();
  const plan = [
    existsSync(join(repo, '.git')) ? `Actualizar ${posix(repo)} (git pull)` : `Clonar ${REPO_OBSIDIAN_SKILLS()} en ${posix(repo)}`,
    `Copiar sus skills (obsidian-markdown, obsidian-bases, json-canvas, obsidian-cli, defuddle, knap) a ${posix(destino)}`,
  ];
  const claude = 'En Claude Code se instalan aparte, como plugin: claude plugin marketplace add kepano/obsidian-skills y claude plugin install obsidian@obsidian-skills.';
  if (!op.aplicar) return { texto: `Vista previa de obsidian-skills (licencia MIT, de Steph Ango, creador de Obsidian):\n${plan.map((p) => `  - ${p}`).join('\n')}\n${claude}\nPara instalar en Antigravity: okt instalar obsidian-skills --aplicar`, datos: { plan } };

  const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const r = existsSync(join(repo, '.git')) ? git(['pull', '-q', '--ff-only'], repo) : (mkdirSync(dirOkt(), { recursive: true }), git(['clone', '-q', '--depth', '1', REPO_OBSIDIAN_SKILLS(), repo]));
  if (r.status !== 0) throw Object.assign(new Error(`No pude descargar obsidian-skills: ${(r.stderr || r.error?.message || '').trim()}`), { codigo: 1 });
  const skills = readdirSync(join(repo, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(repo, 'skills', e.name, 'SKILL.md'))).map((e) => e.name);
  mkdirSync(destino, { recursive: true });
  for (const s of skills) cpSync(join(repo, 'skills', s), join(destino, s), { recursive: true, force: true });
  return { texto: `obsidian-skills en Antigravity: ${skills.join(', ')}.\n${claude}`, datos: { skills, destino: posix(destino) } };
}

export function skillsDelPlugin() {
  return readdirSync(join(RAIZ_PLUGIN, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

export const NOMBRE_PLUGIN = 'obsidian-knowledge-terminal';
export const dirPluginAgy = () => join(dirAgyConfig(), 'plugins', NOMBRE_PLUGIN);

// Manifiesto de agy (plugin.json en la raíz). Con version, «agy plugin list» la muestra (validado con --strict).
function manifiestoAgy() {
  const { description, version } = JSON.parse(readFileSync(join(RAIZ_PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  return { $schema: 'https://antigravity.google/schemas/v1/plugin.json', name: NOMBRE_PLUGIN, version, description };
}

export function instalarAntigravity(op = {}) {
  const destPlugin = dirPluginAgy();
  const skills = skillsDelPlugin();
  const viejas = [join(dirOkt(), 'plugin'), ...skills.map((s) => join(dirSkillsAgy(), `okt-${s}`))].filter((d) => existsSync(d));
  const { vault } = leerConfigGlobal();
  const conVault = Boolean(vault && esVault(vault));
  const plan = [`Instalar el plugin de Antigravity en ${posix(destPlugin)} (plugin.json y ${PARTES_PLUGIN.join(', ')}), con las skills ${skills.join(', ')}`];
  if (viejas.length) plan.push(`Quitar la instalación anterior: ${viejas.map(posix).join(', ')}`);
  if (conVault) {
    plan.push(`Hook de inicio (SessionStart) en ${posix(join(vault, '.agents', 'hooks.json'))} y en ${posix(join(dirAgyConfig(), 'hooks.json'))}: al abrir una conversación en el vault (App o CLI de Antigravity) baja Telegram y carga hot.md`);
    plan.push(`Tarea «${ETIQUETA_TAREA}» en ${posix(join(vault, '.vscode', 'tasks.json'))}: el Antigravity IDE baja Telegram al abrir la carpeta del vault`);
  }
  if (!op.aplicar) {
    return { texto: `Vista previa de la instalación en Antigravity:\n${plan.map((p) => `  - ${p}`).join('\n')}\nPara instalar: okt instalar antigravity --aplicar`, datos: { plan } };
  }
  // Copia limpia: una skill o un archivo que ya no está en el plugin no debe quedar en la copia de agy.
  rmSync(destPlugin, { recursive: true, force: true });
  mkdirSync(destPlugin, { recursive: true });
  for (const p of PARTES_PLUGIN) cpSync(join(RAIZ_PLUGIN, p), join(destPlugin, p), { recursive: true, force: true });
  writeFileSync(join(destPlugin, 'plugin.json'), `${JSON.stringify(manifiestoAgy(), null, 2)}\n`);
  for (const d of viejas) rmSync(d, { recursive: true, force: true });
  const cli = posix(join(destPlugin, 'scripts', 'okt.mjs'));
  const previo = leerConfigGlobal().cli;
  if (!previo || !existsSync(previo)) guardarConfigGlobal({ cli });
  const lineas = [`Plugin de Antigravity instalado en ${posix(destPlugin)}, con las skills ${skills.join(', ')}.`, ...(viejas.length ? ['Quité la instalación anterior (skills okt-* sueltas y ~/.okt/plugin).'] : [])];
  let hooks = [];
  let tarea = null;
  if (conVault) {
    hooks = instalarHooks(vault, cli);
    for (const h of hooks) lineas.push(h.aviso || `Hook de inicio en ${h.ruta}.`);
    if (hooks.some((h) => !h.aviso)) lineas.push('Al abrir una conversación con el vault abierto (App o CLI de Antigravity), baja Telegram y carga hot.md.');
    if (!deConfianza(vault)) lineas.push(`Aviso: ${posix(vault)} aún no es una carpeta de confianza en agy. El hook global funciona igual; para que corra también el del vault, abre agy en el vault y acepta confiar en la carpeta.`);
    tarea = instalarTareaIde(vault, cli);
    lineas.push(tarea.aviso || `Tarea del IDE en ${tarea.ruta}: el Antigravity IDE baja Telegram al abrir la carpeta. La primera vez pregunta si permites las tareas automáticas: elige «Permitir».`);
  } else lineas.push('Sin vault configurado: los hooks de inicio se agregan al repetir este comando después de okt init.');
  lineas.push('Abre Antigravity en la carpeta de tu vault y pide, por ejemplo, «¿cómo va mi cerebro?».');
  return { texto: lineas.join('\n'), datos: { plan, destPlugin: posix(destPlugin), skills, hooks, tarea } };
}
