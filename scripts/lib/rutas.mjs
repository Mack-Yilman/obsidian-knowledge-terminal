// Dónde está cada cosa: el plugin, la configuración global y el vault.
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, ftruncateSync, writeSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLI = join(RAIZ_PLUGIN, 'scripts', 'okt.mjs');

export const posix = (p) => p.replace(/\\/g, '/');

export function dirConfig() {
  return process.env.OKT_CONFIG_DIR || join(homedir(), '.config', 'okt');
}

export function leerConfigGlobal() {
  const ruta = join(dirConfig(), 'config.json');
  if (!existsSync(ruta)) return {};
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return {};
  }
}

export function guardarConfigGlobal(cambios) {
  const dir = dirConfig();
  mkdirSync(dir, { recursive: true });
  const cfg = { ...leerConfigGlobal(), ...cambios };
  writeFileSync(join(dir, 'config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  return cfg;
}

export const esVault = (dir) => existsSync(join(dir, '.cerebro', 'config.json'));

// En Windows, writeFileSync sobre un archivo con atributo Oculto falla con EPERM (abre con
// CREATE_ALWAYS). Si el archivo existe, se abre con r+ y se trunca: respeta el atributo.
export function sobrescribir(ruta, texto) {
  if (!existsSync(ruta)) return writeFileSync(ruta, texto);
  const fd = openSync(ruta, 'r+');
  try {
    ftruncateSync(fd, 0);
    writeSync(fd, texto, 0, 'utf8');
  } finally {
    closeSync(fd);
  }
}

export function dentroDe(padre, hijo) {
  const r = relative(resolve(padre), resolve(hijo));
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

export function buscarVaultArriba(cwd = process.cwd()) {
  let dir = resolve(cwd);
  for (;;) {
    if (esVault(dir)) return dir;
    const arriba = dirname(dir);
    if (arriba === dir) return null;
    dir = arriba;
  }
}

// --vault > OKT_VAULT > la carpeta actual o una superior que sea vault > el vault de la config global.
export function resolverVault(opcion, cwd = process.cwd()) {
  const explicito = opcion || process.env.OKT_VAULT;
  if (explicito) return resolve(cwd, explicito);
  const arriba = buscarVaultArriba(cwd);
  if (arriba) return arriba;
  const { vault } = leerConfigGlobal();
  return vault && esVault(vault) ? resolve(vault) : null;
}

export function leerConfigVault(vault) {
  try {
    return JSON.parse(readFileSync(join(vault, '.cerebro', 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function guardarConfigVault(vault, cambios) {
  const cfg = { ...leerConfigVault(vault), ...cambios };
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  sobrescribir(join(vault, '.cerebro', 'config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  return cfg;
}
