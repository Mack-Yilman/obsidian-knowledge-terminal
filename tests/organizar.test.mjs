// De bruto a procesado: okt procesar, okt mover y los originales en 90 │ 🗄️ Archivo/📥 Bruto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');
const MEDICINA = '20 │ 🧭 Areas/🧭 Medicina';
const BRUTO = '90 │ 🗄️ Archivo/📥 Bruto/2026-10';

function conCaptura() {
  const v = vaultNuevo();
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  escribir(v.vault, '00 │ 📥 Bandeja/📲 2026-10-21 1805 troponina sube.md', '---\ntipo: captura\ncreado: 2026-10-21\norigen: telegram\nurl: https://ejemplo.org\n---\n\n# 📲 troponina sube\n\nla troponina sube a las 3 horas, eso dijo el profe\n');
  return v;
}

test('procesar: la captura pasa a ser la nota en su tema, con título y propiedades nuevas; no queda copia', () => {
  const v = conCaptura();
  const r = v.okt(['procesar', 'troponina sube', '--a', 'Medicina/Cardiología', '--titulo', '🧪 Troponina', '--resumen', 'Marcador de necrosis.']);
  assert.equal(r.codigo, 0, r.error);
  const rel = `${MEDICINA}/🫀 Cardiología/🧪 Troponina.md`;
  const texto = leer(v, rel);
  assert.match(texto, /^---\ntipo: nota\ncreado: 2026-10-21\nactualizado: 2026-10-22\nestado: borrador\nresumen: Marcador de necrosis\.\naliases:\n {2}- Troponina\nurl: https:\/\/ejemplo\.org\n---\n/);
  assert.doesNotMatch(texto, /origen:/, 'el origen es de la captura, no de la nota');
  assert.match(texto, /^# 🧪 Troponina$/m);
  assert.match(texto, /la troponina sube a las 3 horas, eso dijo el profe/, 'ordenar no cambia sus frases');
  assert.equal(readdirSync(join(v.vault, '00 │ 📥 Bandeja')).length, 0);
  assert.ok(!existsSync(join(v.vault, '90 │ 🗄️ Archivo/📥 Bruto')), 'si la captura es la nota tal cual, no queda copia en bruto');
  v.borrar();
});

test('procesar: pide carpeta y título, y no deja usar el nombre de otra nota', () => {
  const v = conCaptura();
  assert.equal(v.okt(['procesar', 'troponina sube', '--titulo', 'X']).codigo, 2);
  assert.equal(v.okt(['procesar', 'troponina sube', '--a', 'Medicina']).codigo, 2);
  v.okt(['nota', 'nueva', 'nota', '🧪 Troponina', '--carpeta', 'Medicina']);
  const r = v.okt(['procesar', 'troponina sube', '--a', 'Medicina/Cardiología', '--titulo', '🔬 Troponina']);
  assert.equal(r.codigo, 3);
  assert.match(r.error, /--en/, 'sugiere agregar el contenido a la nota existente');
  v.borrar();
});

test('procesar --en: el contenido ya está en otras notas; el original va a Bruto, enlazado desde cada una', () => {
  const v = conCaptura();
  v.okt(['nota', 'nueva', 'nota', '🫀 Infarto', '--carpeta', 'Medicina/Cardiología']);
  v.okt(['nota', 'nueva', 'nota', '🧪 Troponina', '--carpeta', 'Medicina/Cardiología']);
  const r = v.okt(['procesar', 'troponina sube', '--en', '🫀 Infarto,🧪 Troponina']);
  assert.equal(r.codigo, 0, r.error);
  const original = `${BRUTO}/📥 2026-10-21 1805 troponina sube.md`;
  const bruto = leer(v, original);
  assert.match(bruto, /procesado: 2026-10-22\nen:\n {2}- "\[\[🫀 Infarto\]\]"\n {2}- "\[\[🧪 Troponina\]\]"/);
  assert.match(bruto, /eso dijo el profe/);
  for (const n of ['🫀 Infarto', '🧪 Troponina']) assert.match(leer(v, `${MEDICINA}/🫀 Cardiología/${n}.md`), /bruto:\n {2}- "\[\[📥 2026-10-21 1805 troponina sube\]\]"/);
  // Lo archivado no impide reutilizar el nombre ni rompe los enlaces.
  const lint = JSON.parse(v.okt(['lint', '--json']).salida);
  assert.ok(!lint.hallazgos.some((h) => h.regla === 'enlace_roto'), JSON.stringify(lint.hallazgos));
  v.borrar();
});

test('bruto guardar copia el original antes de reescribir; bruto limpiar borra lo viejo solo con --aplicar', () => {
  const v = conCaptura();
  v.okt(['procesar', 'troponina sube', '--a', 'Medicina/Cardiología', '--titulo', '🧪 Troponina', '--resumen', 'r']);
  let r = v.okt(['bruto', 'guardar', '🧪 Troponina']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, `${BRUTO}/📥 Troponina.md`), /eso dijo el profe/, 'el original lleva el emoji 📥 en vez del suyo');
  assert.match(leer(v, `${MEDICINA}/🫀 Cardiología/🧪 Troponina.md`), /bruto:\n {2}- "\[\[📥 Troponina\]\]"/);
  // A los 90 días: sin --aplicar solo lista; con --aplicar borra y quita el enlace de la propiedad «bruto».
  const env = { OKT_FECHA: '2027-03-01T10:00' };
  r = v.okt(['bruto', 'limpiar'], { env });
  assert.match(r.salida, /1 originales en bruto/);
  assert.ok(existsSync(join(v.vault, `${BRUTO}/📥 Troponina.md`)));
  r = v.okt(['bruto', 'limpiar', '--aplicar'], { env });
  assert.equal(r.codigo, 0, r.error);
  assert.ok(!existsSync(join(v.vault, `${BRUTO}/📥 Troponina.md`)));
  assert.doesNotMatch(leer(v, `${MEDICINA}/🫀 Cardiología/🧪 Troponina.md`), /bruto:/);
  v.borrar();
});

