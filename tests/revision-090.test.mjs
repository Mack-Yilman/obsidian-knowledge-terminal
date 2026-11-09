// Regresiones de la revisión final de la 0.9.0 (Gemini Argon): cada prueba falla con el código anterior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { vaultNuevo, escribir, RAIZ } from './ayuda.mjs';
import { conEmoji } from '../scripts/lib/estructura.mjs';
import { guardarSinCerrar } from '../scripts/lib/git.mjs';
import { detectar, descartar } from '../scripts/lib/jerarquia.mjs';
import { preparar, aplicar } from '../scripts/lib/libro.mjs';

process.env['OKT_BIN_TODO-A-MARKDOWN'] = join(RAIZ, 'tests', 'fakes', 'todo-a-markdown.mjs');
process.env.OKT_FECHA = '2026-10-22T10:30';
const AREAS = '02 │ 🧭 Areas';
const cfg = (v) => JSON.parse(readFileSync(join(v.vault, '.cerebro/config.json'), 'utf8'));

test('conEmoji solo conserva el número en carpetas: una copia en Bruto no lo lleva', () => {
  assert.equal(conEmoji('bruto', '01 │ 🫀 Cardiología'), '📥 Cardiología');
  assert.equal(conEmoji('tema', '01 │ 🫀 Cardiología'), '01 │ 🫀 Cardiología');
});

test('guardarSinCerrar: los registros de .cerebro se guardan sin avisar; un cambio del usuario sí avisa', () => {
  const v = vaultNuevo();
  const g = (...a) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...a], { cwd: v.vault, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('commit', '-q', '-m', 'inicio');
  const env = process.env.OKT_SIN_GIT;
  delete process.env.OKT_SIN_GIT;
  try {
    writeFileSync(join(v.vault, '.cerebro/agentes.json'), '{"carpetas":{}}\n');
    assert.equal(guardarSinCerrar(v.vault).hecho, false, 'solo registros: sin aviso');
    assert.equal(g('status', '--porcelain').stdout.trim(), '', 'pero quedaron en un commit');
    escribir(v.vault, `${AREAS}/🧭 Medicina/💡 Nota.md`, '# 💡 Nota\n');
    const r = guardarSinCerrar(v.vault);
    assert.equal(r.hecho, true);
    assert.equal(r.cambios, 1);
  } finally {
    if (env !== undefined) process.env.OKT_SIN_GIT = env;
  }
  v.borrar();
});

test('mover un tema de libro (su ficha 📄 comparte el nombre base) renumera sin quedar a medias', () => {
  const v = vaultNuevo({ areas: 'Medicina,Personal', numerar: 'si' });
  assert.equal(v.okt(['tema', 'nuevo', 'Medicina/📚 Semiología']).codigo, 0);
  assert.equal(v.okt(['tema', 'nuevo', 'Personal/🏃 Deporte']).codigo, 0);
  const tema = `${AREAS}/01 │ 🧭 Medicina/01 │ 📚 Semiología`;
  escribir(v.vault, `${tema}/📄 Semiología.md`, '---\ntipo: fuente\ncreado: 2026-10-22\n---\n\n# 📄 Semiología\n');
  const r = v.okt(['mover', '01 │ 📚 Semiología', 'Personal']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, `${AREAS}/02 │ 🧭 Personal/02 │ 📚 Semiología/02 │ 📚 Semiología.md`)));
  assert.ok(existsSync(join(v.vault, `${AREAS}/02 │ 🧭 Personal/02 │ 📚 Semiología/📄 Semiología.md`)));
  v.borrar();
});

test('un candidato descartado de la jerarquía no reaparece al numerar', () => {
  const v = vaultNuevo();
  for (const n of ['Uno', 'Dos', 'Tres', 'Cuatro']) escribir(v.vault, `${AREAS}/🧭 Medicina/💡 ${n}.md`, `---\ntipo: nota\ncreado: 2026-10-22\n---\n\n# 💡 ${n}\n`);
  const [c] = detectar(v.vault);
  descartar(v.vault, c.id);
  assert.equal(v.okt(['numerar', '--aplicar']).codigo, 0);
  assert.equal(detectar(v.vault).length, 0);
  v.borrar();
});

test('numerar --carpeta no activa la numeración de todo el vault, y una hija repetida en el orden no cuenta doble', () => {
  const v = vaultNuevo();
  for (const t of ['Medicina/🫀 Cardiología', 'Medicina/🧠 Neurología']) assert.equal(v.okt(['tema', 'nuevo', t]).codigo, 0);
  const orden = join(v.dir, 'orden.json');
  writeFileSync(orden, JSON.stringify({ Medicina: ['Neurología', 'Neurología', 'Cardiología'] }));
  const r = v.okt(['numerar', '--carpeta', 'Medicina', '--orden', orden, '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, `${AREAS}/🧭 Medicina/01 │ 🧠 Neurología`)));
  assert.ok(existsSync(join(v.vault, `${AREAS}/🧭 Medicina/02 │ 🫀 Cardiología`)));
  assert.notEqual(cfg(v).numerar_carpetas, true);
  v.borrar();
});

test('numerar rechaza un nombre que también existe en otra rama (sus enlaces serían ambiguos)', () => {
  const v = vaultNuevo();
  assert.equal(v.okt(['tema', 'nuevo', 'Medicina/📂 Varios']).codigo, 0);
  const otra = `${AREAS}/🧭 Personal/📂 Varios`;
  escribir(v.vault, `${otra}/📂 Varios.md`, '---\ntipo: tema\ncreado: 2026-10-22\nactualizado: 2026-10-22\n---\n\n# 📂 Varios\n');
  const r = v.okt(['numerar', '--carpeta', 'Medicina', '--aplicar']);
  assert.equal(r.codigo, 3);
  assert.match(r.error, /más de una carpeta/);
  v.borrar();
});

test('libro: un libro a medias termina aunque su tema se haya renumerado; un original ya guardado en Bruto no se mueve', () => {
  const v = vaultNuevo();
  const original = '04 │ 🗄️ Archivo/📥 Bruto/2026-10/Tratado.epub';
  escribir(v.vault, original, 'title: Tratado\nauthor: Autora\n');
  const prep = preparar(v.vault, original, { en: 'Medicina' });
  assert.equal(prep.datos.estado, 'pendiente');
  renameSync(join(v.vault, prep.datos.tema), join(v.vault, `${AREAS}/🧭 Medicina/04 │ 📚 Tratado`));
  renameSync(join(v.vault, `${AREAS}/🧭 Medicina/04 │ 📚 Tratado/📚 Tratado.md`), join(v.vault, `${AREAS}/🧭 Medicina/04 │ 📚 Tratado/04 │ 📚 Tratado.md`));
  const fin = aplicar(v.vault, 'Tratado', { aceptar: '' });
  assert.equal(fin.datos.tema, `${AREAS}/🧭 Medicina/04 │ 📚 Tratado`);
  assert.ok(existsSync(join(v.vault, fin.datos.ficha)));
  assert.ok(existsSync(join(v.vault, original)), 'el original ya guardado sigue en su lugar');
  assert.match(fin.texto, /ya estaba guardado/);
  v.borrar();
});
