import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { unificarDuplicados } from '../scripts/lib/espacio.mjs';

const LIBRO = '05 │ ⚙️ Sistema/📎 adjuntos/📖 libros/Fisiología';
const TEMA = '02 │ 🧭 Areas/🧭 Medicina';
const HOY = '2026-10-22';
const CON_GIT = { OKT_SIN_GIT: '0', OKT_OBSIDIAN_ABIERTO: '0', OKT_DRIVE_ABIERTO: '0' };

const bytes = (n, semilla = 1) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 31 + semilla) % 251));
const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');
const git = (dir, ...args) => spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: dir, encoding: 'utf8' });

// Un libro con dos imágenes idénticas (distinto nombre), un logo pequeño, una figura grande que aporta y una huérfana.
function conImagenes() {
  const v = vaultNuevo();
  const figura = bytes(40000, 7);
  writeFileSync(escribir(v.vault, `${LIBRO}/Fisiología - figura.png`, ''), figura);
  writeFileSync(escribir(v.vault, `${LIBRO}/Fisiología - figura copia larga.png`, ''), figura);
  writeFileSync(escribir(v.vault, `${LIBRO}/Fisiología - logo.png`, ''), bytes(800, 3));
  writeFileSync(escribir(v.vault, `${LIBRO}/Fisiología - tabla.png`, ''), bytes(30000, 9));
  writeFileSync(escribir(v.vault, `${LIBRO}/Fisiología - huérfana.png`, ''), bytes(5000, 5));
  escribir(
    v.vault,
    `${TEMA}/📖 Fisiología - Texto completo.md`,
    [
      '---', 'tipo: fuente', '---', '', '# Fisiología', '',
      '![[Fisiología - logo.png]]', '',
      '## Capítulo 1', '', 'El gasto cardiaco depende de la precarga.', '',
      '![[Fisiología - figura.png]]', '',
      'Texto entre figuras. ![[Fisiología - logo.png|50]] sigue el texto.', '',
      '![[Fisiología - figura copia larga.png]]', '',
      '![[Fisiología - tabla.png]]', '',
      '```', '![[Fisiología - figura copia larga.png]]', '```', '',
    ].join('\n'),
  );
  return v;
}

test('espacio: informa tamaños, duplicados, pequeñas y huérfanas sin tocar nada', () => {
  const v = conImagenes();
  const antes = readdirSync(join(v.vault, LIBRO)).sort();
  const r = v.okt(['espacio']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /1 grupo[s]? de imágenes duplicadas/);
  assert.match(r.salida, /Fisiología - huérfana\.png/, 'lista la huérfana');
  assert.match(r.salida, /Fisiología - logo\.png/, 'lista la pequeña');
  assert.match(r.salida, /📍 okt espacio limpiar preparar/);
  assert.deepEqual(readdirSync(join(v.vault, LIBRO)).sort(), antes, 'solo lectura');

  const breve = v.okt(['espacio', '--breve']);
  assert.equal(breve.codigo, 0, breve.error);
  assert.equal(breve.salida.trim().split('\n').length, 1, 'una sola línea');
  v.borrar();
});

test('espacio limpiar preparar: lote con duplicados (conserva el nombre más corto), huérfanas y candidatas a revisar', () => {
  const v = conImagenes();
  const r = v.okt(['espacio', 'limpiar', 'preparar']);
  assert.equal(r.codigo, 0, r.error);
  const lote = JSON.parse(leer(v, '.cerebro/cache/espacio/lote.json'));
  assert.deepEqual(lote.duplicados, [{ conservar: `${LIBRO}/Fisiología - figura.png`, quitar: [`${LIBRO}/Fisiología - figura copia larga.png`] }]);
  assert.deepEqual(lote.huerfanas, [`${LIBRO}/Fisiología - huérfana.png`]);
  const logo = lote.revisar.find((x) => x.ruta === `${LIBRO}/Fisiología - logo.png`);
  assert.ok(logo, 'la pequeña va a revisar');
  assert.deepEqual(logo.enlazadaDesde, [`${TEMA}/📖 Fisiología - Texto completo.md`]);
  assert.ok(!lote.revisar.some((x) => x.ruta.endsWith('tabla.png')), 'una imagen normal no se propone');
  assert.deepEqual(lote.quitar, []);
  v.borrar();
});

