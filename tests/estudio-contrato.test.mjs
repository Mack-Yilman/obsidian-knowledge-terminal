import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, temporal } from './ayuda.mjs';
import { validar, CAMPOS, guardar, leer, agregarEvento, DIR_ESTUDIO } from '../scripts/lib/estudio-datos.mjs';

const CONTRATO = readFileSync(join(RAIZ, 'references', 'contrato-estudio.md'), 'utf8');
const ejemplos = [...CONTRATO.matchAll(/```json okt:([a-z]+)\n([\s\S]*?)```/g)].map(([, tipo, json]) => ({ tipo, dato: JSON.parse(json) }));

test('el contrato trae un ejemplo de cada formato y todos pasan la validación', () => {
  const tipos = new Set(ejemplos.map((e) => e.tipo));
  for (const t of ['metas', 'perfil', 'temas', 'evento', 'paquete', 'recibo', 'plan']) assert.ok(tipos.has(t), `falta el ejemplo okt:${t}`);
  for (const { tipo, dato } of ejemplos) assert.deepEqual(validar(tipo, dato), [], `okt:${tipo} no valida`);
});

test('cada campo que valida el código está nombrado en el contrato', () => {
  for (const c of CAMPOS) assert.ok(CONTRATO.includes(`\`${c}\``) || CONTRATO.includes(`\`${c}?\``) || CONTRATO.includes(`"${c}"`), `el contrato no nombra «${c}»`);
});

test('las muestras inválidas fallan con un mensaje que dice dónde', () => {
  const de = (tipo) => structuredClone(ejemplos.find((e) => e.tipo === tipo).dato);
  const casos = [
    ['metas', (d) => delete d.metas[0].fecha, /fecha/],
    ['metas', (d) => (d.metas[0].temario[0].peso = 0), /peso/],
    ['metas', (d) => (d.metas[0].id = 'ENCAPS 2027'), /id/],
    ['perfil', (d) => (d.retencion_deseada = 0.99), /retencion_deseada/],
    ['temas', (d) => (d.temas['insuficiencia-cardiaca'].fsrs.estabilidad = -1), /estabilidad/],
    ['temas', (d) => (d.temas['Mal Id'] = d.temas.neumonia), /Mal Id/],
    ['recibo', (d) => (d.calificacion = 'bien'), /calificacion/],
    ['recibo', (d) => (d.evaluador = 'gemini-4-hydrogen'), /evaluador/],
    ['paquete', (d) => delete d.canonica, /canonica/],
    ['evento', (d) => (d.total = -1), /total/],
    ['plan', (d) => (d.dias[0].bloques[0].herramienta = 'anki'), /herramienta/],
    ['evento', (d) => (d.tipo = 'charla'), /tipo de evento/],
  ];
  for (const [tipo, romper, patron] of casos) {
    const d = de(tipo);
    romper(d);
    const errores = validar(tipo, d);
    assert.ok(errores.length > 0, `${tipo}: debió fallar (${patron})`);
    assert.match(errores.join('\n'), patron);
  }
  // El paquete ciego no lleva nada más que lo del contrato; tampoco la confianza, que sesgaría al evaluador.
  assert.deepEqual(Object.keys(de('paquete')).sort(), ['canonica', 'concepto', 'id', 'pregunta', 'respuesta', 'rubrica', 'version']);
});

test('error: tipo_error sigue el patrón C-XXX-NN y es opcional', () => {
  const base = { id: 'ev-1', ts: '2026-12-22T20:30:00-05:00', origen: 'cli', tipo: 'error', tema: 'neumonia' };
  assert.deepEqual(validar('evento', base), []);
  assert.deepEqual(validar('evento', { ...base, tipo_error: 'C-INT-02' }), []);
  assert.ok(validar('evento', { ...base, tipo_error: 'anclaje' }).length);
});

test('guardar valida antes de escribir y agregarEvento numera los ids del día', () => {
  const t = temporal();
  process.env.OKT_FECHA = '2026-12-22T20:15';
  try {
    assert.deepEqual(leer(t.dir, 'metas'), { version: 1, metas: [] });
    assert.deepEqual(leer(t.dir, 'eventos'), []);
    assert.throws(() => guardar(t.dir, 'metas', { version: 1, metas: [{ id: 'x' }] }), /inválidos/);
    assert.equal(existsSync(join(t.dir, DIR_ESTUDIO, 'metas.json')), false);
    const metas = ejemplos.find((e) => e.tipo === 'metas').dato;
    guardar(t.dir, 'metas', metas);
    assert.deepEqual(leer(t.dir, 'metas'), metas);
    const a = agregarEvento(t.dir, { tipo: 'sesion', minutos: 90, actividad: 'lectura' });
    const b = agregarEvento(t.dir, { tipo: 'checkin', bloque: '2026-12-22-1', estado: 'hecho', herramienta: 'remnote', minutos: 20, origen: 'telegram' });
    assert.equal(a.id, 'ev-20261222-0001');
    assert.equal(b.id, 'ev-20261222-0002');
    assert.match(a.ts, /^2026-12-22T20:15:00[+-]\d{2}:\d{2}$/);
    assert.throws(() => agregarEvento(t.dir, { tipo: 'sesion', minutos: -5, actividad: 'lectura' }), /minutos/);
    assert.equal(leer(t.dir, 'eventos').length, 2);
  } finally {
    delete process.env.OKT_FECHA;
    t.borrar();
  }
});
