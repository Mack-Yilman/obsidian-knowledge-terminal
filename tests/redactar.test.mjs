import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { analizar, sugerirPerfil, partirEnTramos } from '../scripts/lib/redactar.mjs';
import { reemplazarBloque } from '../scripts/lib/bloques.mjs';

const CON_TODO = '[00:01] Ana: hola, veamos el piloto\n[00:15] Luis: de acuerdo\n[00:30] Ana: cuesta 500 soles\n[00:45] Luis: lo envío el viernes';
const SOLO_HABLANTES = '**Ana:** hola\n**Luis:** de acuerdo\n**Ana:** cuesta 500\n**Luis:** bien';
const HABLANTE_EN_SU_LINEA = 'Speaker 1 00:01\nhola\nSpeaker 2 00:15\nde acuerdo\nSpeaker 1 00:30\ncuesta 500\nSpeaker 2 00:45\nbien';
const SOLO_TIEMPOS = '00:01 hola a todos\n00:15 veamos el piloto\n00:30 cuesta 500\n00:45 lo envío\n01:00 bien\n01:15 listo';

test('analizar reconoce hablantes en cada formato y no inventa los que no hay', () => {
  assert.deepEqual(analizar(CON_TODO).hablantes, ['Ana', 'Luis']);
  assert.deepEqual(analizar(SOLO_HABLANTES).hablantes, ['Ana', 'Luis']);
  assert.deepEqual(analizar(HABLANTE_EN_SU_LINEA).hablantes, ['Speaker 1', 'Speaker 2']);
  assert.deepEqual(analizar(SOLO_TIEMPOS).hablantes, []);
  assert.equal(analizar(SOLO_TIEMPOS).tiempos, 6);
  assert.deepEqual(analizar('Nota: una idea\nOjo: otra cosa\nsigo pensando').hablantes, []);
  assert.deepEqual(analizar('Nota: una\nNota: dos\nsigo').hablantes, [], 'una sola etiqueta repetida no es una reunión');
});

test('analizar no confunde con hablantes los títulos numerados ni un CRLF', () => {
  assert.deepEqual(analizar('Tema 1\ntexto\nPaso 2\ntexto\nTema 1\nmás\nPaso 2\nmás').hablantes, []);
  assert.deepEqual(analizar(CON_TODO.replace(/\n/g, '\r\n')).hablantes, ['Ana', 'Luis']);
});

test('el origen pesa más que el parecido: una web con etiquetas no es una reunión, y en una nota propia queda dudoso', () => {
  const etiquetas = analizar('**Problema:** uno\n**Solución:** dos\n**Problema:** tres\n**Solución:** cuatro');
  assert.equal(sugerirPerfil('🌐 Web', { origen: 'web' }, etiquetas).perfil, 'ordenar');
  assert.deepEqual(sugerirPerfil('📝 idea', { origen: 'nota' }, etiquetas), { perfil: 'reunion', dudoso: true });
  assert.deepEqual(sugerirPerfil('📝 idea larga', { origen: 'nota' }, analizar('palabra '.repeat(900))), { perfil: 'propia', dudoso: false });
});

test('sugerirPerfil separa clase, reunión, nota propia y documento importado, y marca lo dudoso', () => {
  const an = (t) => analizar(t);
  assert.equal(sugerirPerfil('reunion', {}, an(CON_TODO)).perfil, 'reunion');
  assert.deepEqual(sugerirPerfil('▶️ Clase', { origen: 'youtube' }, an(SOLO_TIEMPOS)), { perfil: 'clase', dudoso: false });
  assert.deepEqual(sugerirPerfil('🌐 Página', { origen: 'web' }, an('texto')), { perfil: 'ordenar', dudoso: false });
  assert.deepEqual(sugerirPerfil('📝 idea', { origen: 'nota' }, an('se me ocurrió que…')), { perfil: 'propia', dudoso: false });
  assert.deepEqual(sugerirPerfil('📲 voz', { origen: 'telegram' }, an('se me ocurrió que…')), { perfil: 'propia', dudoso: false });
  assert.deepEqual(sugerirPerfil('grabación', {}, an(SOLO_TIEMPOS)), { perfil: 'clase', dudoso: true }, 'sin hablantes no se sabe si es clase o reunión');
  assert.deepEqual(sugerirPerfil('grabación', {}, an('palabra '.repeat(900))), { perfil: 'clase', dudoso: true });
  assert.equal(sugerirPerfil('Reunión de presupuesto', {}, an('texto corrido')).perfil, 'reunion');
});