test('espacio limpiar aplicar: unifica duplicados, quita lo aprobado y manda todo a .trash sin romper el texto', () => {
  const v = conImagenes();
  v.okt(['espacio', 'limpiar', 'preparar']);
  const rutaLote = join(v.vault, '.cerebro/cache/espacio/lote.json');
  const lote = JSON.parse(readFileSync(rutaLote, 'utf8'));
  lote.quitar = [`${LIBRO}/Fisiología - logo.png`];
  writeFileSync(rutaLote, JSON.stringify(lote));

  const r = v.okt(['espacio', 'limpiar', 'aplicar', rutaLote]);
  assert.equal(r.codigo, 0, r.error);
  const texto = leer(v, `${TEMA}/📖 Fisiología - Texto completo.md`);
  assert.doesNotMatch(texto, /logo\.png/, 'incrustaciones del logo quitadas');
  assert.match(texto, /Texto entre figuras\. +sigue el texto\./, 'el texto de alrededor se queda');
  assert.match(texto, /El gasto cardiaco depende de la precarga\./);
  assert.equal((texto.match(/!\[\[Fisiología - figura\.png\]\]/g) || []).length, 2, 'el duplicado apunta a la copia conservada');
  assert.match(texto, /```\n!\[\[Fisiología - figura copia larga\.png\]\]\n```/, 'no toca los bloques de código');
  assert.match(texto, /!\[\[Fisiología - tabla\.png\]\]/);

  // Papelera con nombres cortos (las rutas del vault real ya rozan los 260 caracteres) y un manifiesto para restaurar.
  const papelera = join(v.vault, `.trash/okt-${HOY}`);
  const manifiesto = JSON.parse(readFileSync(join(papelera, 'manifiesto.json'), 'utf8'));
  for (const n of ['figura copia larga', 'logo', 'huérfana']) {
    const original = `${LIBRO}/Fisiología - ${n}.png`;
    assert.ok(!existsSync(join(v.vault, original)), `${n} salió de adjuntos`);
    const [enPapelera] = Object.entries(manifiesto).find(([, o]) => o === original) || [];
    assert.ok(enPapelera && existsSync(join(papelera, enPapelera)), `${n} está en la papelera y en el manifiesto`);
  }
  assert.match(r.salida, /manifiesto\.json/, 'dice cómo restaurar');
  assert.ok(existsSync(join(v.vault, `${LIBRO}/Fisiología - figura.png`)));
  assert.ok(existsSync(join(v.vault, `${LIBRO}/Fisiología - tabla.png`)));
  v.borrar();
});

test('espacio limpiar aplicar: un lote inválido no toca nada', () => {
  const v = conImagenes();
  const antes = leer(v, `${TEMA}/📖 Fisiología - Texto completo.md`);
  const casos = [
    { duplicados: [{ conservar: `${LIBRO}/Fisiología - figura.png`, quitar: [`${LIBRO}/Fisiología - tabla.png`] }] }, // distinto contenido
    { quitar: ['../fuera.png'] },
    { quitar: [`${TEMA}/📖 Fisiología - Texto completo.md`] },
    { quitar: [`${LIBRO}/no existe.png`] },
    { huerfanas: [`${LIBRO}/Fisiología - tabla.png`], quitar: [`${LIBRO}/Fisiología - tabla.png`] }, // repetida
  ];
  for (const [i, c] of casos.entries()) {
    const ruta = escribir(v.dir, `malo-${i}.json`, JSON.stringify({ duplicados: [], huerfanas: [], revisar: [], quitar: [], webp: [], ...c }));
    const r = v.okt(['espacio', 'limpiar', 'aplicar', ruta]);
    assert.equal(r.codigo, 2, `caso ${i}: ${r.salida}`);
    assert.match(r.error, /no se tocó nada/);
  }
  assert.equal(leer(v, `${TEMA}/📖 Fisiología - Texto completo.md`), antes);
  assert.ok(!existsSync(join(v.vault, '.trash')), 'nada en la papelera');
  v.borrar();
});

test('unificarDuplicados: deja una copia por contenido entre las imágenes dadas y reescribe solo las notas indicadas', () => {
  const v = conImagenes();
  const imagenes = readdirSync(join(v.vault, LIBRO)).map((n) => `${LIBRO}/${n}`);
  const r = unificarDuplicados(v.vault, imagenes, [`${TEMA}/📖 Fisiología - Texto completo.md`]);
  assert.equal(r.quitados, 1);
  assert.ok(!existsSync(join(v.vault, `${LIBRO}/Fisiología - figura copia larga.png`)));
  assert.doesNotMatch(leer(v, `${TEMA}/📖 Fisiología - Texto completo.md`).replace(/```[\s\S]*?```/g, ''), /copia larga/);
  v.borrar();
});

