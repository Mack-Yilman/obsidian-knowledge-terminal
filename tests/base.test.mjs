import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ahora, fechaISO, semanaISO } from '../scripts/lib/fechas.mjs';
import { leerFrontmatter, escribirFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { reemplazarBloque, leerBloque } from '../scripts/lib/bloques.mjs';
import { nombreValido, limpiarNombre } from '../scripts/lib/nombres.mjs';

test('fechas: OKT_FECHA fija la fecha local', () => {
  process.env.OKT_FECHA = '2026-10-22T23:30';
  const d = ahora();
  assert.equal(fechaISO(d), '2026-10-22');
  assert.equal(semanaISO(d), '2026-W43');
  delete process.env.OKT_FECHA;
});

test('semanaISO: el 1 de enero puede pertenecer al año anterior', () => {
  assert.equal(semanaISO(new Date(2027, 0, 1)), '2026-W53');
  assert.equal(semanaISO(new Date(2026, 0, 1)), '2026-W01');
});

test('frontmatter: lee escalares, listas y comillas', () => {
  const texto = [
    '---',
    'tipo: concepto',
    'resumen: "Idea: con dos puntos"',
    'fuentes:',
    '  - "[[Guía A]]"',
    '  - "[[Guía B]]"',
    'tags: [medicina, tesis]',
    'vacio:',
    '---',
    '# Cuerpo',
  ].join('\n');
  const { datos, cuerpo } = leerFrontmatter(texto);
  assert.equal(datos.tipo, 'concepto');
  assert.equal(datos.resumen, 'Idea: con dos puntos');
  assert.deepEqual(datos.fuentes, ['[[Guía A]]', '[[Guía B]]']);
  assert.deepEqual(datos.tags, ['medicina', 'tesis']);
  assert.equal(datos.vacio, '');
  assert.equal(cuerpo, '# Cuerpo');
});

test('frontmatter: sin bloque devuelve datos vacíos', () => {
  const { datos, cuerpo } = leerFrontmatter('hola');
  assert.deepEqual(datos, {});
  assert.equal(cuerpo, 'hola');
});

test('frontmatter: CRLF se lee igual', () => {
  const { datos, cuerpo } = leerFrontmatter('---\r\ntipo: fuente\r\n---\r\nTexto');
  assert.equal(datos.tipo, 'fuente');
  assert.equal(cuerpo, 'Texto');
});

test('frontmatter: escribe y vuelve a leer lo mismo', () => {
  const datos = { tipo: 'fuente', resumen: 'Algo: raro #1', fuentes: ['[[X]]'], url: '' };
  const texto = escribirFrontmatter(datos, '# T\n');
  assert.match(texto, /^---\ntipo: fuente\n/);
  assert.match(texto, /resumen: "Algo: raro #1"/);
  assert.match(texto, /  - "\[\[X\]\]"/);
  assert.deepEqual(leerFrontmatter(texto).datos, datos);
});

test('bloques: reemplaza solo entre las marcas', () => {
  const texto = 'antes\n<!-- okt:inicio -->\nviejo\n<!-- okt:fin -->\ndespués';
  const nuevo = reemplazarBloque(texto, 'nuevo\ncontenido');
  assert.equal(nuevo, 'antes\n<!-- okt:inicio -->\nnuevo\ncontenido\n<!-- okt:fin -->\ndespués');
  assert.equal(leerBloque(nuevo), 'nuevo\ncontenido');
});

test('bloques: sin marcas, las agrega al final', () => {
  const nuevo = reemplazarBloque('texto del usuario', 'x');
  assert.equal(nuevo, 'texto del usuario\n\n<!-- okt:inicio -->\nx\n<!-- okt:fin -->\n');
});

test('nombres: detecta caracteres prohibidos y los limpia', () => {
  assert.equal(nombreValido('Guía MINSA de anemia 2024'), true);
  assert.equal(nombreValido('Sepsis: definición'), false);
  assert.equal(limpiarNombre('Sepsis: definición — 2024 / v2?'), 'Sepsis - definición - 2024 - v2');
  assert.equal(limpiarNombre('  [[Hola]]  '), 'Hola');
  assert.equal(limpiarNombre('2026-10-22'), '2026-10-22');
  assert.equal(limpiarNombre('A: / B'), 'A - B');
});
