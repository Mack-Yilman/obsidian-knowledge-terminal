// okt instalar antigravity [--aplicar]: copia el plugin a ~/.okt/plugin (ruta estable) y las skills a
// ~/.gemini/config/skills/okt-<skill>/, con la ruta de <raíz> ya escrita (Antigravity no conoce la
// estructura de un plugin de Claude). Repetirlo después de actualizar el plugin.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { RAIZ_PLUGIN, posix, guardarConfigGlobal, leerConfigGlobal } from './rutas.mjs';

export const FRASE_RAIZ = 'dos niveles arriba del directorio base de esta skill';
const PARTES_PLUGIN = ['scripts', 'references', 'plantillas', 'skills', 'package.json'];

const dirOkt = () => process.env.OKT_HOME || join(homedir(), '.okt');
const dirSkillsAgy = () => process.env.OKT_AGY_SKILLS || join(homedir(), '.gemini', 'config', 'skills');

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
  const plan = [`Copiar el plugin a ${posix(destPlugin)} (${PARTES_PLUGIN.join(', ')})`, ...skills.map((s) => `Instalar la skill okt-${s} en ${posix(join(destSkills, `okt-${s}`))}`)];
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
  if (!leerConfigGlobal().cli || !existsSync(leerConfigGlobal().cli)) guardarConfigGlobal({ cli: posix(join(destPlugin, 'scripts', 'okt.mjs')) });
  return { texto: `Instalado en Antigravity: ${skills.map((s) => `okt-${s}`).join(', ')}.\nPlugin en ${posix(destPlugin)}. Abre agy en la carpeta de tu vault y pide, por ejemplo, «¿cómo va mi cerebro?».`, datos: { plan, destPlugin: posix(destPlugin), skills } };
}