test('espacio limpiar: una huérfana fuera de adjuntos no se propone, y un nombre repetido en otra carpeta no se unifica', () => {
  const v = conImagenes();
  writeFileSync(escribir(v.vault, '04 │ 🗄️ Archivo/📥 Bruto/2026-10/original.pdf', ''), bytes(3000, 8));
  // Mismo nombre que la copia a quitar, en otra carpeta y con otro contenido: reescribir por nombre la desviaría.
  writeFileSync(escribir(v.vault, '05 │ ⚙️ Sistema/📎 adjuntos/📁 otros/Fisiología - figura copia larga.png', ''), bytes(900, 11));
  escribir(v.vault, `${TEMA}/Otra.md`, '| a | b |\n|---|---|\n| ![[Fisiología - tabla.png\\|200]] | x |\n');
  const r = v.okt(['espacio', 'limpiar', 'preparar']);
  assert.equal(r.codigo, 0, r.error);
  const lote = JSON.parse(leer(v, '.cerebro/cache/espacio/lote.json'));
  assert.ok(!lote.huerfanas.some((x) => x.endsWith('original.pdf')), 'lo de Bruto no es huérfano');
  assert.deepEqual(lote.duplicados, [], 'el nombre ambiguo no se unifica');
  assert.ok(!lote.huerfanas.some((x) => x.endsWith('tabla.png')), 'un enlace en tabla con \\| cuenta como referencia');

  // Un lote editado a mano que quita un nombre repetido en otra carpeta también se rechaza al aplicar.
  const ruta = escribir(v.dir, 'ambiguo.json', JSON.stringify({ duplicados: [], huerfanas: [], revisar: [], quitar: [`${LIBRO}/Fisiología - figura copia larga.png`], webp: [] }));
  const a = v.okt(['espacio', 'limpiar', 'aplicar', ruta]);
  assert.equal(a.codigo, 2);
  assert.match(a.error, /no se tocó nada[\s\S]*otra carpeta/);
  v.borrar();
});

test('espacio limpiar preparar: una portada sin enlazar no es huérfana; se propone incrustarla en la ficha', () => {
  const v = conImagenes();
  writeFileSync(escribir(v.vault, `${LIBRO}/Fisiología - cover.jpeg`, ''), bytes(60000, 13));
  const r = v.okt(['espacio', 'limpiar', 'preparar']);
  assert.equal(r.codigo, 0, r.error);
  const lote = JSON.parse(leer(v, '.cerebro/cache/espacio/lote.json'));
  assert.ok(!lote.huerfanas.some((x) => /cover/.test(x)));
  assert.deepEqual(lote.portadas, [`${LIBRO}/Fisiología - cover.jpeg`]);
  assert.match(r.salida, /portada/i);
  v.borrar();
});

test('revisión final: la misma imagen escrita con otra capitalización no es su duplicado, y el lote se lee relativo al vault', () => {
  const v = conImagenes();
  const figura = `${LIBRO}/Fisiología - tabla.png`;
  const r = unificarDuplicados(v.vault, [figura, figura.toUpperCase().replace('05 │ ⚙️ SISTEMA', '05 │ ⚙️ Sistema')], []);
  assert.equal(r.quitados, 0);
  assert.ok(existsSync(join(v.vault, figura)), 'el único archivo físico sigue en disco');

  v.okt(['espacio', 'limpiar', 'preparar']);
  const a = v.okt(['espacio', 'limpiar', 'aplicar', '.cerebro/cache/espacio/lote.json'], { cwd: v.dir });
  assert.equal(a.codigo, 0, a.error);
  v.borrar();
});

function conGit() {
  const v = vaultNuevo();
  git(v.vault, 'init', '-q', '-b', 'main');
  git(v.vault, 'config', 'user.name', 'Prueba');
  git(v.vault, 'config', 'user.email', 'p@p');
  // Un vault anterior a la 0.10.0: su .gitignore no tiene el bloque okt:binarios.
  writeFileSync(join(v.vault, '.gitignore'), '.trash/\n.cerebro/cache/\n');
  writeFileSync(escribir(v.vault, `${TEMA}/🎧 clase.m4a`, ''), bytes(20000, 2));
  writeFileSync(escribir(v.vault, '.obsidian/plugins/voz/piper/models/es.onnx', ''), bytes(20000, 4));
  escribir(v.vault, `${TEMA}/🫀 Infarto.md`, '# 🫀 Infarto\n\n![[🎧 clase.m4a]]\n');
  git(v.vault, 'add', '-A');
  git(v.vault, 'commit', '-q', '-m', 'inicial con binarios');
  escribir(v.vault, `${TEMA}/🫀 Infarto.md`, '# 🫀 Infarto\n\n![[🎧 clase.m4a]]\n\nTroponina.\n');
  git(v.vault, 'commit', '-qam', 'segunda');
  return v;
}

