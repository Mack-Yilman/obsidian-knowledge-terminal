// okt instalar antigravity [--aplicar]: copia el plugin a ~/.okt/plugin (ruta estable) y las skills a
// ~/.gemini/config/skills/okt-<skill>/, con la ruta de <raíz> ya escrita (Antigravity no conoce la
// estructura de un plugin de Claude). Repetirlo después de actualizar el plugin.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { RAIZ_PLUGIN, posix, guardarConfigGlobal, leerConfigGlobal, esVault, sobrescribir } from './rutas.mjs';

export const FRASE_RAIZ = 'dos niveles arriba del directorio base de esta skill';
const PARTES_PLUGIN = ['scripts', 'references', 'plantillas', 'skills', 'package.json'];

const dirOkt = () => process.env.OKT_HOME || join(homedir(), '.okt');
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

// Hook SessionStart del vault, para que Antigravity baje Telegram y cargue hot.md al abrir la sesión, como
// Claude Code. agy (1.4.5, Windows) no interpreta comillas en el comando y lo corre desde .agents/, así que
// va la ruta absoluta y sin espacios. Se mezcla con los hooks que ya tenga el vault.
function instalarHookVault(vault, cli) {
  if (/\s/.test(cli)) return { aviso: `No instalé el hook de inicio: la ruta ${cli} tiene espacios y agy no admite comillas en el comando.` };
  const ruta = join(vault, '.agents', 'hooks.json');
  let hooks = {};
  if (existsSync(ruta)) {
    try {
      hooks = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch {
      return { aviso: `No toqué ${posix(ruta)}: no es JSON válido. Corrígelo y repite okt instalar antigravity --aplicar.` };
    }
  }
  hooks.okt = { SessionStart: [{ type: 'command', command: `node ${cli} hook inicio --formato antigravity`, timeout: 20 }] };
  mkdirSync(dirname(ruta), { recursive: true });
  sobrescribir(ruta, `${JSON.stringify(hooks, null, 2)}\n`);
  return { ruta: posix(ruta) };
}

export function skillsDelPlugin() {
  return readdirSync(join(RAIZ_PLUGIN, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

export function adaptarSkill(texto, nombre, raiz) {
  return texto.replace(/^name:\s*.+$/m, `name: okt-${nombre}`).split(FRASE_RAIZ).join(`\`${posix(raiz)}\``);
}

export function instalarAntigravity(op = {}) {
  const destPlugin = join(dirOkt(), 'plugin');
  const destSkills = dirSkillsAgy();
  const skills = skillsDelPlugin();
  const { vault } = leerConfigGlobal();
  const conVault = Boolean(vault && esVault(vault));
  const plan = [`Copiar el plugin a ${posix(destPlugin)} (${PARTES_PLUGIN.join(', ')})`, ...skills.map((s) => `Instalar la skill okt-${s} en ${posix(join(destSkills, `okt-${s}`))}`)];
  if (conVault) plan.push(`Hook de inicio (SessionStart) en ${posix(join(vault, '.agents', 'hooks.json'))}: baja Telegram y carga hot.md al abrir agy en el vault`);
  if (!op.aplicar) {
    return { texto: `Vista previa de la instalación en Antigravity:\n${plan.map((p) => `  - ${p}`).join('\n')}\nPara instalar: okt instalar antigravity --aplicar`, datos: { plan } };
  }
  mkdirSync(destPlugin, { recursive: true });
  for (const p of PARTES_PLUGIN) cpSync(join(RAIZ_PLUGIN, p), join(destPlugin, p), { recursive: true, force: true });
  for (const s of skills) {
    const origen = join(RAIZ_PLUGIN, 'skills', s);
    const dest = join(destSkills, `okt-${s}`);
    mkdirSync(dest, { recursive: true });
    cpSync(origen, dest, { recursive: true, force: true });
    writeFileSync(join(dest, 'SKILL.md'), adaptarSkill(readFileSync(join(origen, 'SKILL.md'), 'utf8'), s, destPlugin));
  }
  const cli = posix(join(destPlugin, 'scripts', 'okt.mjs'));
  if (!leerConfigGlobal().cli || !existsSync(leerConfigGlobal().cli)) guardarConfigGlobal({ cli });
  const lineas = [`Instalado en Antigravity: ${skills.map((s) => `okt-${s}`).join(', ')}.`, `Plugin en ${posix(destPlugin)}.`];
  let hook = null;
  if (conVault) {
    hook = instalarHookVault(vault, cli);
    if (hook.aviso) lineas.push(hook.aviso);
    else {
      lineas.push(`Hook de inicio en ${hook.ruta}: al abrir agy en el vault baja Telegram y carga hot.md.`);
      if (!deConfianza(vault)) lineas.push(`Aviso: ${posix(vault)} aún no es una carpeta de confianza en agy, y agy no usa sus hooks hasta que lo sea. Abre agy en el vault y acepta confiar en la carpeta.`);
    }
  } else lineas.push('Sin vault configurado: el hook de inicio se agrega al repetir este comando después de okt init.');
  lineas.push('Abre agy en la carpeta de tu vault y pide, por ejemplo, «¿cómo va mi cerebro?».');
  return { texto: lineas.join('\n'), datos: { plan, destPlugin: posix(destPlugin), skills, hook } };
}
