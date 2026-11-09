import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { calcularHuellas } from '../scripts/huellas.mjs';
import { verificarHuellas } from '../scripts/lib/doctor.mjs';
import { RAIZ_PLUGIN } from '../scripts/lib/rutas.mjs';
import { temporal } from './ayuda.mjs';

test('scripts/huellas.json está al día con el código', () => {
  const rutaJson = join(RAIZ_PLUGIN, 'scripts', 'huellas.json');
  assert.ok(existsSync(rutaJson), 'scripts/huellas.json no existe: ejecuta npm run huellas');
  const enDisco = JSON.parse(readFileSync(rutaJson, 'utf8'));
  const enMemoria = calcularHuellas(RAIZ_PLUGIN);
  assert.deepEqual(enDisco, enMemoria, 'scripts/huellas.json no está al día: ejecuta npm run huellas');
});

test('verificarHuellas reporta archivo modificado y no reporta CRLF agregado', () => {
  const t = temporal('okt-huellas-');
  const dirCopia = t.dir;

  cpSync(join(RAIZ_PLUGIN, 'package.json'), join(dirCopia, 'package.json'));
  for (const c of ['scripts', 'skills', 'references', 'plantillas']) {
    const src = join(RAIZ_PLUGIN, c);
    if (existsSync(src)) cpSync(src, join(dirCopia, c), { recursive: true });
  }

  const rLimpio = verificarHuellas(dirCopia);
  assert.equal(rLimpio.ok, true);
  assert.deepEqual(rLimpio.cambiados, []);

  const rutaMod = join(dirCopia, 'scripts', 'lib', 'rutas.mjs');
  const original = readFileSync(rutaMod, 'utf8');
  writeFileSync(rutaMod, `${original}\n// cambio de prueba\n`);

  const rMod = verificarHuellas(dirCopia);
  assert.equal(rMod.ok, false);
  assert.ok(rMod.cambiados.includes('scripts/lib/rutas.mjs'));

  const conCrlf = original.replace(/\r?\n/g, '\r\n');
  writeFileSync(rutaMod, conCrlf);

  const rCrlf = verificarHuellas(dirCopia);
  assert.equal(rCrlf.ok, true);
  assert.deepEqual(rCrlf.cambiados, []);

  t.borrar();
});