test('espacio git ignorar: vista previa sin cambios; con --aplicar agrega el bloque una sola vez y deja de rastrear sin borrar', () => {
  const v = conGit();
  let r = v.okt(['espacio', 'git', 'ignorar'], { env: CON_GIT });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /🎧 clase\.m4a/);
  assert.doesNotMatch(readFileSync(join(v.vault, '.gitignore'), 'utf8'), /okt:binarios/, 'la vista previa no escribe');

  // Un binario nuevo sin rastrear, con corchetes en el nombre: no debe entrar a git por el commit previo.
  writeFileSync(escribir(v.vault, `${TEMA}/Clase [1].mp3`, ''), bytes(3000, 6));
  r = v.okt(['espacio', 'git', 'ignorar', '--aplicar'], { env: CON_GIT });
  assert.equal(r.codigo, 0, r.error);
  assert.equal(git(v.vault, 'log', '--all', '--name-only', '--pretty=format:', '--', `${TEMA}/Clase [1].mp3`).stdout.trim(), '', 'nunca entró al historial');
  r = v.okt(['espacio', 'git', 'ignorar', '--aplicar'], { env: CON_GIT });
  assert.equal(r.codigo, 0, r.error);
  const ignore = readFileSync(join(v.vault, '.gitignore'), 'utf8');
  assert.equal((ignore.match(/# okt:binarios/g) || []).length, 1);
  assert.match(ignore, /\*\.m4a/);
  const rastreados = git(v.vault, 'ls-files').stdout;
  assert.doesNotMatch(rastreados, /\.m4a|\.onnx/);
  assert.ok(existsSync(join(v.vault, `${TEMA}/🎧 clase.m4a`)), 'el archivo sigue en disco');
  assert.ok(existsSync(join(v.vault, '.obsidian/plugins/voz/piper/models/es.onnx')));
  assert.equal(git(v.vault, 'status', '--porcelain').stdout.trim(), '', 'quedó en un commit');
  v.borrar();
});

const hayFilterRepo = spawnSync('git', ['filter-repo', '--version'], { encoding: 'utf8' }).status === 0;

test('espacio git purgar: exige ignorar antes y Obsidian cerrado; respalda, quita los binarios del historial y conserva los archivos', { skip: !hayFilterRepo && 'falta git filter-repo' }, () => {
  const v = conGit();
  const respaldos = join(v.dir, 'respaldos');
  const env = { ...CON_GIT, OKT_RESPALDOS: respaldos };
  let r = v.okt(['espacio', 'git', 'purgar', '--aplicar'], { env });
  assert.equal(r.codigo, 2);
  assert.match(r.error, /okt espacio git ignorar/);

  v.okt(['espacio', 'git', 'ignorar', '--aplicar'], { env });
  r = v.okt(['espacio', 'git', 'purgar', '--aplicar'], { env: { ...env, OKT_OBSIDIAN_ABIERTO: '1' } });
  assert.equal(r.codigo, 2);
  assert.match(r.error, /Obsidian/);

  r = v.okt(['espacio', 'git', 'purgar', '--aplicar'], { env: { ...env, OKT_DRIVE_ABIERTO: '1' } });
  assert.equal(r.codigo, 2);
  assert.match(r.error, /Drive/);

  // Los intentos fallidos anotan una mejora en .cerebro: se guarda antes de contar.
  git(v.vault, 'add', '-A');
  git(v.vault, 'commit', '-q', '-m', 'registros');
  const commits = git(v.vault, 'rev-list', '--count', 'HEAD').stdout.trim();
  r = v.okt(['espacio', 'git', 'purgar'], { env });
  assert.equal(r.codigo, 0, r.error);
  assert.match(git(v.vault, 'log', '--all', '--name-only', '--pretty=format:').stdout, /\.m4a/, 'la vista previa no reescribe');

  r = v.okt(['espacio', 'git', 'purgar', '--aplicar'], { env });
  assert.equal(r.codigo, 0, r.error);
  assert.doesNotMatch(git(v.vault, 'log', '--all', '--name-only', '--pretty=format:').stdout, /\.m4a|\.onnx/);
  // filter-repo quita los commits que solo tocaban binarios (quedan vacíos); los de las notas se conservan.
  assert.ok(Number(git(v.vault, 'rev-list', '--count', 'HEAD').stdout.trim()) >= Number(commits) - 1);
  const asuntos = git(v.vault, 'log', '--pretty=%s').stdout;
  for (const s of ['inicial con binarios', 'segunda', 'registros']) assert.match(asuntos, new RegExp(s), `conserva el commit «${s}»`);
  assert.match(git(v.vault, 'log', '-p', '--', `${TEMA}/🫀 Infarto.md`).stdout, /Troponina/, 'conserva la historia de las notas');
  assert.ok(existsSync(join(v.vault, `${TEMA}/🎧 clase.m4a`)), 'el audio sigue en disco');
  assert.ok(existsSync(join(v.vault, '.obsidian/plugins/voz/piper/models/es.onnx')));
  const bundles = readdirSync(respaldos).filter((n) => n.endsWith('.bundle'));
  assert.equal(bundles.length, 1, 'dejó el respaldo');
  assert.equal(spawnSync('git', ['bundle', 'verify', join(respaldos, bundles[0])], { cwd: v.vault }).status, 0);
  v.borrar();
});