test('partirEnTramos no pierde texto, ni con una sola línea sin puntuación', () => {
  const corrido = Array.from({ length: 3200 }, (_, i) => `p${i}`).join(' ');
  const tramos = partirEnTramos(corrido);
  assert.equal(tramos.length, 3);
  assert.equal(tramos.join(' '), corrido);
  const oraciones = Array.from({ length: 400 }, (_, i) => `Oración ${i} con varias palabras más.`).join(' ');
  const t2 = partirEnTramos(oraciones);
  assert.ok(t2.length >= 2);
  assert.equal(t2.join(' ').replace(/\s+/g, ' '), oraciones);
  for (const t of t2) assert.match(t, /\.$/, 'corta entre oraciones');
});

test('okt redactar preparar da el análisis y deja los tramos en la caché solo si hacen falta', () => {
  const v = vaultNuevo();
  escribir(v.vault, '00 │ 📥 Bandeja/grabacion.md', `---\ntipo: captura\n---\n${'palabra '.repeat(3200)}`);
  let r = v.okt(['redactar', 'preparar', 'grabacion', '--json']);
  assert.equal(r.codigo, 0, r.error);
  let d = JSON.parse(r.salida);
  assert.equal(d.tramos, 3);
  assert.equal(d.leer.length, 2);
  for (const f of d.leer) assert.ok(existsSync(f), `falta ${f}`);
  assert.equal(d.perfil, 'clase');
  assert.equal(d.dudoso, true);
  assert.equal(readdirSync(join(v.vault, d.carpeta_tramos)).length, 3);
  escribir(v.vault, '00 │ 📥 Bandeja/📝 idea.md', '---\ntipo: captura\norigen: nota\n---\nse me ocurrió algo');
  r = v.okt(['redactar', 'preparar', 'idea', '--json']);
  d = JSON.parse(r.salida);
  assert.equal(d.tramos, 0);
  assert.equal(d.perfil, 'propia');
  assert.ok(!existsSync(join(v.vault, '.cerebro/cache/tramos')), 'no deja tramos de otra nota');
  v.borrar();
});

function conOriginal(v, original, limpia) {
  v.okt(['nota', 'nueva', 'nota', '🧪 Prueba', '--carpeta', 'Medicina']);
  const ruta = '02 │ 🧭 Areas/🧭 Medicina/🧪 Prueba.md';
  const base = readFileSync(join(v.vault, ruta), 'utf8');
  escribir(v.vault, ruta, `${base.split('---').slice(0, 2).join('---')}---\n\n# 🧪 Prueba\n\n${original}\n`);
  assert.equal(v.okt(['bruto', 'guardar', '🧪 Prueba']).codigo, 0);
  const conBruto = readFileSync(join(v.vault, ruta), 'utf8');
  escribir(v.vault, ruta, `${conBruto.split('---').slice(0, 2).join('---')}---\n\n# 🧪 Prueba\n\n${limpia}\n`);
  return JSON.parse(v.okt(['redactar', 'verificar', '🧪 Prueba', '--json']).salida);
}

test('okt redactar verificar detecta cifras, URL y nombres agregados o perdidos', () => {
  const v = vaultNuevo();
  const d = conOriginal(
    v,
    'Ana dijo que cuesta 500 soles y dura dos semanas. Revisar https://ejemplo.pe/a y anotar 30 personas.',
    'Ana dijo que cuesta 800 soles, dura 14 días y lo envía Carlos con TecnoFibra. Revisar https://ejemplo.pe/b.',
  );
  assert.deepEqual(d.cifras_agregadas.sort(), ['14', '800']);
  assert.deepEqual(d.cifras_perdidas.sort(), ['30', '500']);
  assert.deepEqual(d.urls_agregadas, ['https://ejemplo.pe/b']);
  assert.deepEqual(d.urls_perdidas, ['https://ejemplo.pe/a']);
  assert.deepEqual(d.nombres_nuevos, ['Carlos']);
  v.borrar();
});

