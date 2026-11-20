// okt espacio git ignorar|purgar: git versiona el texto y las imágenes livianas del vault; el audio, el video, los PDF,
// los libros y los modelos se quedan en disco fuera de git (los respalda Drive). Decisión de Mack (2026-11-19): el .git
// de su vault pesaba 1,5 GB por los m4a de NotebookLM y los .onnx de un plugin de voz.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, basename, resolve, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { git, commit } from './git.mjs';
import { sobrescribir } from './rutas.mjs';
import { ahora, fechaISO } from './fechas.mjs';

const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });

export const BINARIOS = ['m4a', 'mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'pdf', 'epub', 'mobi', 'azw3', 'onnx', 'zip', '7z', 'rar'];
const PIPER = /(^|\/)\.obsidian\/plugins\/[^/]+\/piper\//;
const MARCA = '# okt:binarios';
const FIN = '# /okt:binarios';

// Sin mayúsculas: en Windows hay «.PDF» y «.Mp3».
export const esBinario = (ruta) => {
  const r = String(ruta).replace(/\\/g, '/');
  return BINARIOS.includes((r.split('.').pop() || '').toLowerCase()) || PIPER.test(r);
};

export const BLOQUE_GITIGNORE = [
  `${MARCA} (OKT): git versiona el texto y las imágenes livianas; esto se queda en disco y lo respalda Drive. Ver «okt espacio».`,
  ...BINARIOS.map((e) => `*.${e}`),
  '.obsidian/plugins/*/piper/',
  FIN,
].join('\n');

// Reemplaza el bloque si ya está; si no, lo agrega al final. Lo de fuera del bloque no se toca.
export function conBloque(texto) {
  const t = String(texto || '').replace(/\r\n/g, '\n');
  const i = t.indexOf(MARCA);
  const j = t.indexOf(FIN);
  if (i >= 0 && j > i) return `${t.slice(0, i)}${BLOQUE_GITIGNORE}${t.slice(j + FIN.length)}`;
  return `${t.replace(/\n*$/, '')}${t.trim() ? '\n\n' : ''}${BLOQUE_GITIGNORE}\n`;
}

const tieneRepo = (vault) => existsSync(join(vault, '.git'));
const lista = (salida) => salida.split('\0').filter(Boolean);
const mb = (b) => `${(b / 1048576).toLocaleString('es-PE', { maximumFractionDigits: 1 })} MB`;
const pesoDe = (vault, rel) => {
  try {
    return statSync(join(vault, rel)).size;
  } catch {
    return 0;
  }
};

// Bytes del .git (objetos sueltos + packs), con «git count-objects -v» (en KiB).
export function tamanoGit(vault) {
  if (!tieneRepo(vault)) return null;
  const r = git(vault, ['count-objects', '-v']);
  if (!r.ok) return null;
  const v = Object.fromEntries(r.salida.split('\n').map((l) => l.split(': ')));
  return (Number(v.size || 0) + Number(v['size-pack'] || 0) + Number(v['size-garbage'] || 0)) * 1024;
}

export function binariosRastreados(vault) {
  const r = git(vault, ['ls-files', '-z']);
  if (!r.ok) return [];
  return lista(r.salida)
    .filter(esBinario)
    .map((ruta) => ({ ruta, bytes: pesoDe(vault, ruta) }))
    .sort((a, b) => b.bytes - a.bytes);
}

function exigirRepo(vault) {
  if (process.env.OKT_SIN_GIT === '1') throw errorUso('Git está desactivado (OKT_SIN_GIT=1).');
  if (!tieneRepo(vault)) throw errorUso('El vault no tiene git: no hay historial que aligerar.');
}

const top = (items, n = 10) => items.slice(0, n).map((x) => `- ${x.ruta} (${mb(x.bytes)})`).join('\n');

// okt espacio git ignorar [--aplicar]
export function ignorar(vault, op = {}) {
  exigirRepo(vault);
  const rutaIgnore = join(vault, '.gitignore');
  const actual = existsSync(rutaIgnore) ? readFileSync(rutaIgnore, 'utf8') : '';
  const nuevo = conBloque(actual);
  const rastreados = binariosRastreados(vault);
  const total = rastreados.reduce((s, x) => s + x.bytes, 0);
  const falta = nuevo !== actual.replace(/\r\n/g, '\n') || rastreados.length > 0;
  if (!op.aplicar) {
    const texto = !falta
      ? 'Git ya ignora los binarios y no rastrea ninguno.'
      : `Git rastrea ${rastreados.length} binarios (${mb(total)}). Dejarán de versionarse; los archivos se quedan en disco y en Drive.\n${top(rastreados)}${rastreados.length > 10 ? `\n- … y ${rastreados.length - 10} más` : ''}\n\n📍 okt espacio git ignorar --aplicar`;
    return { texto, datos: { rastreados: rastreados.length, bytes: total, bloque: nuevo !== actual } };
  }
  if (!falta) return { texto: 'Git ya ignora los binarios y no rastrea ninguno.', datos: { rastreados: 0 } };
  // El .gitignore va antes del commit previo: si no, su «git add -A» metería en git los binarios nuevos sin rastrear.
  sobrescribir(rutaIgnore, nuevo);
  commit(vault, 'okt: antes de dejar de rastrear los binarios');
  if (rastreados.length) {
    // Por archivo y no por la línea de comandos: en Windows, miles de rutas pasan el límite de 32 mil caracteres.
    const archivo = join(vault, '.git', 'okt-ignorar.txt');
    writeFileSync(archivo, `${rastreados.map((x) => x.ruta).join('\0')}\0`);
    // --literal-pathspecs: «Clase [1].m4a» no es un glob.
    const r = git(vault, ['--literal-pathspecs', 'rm', '-r', '--cached', '-q', '--ignore-unmatch', `--pathspec-from-file=${archivo}`, '--pathspec-file-nul']);
    rmSync(archivo, { force: true });
    if (!r.ok) throw errorUso(`git rm --cached falló: ${r.error}`, 1);
  }
  const c = commit(vault, `okt espacio: git deja de rastrear ${rastreados.length} binarios (siguen en disco)`);
  if (c.error) throw errorUso(`Git: ${c.error}`, 1);
  // commit() hace «git add -A»: un binario que el .gitignore no cubra (p. ej. «.PDF» con core.ignorecase=false) vuelve.
  const siguen = binariosRastreados(vault);
  if (siguen.length) throw errorUso(`El .gitignore no cubre ${siguen.length} binarios y git los volvió a rastrear:\n${top(siguen)}`, 1);
  return {
    texto: `Listo: ${rastreados.length} binarios (${mb(total)}) fuera de git; siguen en disco. El historial todavía los guarda.\n\n📍 okt espacio git purgar`,
    datos: { rastreados: rastreados.length, bytes: total, commit: c },
  };
}

export function obsidianAbierto() {
  const f = process.env.OKT_OBSIDIAN_ABIERTO;
  if (f === '0' || f === '1') return f === '1';
  if (process.platform === 'win32') {
    const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Obsidian.exe', '/NH'], { encoding: 'utf8' });
    return /obsidian\.exe/i.test(r.stdout || '');
  }
  return spawnSync('pgrep', ['-xi', 'obsidian']).status === 0;
}

// Drive para escritorio abre los .pack y .idx mientras gc los reemplaza: «Unable to unlink» a mitad de la purga puede
// dejar .git a medias. No se sabe si está en pausa, así que con Drive corriendo se pide --drive-pausado.
export function driveAbierto() {
  const f = process.env.OKT_DRIVE_ABIERTO;
  if (f === '0' || f === '1') return f === '1';
  if (process.platform !== 'win32') return false;
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq GoogleDriveFS.exe', '/NH'], { encoding: 'utf8' });
  return /googledrivefs\.exe/i.test(r.stdout || '');
}

export const hayFilterRepo =() => spawnSync('git', ['filter-repo', '--version'], { encoding: 'utf8' }).status === 0;

// Todas las rutas binarias que aparecen en algún commit (no solo en HEAD).
function binariosEnHistorial(vault) {
  const r = git(vault, ['log', '--all', '--name-only', '-z', '--pretty=format:']);
  if (!r.ok) return [];
  return [...new Set(lista(r.salida).map((x) => x.replace(/^\n+/, '')).filter(Boolean))].filter(esBinario).sort();
}

const dos = (n) => String(n).padStart(2, '0');

// okt espacio git purgar [--aplicar]
export function purgar(vault, op = {}) {
  exigirRepo(vault);
  if (!hayFilterRepo()) throw errorUso('Falta git filter-repo. Instálalo con: uv tool install git-filter-repo');
  if (binariosRastreados(vault).length) throw errorUso('Git todavía rastrea binarios: primero okt espacio git ignorar --aplicar');
  const rutas = binariosEnHistorial(vault);
  const antes = tamanoGit(vault);
  if (!rutas.length) return { texto: `El historial no guarda binarios. .git: ${mb(antes || 0)}.`, datos: { rutas: 0, antes } };
  // filter-repo lee «regex:», «glob:» y «literal:» al inicio de una línea como patrón, y un salto de línea parte la
  // ruta en dos: «regex:.*.md|x.pdf» (válido en Linux) purgaría todas las notas. Esos nombres se rechazan.
  const raras = rutas.filter((r) => /[\r\n]/.test(r) || /^(regex|glob|literal):/i.test(r));
  if (raras.length) throw errorUso(`Hay binarios con nombres que filter-repo leería como patrón; renómbralos antes de purgar:\n${raras.map((r) => `- ${JSON.stringify(r)}`).join('\n')}`);
  if (!op.aplicar) {
    return {
      texto: `El historial guarda ${rutas.length} binarios; .git pesa ${mb(antes || 0)}. La purga reescribe todos los commits sin ellos (las notas y su historia se conservan) y deja antes un respaldo completo en ~/okt-respaldos.\nAntes: cierra Obsidian y pausa Google Drive.\n${rutas.slice(0, 10).map((r) => `- ${r}`).join('\n')}${rutas.length > 10 ? `\n- … y ${rutas.length - 10} más` : ''}\n\n📍 okt espacio git purgar --aplicar`,
      datos: { rutas: rutas.length, antes },
    };
  }
  if (obsidianAbierto()) throw errorUso('Cierra Obsidian antes de purgar: reescribe el historial y Obsidian podría escribir a la vez.');
  if (driveAbierto() && !op['drive-pausado']) throw errorUso('Google Drive está abierto: pausa la sincronización (icono de Drive → Pausar) y vuelve a correr con --drive-pausado.');
  const d = ahora();
  const dir = resolve(process.env.OKT_RESPALDOS || join(homedir(), 'okt-respaldos'));
  // Un respaldo dentro del vault entraría al siguiente commit (git add -A) y duplicaría el .git.
  const rel = relative(resolve(vault), dir);
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw errorUso(`El respaldo no puede ir dentro del vault (${dir}).`);
  const ignore = join(vault, '.gitignore');
  if (!existsSync(ignore) || !readFileSync(ignore, 'utf8').includes(MARCA)) throw errorUso('El .gitignore no tiene el bloque okt:binarios: primero okt espacio git ignorar --aplicar');
  const previo = commit(vault, 'okt: antes de purgar el historial');
  if (previo.error) throw errorUso(`Git: ${previo.error}`, 1);
  // filter-repo borra del disco lo que quita de HEAD: si el commit previo metió un binario, se detiene aquí.
  if (binariosRastreados(vault).length) throw errorUso('Git volvió a rastrear binarios: corre okt espacio git ignorar --aplicar antes de purgar. No se reescribió nada.');
  mkdirSync(dir, { recursive: true });
  const bundle = join(dir, `${basename(vault).replace(/[^\p{L}\p{N}_-]+/gu, '-')}-${fechaISO(d)}-${dos(d.getHours())}${dos(d.getMinutes())}.bundle`);
  const b = git(vault, ['bundle', 'create', bundle, '--all']);
  if (!b.ok || !git(vault, ['bundle', 'verify', bundle]).ok) throw errorUso(`No pude crear el respaldo (${bundle}): ${b.error}. No se tocó nada.`, 1);

  const archivo = join(vault, '.git', 'okt-purga.txt');
  // --paths-from-file con rutas literales (no globs): sirve igual para «.PDF» y para nombres con │ o emojis.
  writeFileSync(archivo, `${rutas.join('\n')}\n`);
  // PYTHONUTF8: filter-repo es Python, y en Windows sin UTF-8 puede fallar con rutas con emojis o «│».
  const f = spawnSync('git', ['-c', 'core.quotepath=false', '-c', 'core.longpaths=true', 'filter-repo', '--force', '--invert-paths', '--paths-from-file', archivo], {
    cwd: vault,
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1' },
  });
  rmSync(archivo, { force: true });
  if (f.status !== 0) throw errorUso(`git filter-repo falló: ${(f.stderr || f.stdout || '').trim()}\nEl respaldo está en ${bundle}.`, 1);
  git(vault, ['reflog', 'expire', '--expire=now', '--all']);
  git(vault, ['gc', '--prune=now', '--aggressive', '--quiet']);
  const despues = tamanoGit(vault);
  return {
    texto: `Historial purgado: ${rutas.length} binarios fuera; .git pasó de ${mb(antes || 0)} a ${mb(despues || 0)}. Los archivos siguen en disco.\nRespaldo: ${bundle} (bórralo cuando compruebes que todo está bien).`,
    datos: { rutas: rutas.length, antes, despues, bundle },
  };
}
