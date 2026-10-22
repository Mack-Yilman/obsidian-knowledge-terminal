import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');

test('bitacora agrega la línea nueva primero, con enlaces a las notas', () => {
  const v = vaultNuevo();
  const r = v.okt(['bitacora', 'capturar', 'guardó un PDF', '--notas', 'Sepsis,Guía A']);
  assert.equal(r.codigo, 0, r.error);
  const lineas = leer(v, '99-Sistema/bitacora.md').split('\n').filter((l) => l.startsWith('- '));
  assert.equal(lineas[0], '- 2026-10-22 10:30 · capturar · guardó un PDF · [[Sepsis]], [[Guía A]]');
  assert.match(lineas[1], /init/);
  v.borrar();
});

test('pendiente agregar y cerrar por número', () => {
  const v = vaultNuevo();
  v.okt(['pendiente', 'agregar', 'compilar el PDF de anemia', '--de', 'capturar', '--para', 'mantener', '--nota', 'Guía anemia']);
  v.okt(['pendiente', 'agregar', 'revisar contradicción']);
  let r = v.okt(['pendiente', 'listar']);
  assert.match(r.salida, /1\. .*capturar → mantener · compilar el PDF de anemia · \[\[Guía anemia\]\]/);
  assert.match(r.salida, /2\. .*revisar contradicción/);
  r = v.okt(['pendiente', 'cerrar', '1']);
  assert.equal(r.codigo, 0, r.error);
  const texto = leer(v, '99-Sistema/pendientes.md');
  assert.match(texto, /- \[x\] 2026-10-22 · capturar → mantener/);
  r = v.okt(['pendiente', 'listar']);
  assert.doesNotMatch(r.salida, /compilar/);
  v.borrar();
});

test('nota nueva crea la nota con frontmatter del contrato en su carpeta', () => {
  const v = vaultNuevo();
  let r = v.okt(['nota', 'nueva', 'concepto', 'Sepsis: definición', '--resumen', 'Disfunción orgánica por infección.', '--area', 'Medicina']);
  assert.equal(r.codigo, 0, r.error);
  const rel = '30-Conocimiento/conceptos/Sepsis - definición.md';
  assert.ok(existsSync(join(v.vault, rel)), r.salida);
  const texto = leer(v, rel);
  assert.match(texto, /^---\ntipo: concepto\ncreado: 2026-10-22\nactualizado: 2026-10-22\nestado: borrador\nresumen: Disfunción orgánica por infección\.\n/);
  assert.match(texto, /area: "\[\[Medicina\]\]"/);
  assert.match(texto, /# Sepsis - definición/);
  r = v.okt(['nota', 'nueva', 'concepto', 'Sepsis - definición']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.error, /ya existe/i);
  v.borrar();
});

test('nota nueva proyecto crea carpeta propia; diario usa la fecha', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'proyecto', 'Curso de Python']);
  assert.ok(existsSync(join(v.vault, '10-Proyectos/Curso de Python/Curso de Python.md')));
  v.okt(['nota', 'nueva', 'diario']);
  assert.ok(existsSync(join(v.vault, '50-Diario/2026-10-22.md')));
  v.okt(['nota', 'nueva', 'semanal']);
  assert.ok(existsSync(join(v.vault, '50-Diario/2026-W43.md')));
  v.borrar();
});

test('indice agrupa por carpeta con el resumen de cada nota', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'concepto', 'Anemia', '--resumen', 'Hb baja para edad y sexo.']);
  v.okt(['nota', 'nueva', 'fuente', 'Guía MINSA anemia', '--resumen', 'Norma técnica 2024.']);
  const r = v.okt(['indice']);
  assert.equal(r.codigo, 0, r.error);
  const texto = leer(v, '99-Sistema/indice.md');
  assert.match(texto, /## 30-Conocimiento\n\n- \[\[Anemia\]\] — Hb baja para edad y sexo\./);
  assert.match(texto, /## 40-Fuentes\n\n- \[\[Guía MINSA anemia\]\] — Norma técnica 2024\./);
  assert.doesNotMatch(texto, /\[\[hot\]\]/);
  v.borrar();
});

test('hot resume actividad, pendientes y aprendizajes, y respeta el tope de palabras', () => {
  const v = vaultNuevo();
  for (let i = 0; i < 80; i++) v.okt(['bitacora', 'capturar', `operación número ${i} con varias palabras de relleno para crecer`]);
  v.okt(['pendiente', 'agregar', 'procesar la bandeja']);
  let r = v.okt(['hot', '--aprendizaje', 'La ferritina baja confirma ferropenia.']);
  assert.equal(r.codigo, 0, r.error);
  r = v.okt(['hot', '--aprendizaje', 'Segundo aprendizaje.']);
  const texto = leer(v, '99-Sistema/hot.md');
  assert.match(texto, /## Hilos abiertos\n\n- \[ \] 2026-10-22 · .*procesar la bandeja/);
  assert.match(texto, /## Aprendizajes\n\n- 2026-10-22: Segundo aprendizaje\.\n- 2026-10-22: La ferritina/);
  assert.match(texto, /operación número 79/);
  const palabras = texto.split('<!-- okt:inicio -->')[1].split(/\s+/).filter(Boolean).length;
  assert.ok(palabras <= 520, `hot tiene ${palabras} palabras`);
  v.borrar();
});

test('cerrar hace bitácora + índice + hot en un paso', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'concepto', 'Hierro', '--resumen', 'Mineral esencial.']);
  const r = v.okt(['cerrar', 'capturar', 'creó la nota de hierro', '--notas', 'Hierro']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, '99-Sistema/bitacora.md'), /capturar · creó la nota de hierro · \[\[Hierro\]\]/);
  assert.match(leer(v, '99-Sistema/indice.md'), /\[\[Hierro\]\] — Mineral esencial\./);
  assert.match(leer(v, '99-Sistema/hot.md'), /creó la nota de hierro/);
  v.borrar();
});

test('el texto del usuario fuera de las marcas se conserva', () => {
  const v = vaultNuevo();
  const ruta = '99-Sistema/indice.md';
  escribir(v.vault, ruta, `${leer(v, ruta)}\nMi comentario al final.\n`);
  v.okt(['indice']);
  assert.match(leer(v, ruta), /Mi comentario al final\./);
  v.borrar();
});