test('okt redactar verificar no avisa por lo que el perfil agrega: índice, numeración, conexiones y marcas de tiempo', () => {
  const v = vaultNuevo();
  const original = '[12:45](https://www.youtube.com/watch?v=abc&t=765s) El docente dice que son 3 tipos. Eso entra al examen.';
  const limpia = [
    '## 📑 Índice',
    '- [[#🧠 Tema 1 - Tipos|🧠 Tema 1 - Tipos]]',
    '  - [[#1.1. 🗂️ Los tipos]]',
    '',
    '## 🧠 Tema 1 - Tipos',
    '[▶️ 12:45](https://www.youtube.com/watch?v=abc&t=765s)',
    '### 1.1. 🗂️ Los tipos',
    'Son 3 tipos.',
    '> [!important] Énfasis',
    '> Eso entra al examen.',
    '',
    '## 🔗 Conexiones',
    '- Se relaciona con [[🧪 Otra nota 2026]] por sus 7 puntos.',
  ].join('\n');
  const d = conOriginal(v, original, limpia);
  for (const k of ['cifras_agregadas', 'cifras_perdidas', 'urls_agregadas', 'urls_perdidas', 'nombres_nuevos', 'indice_sin_desarrollar', 'temas_fuera_del_indice', 'encabezados_vacios']) {
    assert.deepEqual(d[k], [], `${k}: ${d[k]}`);
  }
  v.borrar();
});

test('okt redactar verificar avisa del índice sin desarrollar, encabezados vacíos y un posible resumen', () => {
  const v = vaultNuevo();
  const original = 'palabra '.repeat(400);
  const limpia = '## 📑 Índice\n- [[#🧠 Tema 1 - Uno]]\n- [[#🧠 Tema 2 - Dos]]\n\n## 🧠 Tema 1 - Uno\n\n### 1.1. Vacío\n\n## 🧠 Tema 3 - Tres\nresumen corto';
  const d = conOriginal(v, original, limpia);
  assert.deepEqual(d.indice_sin_desarrollar, ['🧠 Tema 2 - Dos']);
  assert.deepEqual(d.temas_fuera_del_indice, ['1.1. Vacío', '🧠 Tema 3 - Tres']);
  assert.deepEqual(d.encabezados_vacios, ['1.1. Vacío']);
  assert.equal(d.posible_resumen, true);
  v.borrar();
});

test('okt redactar indice arma el índice desde los encabezados, antes del primer tema, y se puede repetir', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'nota', '🧪 Clase', '--carpeta', 'Medicina']);
  const ruta = '02 │ 🧭 Areas/🧭 Medicina/🧪 Clase.md';
  const fm = readFileSync(join(v.vault, ruta), 'utf8').split('---').slice(0, 2).join('---');
  escribir(v.vault, ruta, `${fm}---\n\n# 🧪 Clase\n\n![](https://www.youtube.com/watch?v=abc)\n\n## 🧠 Tema 1 - Uno\n### 1.1. 🗂️ Sub\nTexto.\n## 🫀 Tema 2 - Dos\n### 2.1. Otro\nMás.\n\n## 🔗 Relacionado\n- [[x]]\n`);
  assert.equal(v.okt(['redactar', 'indice', 'Clase']).codigo, 0);
  const una = readFileSync(join(v.vault, ruta), 'utf8');
  assert.match(una, /watch\?v=abc\)\n\n## 📑 Índice\n\n- \[\[#🧠 Tema 1 - Uno\]\]\n  - \[\[#1\.1\. 🗂️ Sub\]\]\n- \[\[#🫀 Tema 2 - Dos\]\]\n  - \[\[#2\.1\. Otro\]\]\n\n## 🧠 Tema 1 - Uno/);
  assert.doesNotMatch(una, /Relacionado\]\]/);
  assert.equal(v.okt(['redactar', 'indice', 'Clase']).codigo, 0);
  assert.equal(readFileSync(join(v.vault, ruta), 'utf8'), una, 'repetirlo no duplica el índice');
  const d = JSON.parse(v.okt(['bruto', 'guardar', 'Clase', '--json']).salida);
  assert.ok(d.original);
  assert.deepEqual(JSON.parse(v.okt(['redactar', 'verificar', 'Clase', '--json']).salida).indice_sin_desarrollar, []);
  v.borrar();
});

