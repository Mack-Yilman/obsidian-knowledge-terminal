// okt doctor: qué está listo y qué falta, con el comando o el paso para resolverlo.
// Sin --completo no usa la red (rápido); con --completo verifica también las sesiones de nlm, ntn y gws.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { ejecutar, resolverBinario, jsonDe } from './binarios.mjs';
import { leerConfigVault, posix, RAIZ_PLUGIN } from './rutas.mjs';
import { dirSkillsAgy, dirOkt, dirAgyConfig, deConfianza, SKILL_OBSIDIAN, ETIQUETA_TAREA } from './instalar.mjs';

// Plugins de Claude Code instalados (~/.claude/plugins/installed_plugins.json; OKT_CLAUDE_PLUGINS para las pruebas).
function pluginClaude(id) {
  try {
    const ruta = process.env.OKT_CLAUDE_PLUGINS || join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
    return Boolean(JSON.parse(readFileSync(ruta, 'utf8')).plugins?.[id]);
  } catch {
    return false;
  }
}
import { necesitaMigrar } from './estructura.mjs';

const plataforma = process.platform;

function obsidianInstalado() {
  const rutas = {
    win32: [join(process.env.LOCALAPPDATA || '', 'Programs', 'Obsidian', 'Obsidian.exe')],
    darwin: ['/Applications/Obsidian.app'],
    linux: ['/usr/bin/obsidian', '/opt/Obsidian/obsidian', join(homedir(), '.local', 'share', 'flatpak', 'app', 'md.obsidian.Obsidian')],
  }[plataforma] || [];
  return rutas.some((r) => r && existsSync(r)) || Boolean(resolverBinario('obsidian'));
}

function vaultRegistradoEnObsidian(vault) {
  const cfg = {
    win32: join(process.env.APPDATA || '', 'obsidian', 'obsidian.json'),
    darwin: join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
    linux: join(homedir(), '.config', 'obsidian', 'obsidian.json'),
  }[plataforma];
  if (!cfg || !existsSync(cfg)) return false;
  try {
    const { vaults = {} } = JSON.parse(readFileSync(cfg, 'utf8'));
    return Object.values(vaults).some((v) => v.path && resolve(v.path).toLowerCase() === resolve(vault).toLowerCase());
  } catch {
    return false;
  }
}

function driveInstalado() {
  if (plataforma === 'win32') return existsSync('C:/Program Files/Google/Drive File Stream');
  if (plataforma === 'darwin') return existsSync('/Applications/Google Drive.app');
  return false;
}

