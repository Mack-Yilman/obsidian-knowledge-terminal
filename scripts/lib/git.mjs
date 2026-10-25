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

// Para la memoria de los agentes: los asuntos de los commits nuevos desde el último visto, por hash y no por fecha (con
// --since, un commit hecho en el mismo segundo que la sincronización salía dos veces). Solo lectura.
export function commitsDesde(dir, desde) {
  if (!existsSync(join(dir, '.git'))) return null;
  const head = git(dir, ['rev-parse', 'HEAD']);
  if (!head.ok) return null;
  if (!desde || desde === head.salida) return { head: head.salida, commits: [] };
  // Si el hash ya no existe (un rebase), no hay forma segura de saber qué es nuevo: no se lista nada.
  const log = git(dir, ['log', `${desde}..HEAD`, '--pretty=%s', '-n', '30']);
  return { head: head.salida, commits: log.ok && log.salida ? log.salida.split('\n') : [] };
}