test('revisión de Argon: el área no pasa a ser tema, la Bandeja y el Sistema no son destino, y los originales no repiten nombre', () => {
  const v = conCaptura();
  // «Medicina/Medicina» no convierte la nota del área en tema.
  let r = v.okt(['tema', 'nuevo', 'Medicina/Medicina']);
  assert.equal(r.codigo, 3, r.error);
  assert.match(leer(v, `${MEDICINA}/🧭 Medicina.md`), /tipo: area/);
  // Fuera de un área o un proyecto no se crean temas ni se procesan notas.
  assert.equal(v.okt(['tema', 'nuevo', 'bandeja/🫀 Cardiología']).codigo, 2);
  assert.equal(v.okt(['procesar', 'troponina sube', '--a', 'sistema', '--titulo', '💡 Idea']).codigo, 2);
  // Un original guardado otro mes con el mismo nombre lleva « 2»: la propiedad «bruto» enlaza por nombre.
  v.okt(['procesar', 'troponina sube', '--a', 'Medicina/Cardiología', '--titulo', '🧪 Troponina', '--resumen', 'r']);
  v.okt(['bruto', 'guardar', '🧪 Troponina']);
  r = v.okt(['bruto', 'guardar', '🧪 Troponina'], { env: { OKT_FECHA: '2027-02-10T10:00' } });
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '90 │ 🗄️ Archivo/📥 Bruto/2027-02/📥 Troponina 2.md')));
  assert.match(leer(v, `${MEDICINA}/🫀 Cardiología/🧪 Troponina.md`), /bruto:\n {2}- "\[\[📥 Troponina\]\]"\n {2}- "\[\[📥 Troponina 2\]\]"/);
  v.borrar();
});

test('mover: una nota a otro tema y un tema entero con su carpeta', () => {
  const v = vaultNuevo();
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  v.okt(['tema', 'nuevo', 'Medicina/🦠 Infectología']);
  v.okt(['nota', 'nueva', 'nota', '💊 Amoxicilina', '--carpeta', 'Medicina/Cardiología']);
  let r = v.okt(['mover', 'Amoxicilina', 'Medicina/Infectología']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, `${MEDICINA}/🦠 Infectología/💊 Amoxicilina.md`)));
  // Un tema se mueve con todo lo que tiene.
  r = v.okt(['mover', '🦠 Infectología', 'Medicina/Cardiología']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, `${MEDICINA}/🫀 Cardiología/🦠 Infectología/💊 Amoxicilina.md`)));
  // Ni un área dentro de otra, ni un tema dentro de sí mismo.
  assert.equal(v.okt(['mover', '🧭 Personal', 'Medicina']).codigo, 2);
  assert.equal(v.okt(['mover', '🫀 Cardiología', 'Medicina/Cardiología/Infectología']).codigo, 2);
  v.borrar();
});