export function doctor(vault, op = {}) {
  const c = [];
  const add = (grupo, nombre, ok, detalle, como, opcional = false) => c.push({ grupo, nombre, estado: ok ? 'ok' : opcional ? 'opcional' : 'falta', detalle, como: ok ? '' : como });
  const version = (bin, args = ['--version']) => {
    const r = ejecutar(bin, args, { timeout: 20000 });
    return r.ok ? (r.salida || r.error).split('\n')[0].trim() : null;
  };
  const cfg = vault ? leerConfigVault(vault) : {};

  const mayor = Number(process.versions.node.split('.')[0]);
  add('Base', 'Node', mayor >= 20, `v${process.versions.node}`, 'Instala Node 20 o superior: https://nodejs.org');
  const git = version('git');
  add('Base', 'Git', Boolean(git), git || 'no encontrado', 'Instala Git: https://git-scm.com (en Windows: winget install Git.Git)');
  add('Base', 'Vault', Boolean(vault), vault ? posix(vault) : 'no configurado', 'Abre tu agente en la carpeta de tus notas y pide «configura mi segundo cerebro» (okt init).');
  if (vault) add('Base', 'Estructura con emojis (0.3.0)', !necesitaMigrar(vault), necesitaMigrar(vault) ? 'estructura anterior' : 'al día', 'okt migrar (vista previa) y okt migrar --aplicar');
  if (vault) add('Base', 'Git del vault', existsSync(join(vault, '.git')), existsSync(join(vault, '.git')) ? 'historial local activo' : 'sin historial', 'okt init --aplicar lo crea (git local, sin remoto).');

  const obs = obsidianInstalado();
  add('Obsidian', 'Obsidian instalado', obs, obs ? 'sí' : 'no encontrado', plataforma === 'win32' ? 'winget install Obsidian.Obsidian (o https://obsidian.md/download)' : 'https://obsidian.md/download');
  if (vault) add('Obsidian', 'Vault abierto en Obsidian', vaultRegistradoEnObsidian(vault), '', 'En Obsidian: «Abrir carpeta como bóveda» y elige la carpeta del vault.');

  const respaldo = cfg.respaldo;
  add('Respaldo', 'Google Drive para escritorio', driveInstalado(), driveInstalado() ? 'instalado' : 'no encontrado', 'Instálalo desde https://www.google.com/drive/download/ (o usa otro respaldo).', true);
  add('Respaldo', 'Respaldo confirmado', Boolean(respaldo), respaldo || 'sin confirmar', 'En Drive: Preferencias → Mi PC → Agregar carpeta → elige el vault → «Hacer copia de seguridad en Google Drive». Luego: okt config poner respaldo drive', true);

  const conectores = [
    { bin: 'nlm', nombre: 'NotebookLM (nlm)', como: 'uv tool install notebooklm-mcp-cli && nlm login', auth: ['login', '--check'] },
    { bin: 'ntn', nombre: 'Notion (ntn)', como: 'npm install -g ntn && ntn login', auth: ['whoami'] },
    { bin: 'gws', nombre: 'Google Docs y Drive (gws)', como: 'npm install -g @googleworkspace/cli && gws auth login', auth: ['auth', 'status'] },
    { bin: 'agy', nombre: 'Antigravity (agy)', como: 'Instala Antigravity CLI y ábrelo una vez para iniciar sesión.' },
    { bin: 'defuddle', nombre: 'Páginas web completas (defuddle)', como: 'npm install -g defuddle' },
    { bin: 'yt-dlp', nombre: 'Transcripciones de YouTube (yt-dlp)', como: 'uv tool install yt-dlp' },
  ];
  for (const k of conectores) {
    const v = version(k.bin);
    add('Conectores', k.nombre, Boolean(v), v || 'no instalado', k.como, true);
    if (v && op.completo && k.auth) {
      const r = ejecutar(k.bin, k.auth, { timeout: 30000 });
      let ok = r.ok;
      if (k.bin === 'gws') ok = ok && jsonDe(r.salida)?.token_valid !== false;
      add('Conectores', `${k.nombre}: sesión`, ok, ok ? 'válida' : 'sin sesión o vencida', k.como.split('&&').pop().trim(), true);
    }
  }
  const agySkills = existsSync(join(dirSkillsAgy(), 'okt-cerebro', 'SKILL.md'));
  // La copia de Antigravity se queda en la versión con la que se instaló: hay que repetir el comando tras actualizar.
  const versionDe = (dir) => {
    try {
      return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    } catch {
      return null;
    }
  };
  const esta = versionDe(RAIZ_PLUGIN);
  const enAgy = agySkills ? versionDe(join(dirOkt(), 'plugin')) : null;
  add('Conectores', 'Skills de OKT en Antigravity', agySkills && enAgy === esta, agySkills ? `instaladas (${enAgy || '?'}${enAgy === esta ? '' : `; este plugin es la ${esta}`})` : 'no instaladas', 'okt instalar antigravity --aplicar', true);
  if (agySkills && vault) {
    let global = false;
    try {
      global = Boolean(JSON.parse(readFileSync(join(dirAgyConfig(), 'hooks.json'), 'utf8')).okt);
    } catch {}
    add('Conectores', 'Hook de inicio global de Antigravity (App y CLI)', global, global ? 'instalado' : 'no instalado', 'okt instalar antigravity --aplicar', true);
    let tarea = false;
    try {
      tarea = JSON.parse(readFileSync(join(vault, '.vscode', 'tasks.json'), 'utf8')).tasks?.some((t) => t?.label === ETIQUETA_TAREA);
    } catch {}
    add('Conectores', 'Tarea del Antigravity IDE que baja Telegram al abrir el vault', tarea, tarea ? 'instalada' : 'no instalada', 'okt instalar antigravity --aplicar', true);
  }
  // Formato de Obsidian (kepano/obsidian-skills): plugin en Claude Code, skills copiadas en Antigravity.
  const enClaude = pluginClaude('obsidian@obsidian-skills');
  add('Conectores', 'Formato de Obsidian en Claude Code (obsidian-skills)', enClaude, enClaude ? 'instalado' : 'no instalado', 'claude plugin marketplace add kepano/obsidian-skills && claude plugin install obsidian@obsidian-skills', true);
  if (agySkills) {
    const enAgy = existsSync(join(dirSkillsAgy(), SKILL_OBSIDIAN, 'SKILL.md'));
    add('Conectores', 'Formato de Obsidian en Antigravity (obsidian-skills)', enAgy, enAgy ? 'instalado' : 'no instalado', 'okt instalar obsidian-skills --aplicar', true);
  }
  // agy solo usa el hook de inicio del vault (Telegram y hot.md) si el vault es una carpeta de confianza.
  if (agySkills && vault) {
    const confianza = deConfianza(vault);
    add('Conectores', 'Vault de confianza en Antigravity', confianza, confianza ? 'sí' : 'no', 'Abre agy en la carpeta del vault y acepta confiar en ella: sin eso, solo corre el hook global.', true);
  }

  const marca = { ok: '✔', falta: '✖', opcional: '·' };
  const grupos = [...new Set(c.map((x) => x.grupo))];
  const texto = grupos
    .map((g) => `${g}\n${c.filter((x) => x.grupo === g).map((x) => `  ${marca[x.estado]} ${x.nombre}${x.detalle ? `: ${x.detalle}` : ''}${x.como ? `\n      → ${x.como}` : ''}`).join('\n')}`)
    .join('\n');
  const faltan = c.filter((x) => x.estado === 'falta').length;
  return { texto: `${texto}\n\n${faltan ? `Faltan ${faltan} pasos obligatorios.` : 'Lo obligatorio está listo.'}${op.completo ? '' : ' (Para verificar las sesiones de los conectores: okt doctor --completo)'}`, datos: c };
}
