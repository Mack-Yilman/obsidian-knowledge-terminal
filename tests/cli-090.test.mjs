// Cableado de los comandos de la 0.9.0 en el CLI: lo que una skill llama de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');

test('un fallo del CLI queda solo en Mejoras OKT (sin duplicarse); un choque no; reportar y mejoras por el CLI', () => {
  const v = vaultNuevo();
  assert.equal(v.okt(['tema', 'nuevo', 'NoExiste/📂 Algo']).codigo, 2);
  assert.equal(v.okt(['tema', 'nuevo', 'OtraQueNo/📂 Algo']).codigo, 2);
  const lineas = leer(v, '.cerebro/mejoras.jsonl').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lineas.length, 1, 'el mismo error con otra ruta suma veces');
  assert.equal(lineas[0].veces, 2);
  assert.equal(lineas[0].comando, 'okt tema nuevo');
  v.okt(['nota', 'nueva', 'nota', '💡 Idea', '--carpeta', 'Medicina']);
  assert.equal(v.okt(['nota', 'nueva', 'nota', '💡 Idea', '--carpeta', 'Medicina']).codigo, 3);
  assert.equal(leer(v, '.cerebro/mejoras.jsonl').trim().split('\n').length, 1, 'un «ya existe» no es un fallo');

  const script = escribir(v.dir, 'mi script.mjs', 'console.log("hola ñandú")\n');
  let r = v.okt(['reportar', 'script', script, '--para', 'Saneaba viñetas dobles en libros', '--skill', 'mantener']);
  assert.equal(r.codigo, 0, r.error);
  r = v.okt(['reportar', 'idea', 'Que okt libro genere audio por capítulo']);
  assert.equal(r.codigo, 0, r.error);
  const nota = leer(v, '05 │ ⚙️ Sistema/🛠️ Mejoras OKT.md');
  assert.ok(nota.includes('Saneaba viñetas dobles'));
  assert.ok(nota.includes('.cerebro/improvisados/2026-10-22-mi script.mjs'));
  r = v.okt(['mejoras', 'exportar']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(leer(v, '.cerebro/cache/mejoras-2026-10-22.md').includes('hola ñandú'));
  assert.equal(v.okt(['mejoras', 'cerrar', '1', 'Se corrigió la ruta en la skill']).codigo, 0);
  const abiertas = v.okt(['mejoras']).salida.split('\n').filter((l) => l.startsWith('| 1 |'));
  assert.equal(abiertas.length, 0, 'la #1 ya no está entre las abiertas');
  v.borrar();
});

test('preferencia por el CLI: agregar, listar y quitar; el bloque sobrevive a okt init', () => {
  const v = vaultNuevo();
  let r = v.okt(['preferencia', 'agregar', 'Los libros van con audio e infografía por capítulo', '--sobre', 'flujo']);
  assert.equal(r.codigo, 0, r.error);
  assert.equal(v.okt(['preferencia', 'agregar', 'Todo en español de España', '--sobre', 'formato']).codigo, 0);
  assert.equal(v.okt(['init', '--aplicar']).codigo, 0);
  assert.ok(leer(v, 'AGENTS.md').includes('<!-- okt:preferencias -->\n- 2026-10-22 · flujo · Los libros van con audio'));
  assert.ok(v.okt(['preferencia', 'listar']).salida.includes('2. 2026-10-22 · formato · Todo en español de España'));
  assert.equal(v.okt(['preferencia', 'quitar', '1']).codigo, 0);
  assert.ok(!leer(v, 'AGENTS.md').includes('audio e infografía'));
  v.borrar();
});

test('jerarquia y lint por el CLI: candidatos, descartar y sin_numero en un vault numerado', () => {
  const v = vaultNuevo({ numerar: 'si' });
  const medicina = '02 │ 🧭 Areas/01 │ 🧭 Medicina';
  for (const n of ['Uno', 'Dos', 'Tres', 'Cuatro']) escribir(v.vault, `${medicina}/💡 ${n}.md`, `---\ntipo: nota\ncreado: 2026-10-22\n---\n\n# 💡 ${n}\n`);
  let r = v.okt(['jerarquia', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const { candidatos } = JSON.parse(r.salida);
  assert.equal(candidatos[0].tipo, 'notas_sueltas');
  assert.ok(v.okt(['lint']).salida.includes('notas_sueltas'));
  assert.equal(v.okt(['jerarquia', 'descartar', candidatos[0].id]).codigo, 0);
  assert.ok(v.okt(['jerarquia']).salida.includes('al día'));

  mkdirSync(join(v.vault, `${medicina}/🦴 Huesos`), { recursive: true });
  escribir(v.vault, `${medicina}/🦴 Huesos/🦴 Huesos.md`, '---\ntipo: tema\ncreado: 2026-10-22\nactualizado: 2026-10-22\n---\n\n# 🦴 Huesos\n');
  assert.match(v.okt(['lint']).salida, /sin_numero.*Huesos/);
  assert.equal(v.okt(['numerar', '--aplicar']).codigo, 0);
  assert.ok(existsSync(join(v.vault, `${medicina}/01 │ 🦴 Huesos`)));
  v.borrar();
});