test('okt redactar verificar lee CRLF, no esconde un tema llamado Conexiones y da por conservado un dato en un subtítulo', () => {
  const v = vaultNuevo();
  const d = conOriginal(
    v,
    'Aplica la Ley 30220 y son 45 alumnos. Dijo Ana algo.\r\nSon 7 redes.',
    '> [!info] 2026-10-30 · Ana\r\n\r\n## 🧠 Tema 1 - Redes y Conexiones\r\n### 1.1. Ley 30220\r\nSon 45 alumnos (1.1) y 7 redes. Dijo Hablante algo.\r\n',
  );
  assert.deepEqual(d.cifras_agregadas, []);
  assert.deepEqual(d.cifras_perdidas, []);
  assert.deepEqual(d.nombres_nuevos, []);
  v.borrar();
});

test('okt redactar indice funciona con una nota en CRLF', () => {
  const v = vaultNuevo();
  escribir(v.vault, '00 │ 📥 Bandeja/crlf.md', '---\r\ntipo: captura\r\n---\r\n\r\n# X\r\n\r\n## 🧠 Tema 1 - Uno\r\n### 1.1. Sub\r\nTexto.\r\n');
  const r = v.okt(['redactar', 'indice', 'crlf']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(readFileSync(join(v.vault, '00 │ 📥 Bandeja/crlf.md'), 'utf8'), /- \[\[#🧠 Tema 1 - Uno\]\]\n {2}- \[\[#1\.1\. Sub\]\]/);
  v.borrar();
});

test('okt redactar verificar sin original en Bruto lo dice', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'nota', '🧪 Sola', '--carpeta', 'Medicina']);
  const r = v.okt(['redactar', 'verificar', '🧪 Sola']);
  assert.equal(r.codigo, 3);
  assert.match(r.error, /bruto guardar/);
  v.borrar();
});

test('reimportar una nota ya pasada a limpio (sin marcas) agrega el bloque al final y no pierde la versión limpia', () => {
  const limpia = '# ▶️ Clase\n\n## 🧠 Tema 1 - Uno\nTexto limpio.\n';
  const nuevo = reemplazarBloque(limpia, 'transcripción en bruto');
  assert.match(nuevo, /Texto limpio\.[\s\S]*<!-- okt:inicio -->\ntranscripción en bruto\n<!-- okt:fin -->/);
});

test('okt bandeja preparar recorta los textos largos y da su perfil sugerido, para decidir la tabla sin leerlos enteros', () => {
  const v = vaultNuevo();
  escribir(v.vault, '00 │ 📥 Bandeja/reunion larga.md', `---\ntipo: captura\n---\n${'Ana: hola a todos\nLuis: de acuerdo\n'.repeat(1500)}FINAL`);
  escribir(v.vault, '00 │ 📥 Bandeja/📝 idea.md', '---\ntipo: captura\norigen: nota\n---\nuna idea corta');
  const d = JSON.parse(v.okt(['bandeja', 'preparar', '--json']).salida);
  const t = readFileSync(join(v.vault, d.paquete), 'utf8');
  assert.match(t, /Perfil sugerido: reunión · \d+ palabras/);
  assert.match(t, /Perfil sugerido: nota propia/);
  assert.match(t, /una idea corta/);
  assert.doesNotMatch(t, /FINAL/);
  assert.match(t, /recortado/);
  assert.ok(t.length < 6000, `el paquete pesa ${t.length}`);
  v.borrar();
});
