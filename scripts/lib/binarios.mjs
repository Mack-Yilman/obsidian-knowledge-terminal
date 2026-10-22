// Ejecuta CLIs externos (nlm, ntn, gws, agy, git) sin shell. En Windows, los wrappers .cmd de npm no se
// lanzan sin shell: se lee el .cmd y se ejecuta su script con node. OKT_BIN_<NOMBRE> reemplaza el
// binario (pruebas con fakes).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';

const EXT_WIN = ['.exe', '.cmd', '.bat', ''];

export function resolverBinario(nombre) {
  const propio = process.env[`OKT_BIN_${nombre.toUpperCase()}`];
  if (propio) {
    if (!existsSync(propio)) return null;
    return /\.(m?js|cjs)$/.test(propio) ? [process.execPath, propio] : [propio];
  }
  const dirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? EXT_WIN : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const ruta = join(dir, nombre + ext);
      if (!existsSync(ruta)) continue;
      if (process.platform !== 'win32' || ext === '.exe') return [ruta];
      if (ext === '.cmd') {
        // El .cmd nombra primero "%dp0%\node.exe"; el script real es el que está en node_modules.
        const m = [...readFileSync(ruta, 'utf8').matchAll(/"%dp0%\\([^"]+)"/g)].find((x) => /node_modules/i.test(x[1]));
        if (m) return [process.execPath, join(dirname(ruta), m[1])];
      }
    }
  }
  return null;
}

export function ejecutar(nombre, args = [], { cwd, timeout = 120000, input } = {}) {
  const cmd = resolverBinario(nombre);
  if (!cmd) return { ok: false, faltante: true, codigo: null, salida: '', error: `${nombre} no está instalado o no está en el PATH.` };
  const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], {
    cwd,
    input,
    timeout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' },
  });
  const salida = (r.stdout || '').replace(/^Using keyring backend.*\n/m, '');
  return { ok: r.status === 0, codigo: r.status, salida, error: (r.stderr || r.error?.message || '').trim(), tiempoAgotado: r.error?.code === 'ETIMEDOUT' };
}

// JSON de la salida de un CLI aunque traiga líneas de aviso antes.
export function jsonDe(texto) {
  const t = String(texto || '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const i = t.search(/[[{]/);
    if (i < 0) return null;
    try {
      return JSON.parse(t.slice(i));
    } catch {
      return null;
    }
  }
}
