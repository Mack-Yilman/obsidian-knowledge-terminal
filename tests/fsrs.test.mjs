import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './ayuda.mjs';
import { crearFsrs, PARAMS_FSRS6 } from '../scripts/lib/fsrs.mjs';

// Vectores generados con ts-fsrs 6.0.0 real (FSRS-6, sin fuzz, sin pasos intradía): ver su campo «fuente».
const V = JSON.parse(readFileSync(join(RAIZ, 'tests', 'fixtures', 'fsrs-vectores.json'), 'utf8'));
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);

test('los parámetros por defecto son los de FSRS-6 de ts-fsrs', () => {
  assert.equal(PARAMS_FSRS6.length, 21);
  V.w.forEach((w, i) => cerca(PARAMS_FSRS6[i], w, `w[${i}]`));
});

test('reproduce los vectores de ts-fsrs: estabilidad, dificultad, intervalo, repasos, lapsos y recuperabilidad', () => {
  for (const caso of V.casos) {
    const f = crearFsrs({ retencion: caso.retencion });
    let estado = null;
    caso.pasos.forEach((p, i) => {
      const donde = `${caso.nombre} (${caso.retencion}) paso ${i + 1}`;
      if (p.r_antes !== null) cerca(f.recuperabilidad(estado, p.dias), p.r_antes, `${donde} R`);
      estado = f.repasar(estado, p.nota, p.dias ?? 0);
      cerca(estado.estabilidad, p.estabilidad, `${donde} S`);
      cerca(estado.dificultad, p.dificultad, `${donde} D`);
      assert.equal(estado.intervalo, p.intervalo, `${donde} intervalo`);
      assert.equal(estado.repasos, p.repasos, `${donde} repasos`);
      assert.equal(estado.lapsos, p.lapsos, `${donde} lapsos`);
    });
  }
});

test('propiedades: R(S) = 0,9, el intervalo crece con la retención baja y respeta el máximo', () => {
  const f = crearFsrs();
  const e = f.repasar(null, 3, 0);
  cerca(f.recuperabilidad(e, e.estabilidad), 0.9, 'R en t = S');
  assert.equal(f.recuperabilidad(e, 0), 1);
  assert.ok(crearFsrs({ retencion: 0.8 }).intervalo(50) > crearFsrs({ retencion: 0.95 }).intervalo(50));
  assert.equal(crearFsrs({ maximoDias: 30 }).intervalo(5000), 30);
  assert.ok(f.intervalo(0.01) >= 1, 'el intervalo mínimo es 1 día');
  for (const nota of [0, 5, 2.5, '3']) assert.throws(() => f.repasar(null, nota, 0), /nota/);
  assert.throws(() => f.repasar(e, 3, -1), /días/);
});

test('es pura: no modifica el estado que recibe', () => {
  const f = crearFsrs();
  const e = Object.freeze(f.repasar(null, 3, 0));
  const otro = f.repasar(e, 1, 5);
  assert.equal(e.lapsos, 0);
  assert.equal(otro.lapsos, 1);
});
