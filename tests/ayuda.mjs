// Utilidades de prueba: vault y configuración aislados en una carpeta temporal.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = join(RAIZ, 'scripts', 'okt.mjs');

export function temporal(prefijo = 'okt-') {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  return { dir, borrar: () => rmSync(dir, { recursive: true, force: true }) };
}

export function escribir(base, rel, texto) {
  const ruta = join(base, rel);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
  return ruta;
}

// Corre el CLI con configuración global, fecha y binarios aislados.
export function okt(args, { cwd, configDir, env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      OKT_CONFIG_DIR: configDir,
      OKT_FECHA: '2026-10-22T10:30',
      OKT_SIN_GIT: '1',
      // El hook no lanza procesos desacoplados que seguirían vivos después de la prueba.
      OKT_SIN_SEGUNDO_PLANO: '1',
      // Nunca el ~/.gemini/config/hooks.json real (okt instalar antigravity escribe ahí el hook global).
      OKT_AGY_CONFIG_DIR: join(configDir || tmpdir(), 'agy-config'),
      ...env,
    },
  });
  return { codigo: r.status, salida: r.stdout, error: r.stderr };
}

// Crea un vault ya inicializado (vía el CLI) y devuelve sus rutas.
export function vaultNuevo(opciones = {}) {
  const t = temporal();
  const vault = join(t.dir, 'cerebro');
  const configDir = join(t.dir, 'config');
  mkdirSync(vault, { recursive: true });
  const r = okt(['init', '--aplicar', '--areas', opciones.areas ?? 'Medicina,Personal'], { cwd: vault, configDir });
  if (r.codigo !== 0) throw new Error(`init falló: ${r.error}${r.salida}`);
  return { ...t, vault, configDir, okt: (args, o = {}) => okt(args, { cwd: vault, configDir, ...o }) };
}
