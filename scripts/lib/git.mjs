// Git local del vault (sin remoto): sirve para deshacer cambios de la IA y para delegar a agy.
// OKT_SIN_GIT=1 lo desactiva (pruebas).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const activo = () => process.env.OKT_SIN_GIT !== '1';

function git(vault, args) {
  // core.quotepath=false: sin él, git escapa los nombres con tildes o emojis («"\360\237…"»).
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: vault, encoding: 'utf8' });
  // trimEnd y no trim: en «git status --porcelain» la primera línea de un archivo modificado empieza con espacio
  // (« M archivo»), y quitarlo cortaba el primer carácter del nombre en la ficha de sesión.
  return { ok: r.status === 0, salida: (r.stdout || '').replace(/\r/g, '').trimEnd(), error: (r.stderr || r.error?.message || '').trim() };
}

export function hayGit() {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

export function iniciarGit(vault) {
  if (!activo()) return { omitido: true };
  if (existsSync(join(vault, '.git'))) return { yaExistia: true };
  const r = git(vault, ['init', '-q', '-b', 'main']);
  if (!r.ok) return { error: r.error };
  // Identidad local mínima para que los commits funcionen aunque no haya una global.
  if (!git(vault, ['config', 'user.name']).salida) git(vault, ['config', 'user.name', 'OKT']);
  if (!git(vault, ['config', 'user.email']).salida) git(vault, ['config', 'user.email', 'okt@localhost']);
  return { creado: true };
}

export function commit(vault, mensaje) {
  if (!activo()) return { omitido: true };
  if (!existsSync(join(vault, '.git'))) return { sinRepo: true };
  git(vault, ['add', '-A']);
  if (!git(vault, ['status', '--porcelain']).salida) return { sinCambios: true };
  const r = git(vault, ['commit', '-q', '-m', mensaje]);
  return r.ok ? { hecho: true, hash: git(vault, ['rev-parse', '--short', 'HEAD']).salida } : { error: r.error };
}

export function cambiosDesde(dir, desdeISO) {
  // Para la ficha de sesión: commits y archivos cambiados en un repo ajeno (solo lectura).
  if (!existsSync(join(dir, '.git'))) return null;
  const commits = git(dir, ['log', `--since=${desdeISO}`, '--pretty=%s', '-n', '20']);
  // -z: separado por NUL y sin comillas, aunque el nombre lleve espacios, tildes o emojis.
  const estado = git(dir, ['status', '--porcelain', '-z']);
  const rama = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const cambiados = [];
  const partes = estado.ok ? estado.salida.split('\0') : [];
  for (let i = 0; i < partes.length; i++) {
    if (partes[i].length < 4) continue;
    cambiados.push(partes[i].slice(3));
    if (/^[RC]/.test(partes[i])) i++; // en un renombre, el siguiente es el nombre anterior
  }
  return {
    rama: rama.ok ? rama.salida : '',
    commits: commits.ok && commits.salida ? commits.salida.split('\n') : [],
    cambiados,
  };
}
