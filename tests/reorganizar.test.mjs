import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';

const MEDICINA = '20 │ 🧭 Areas/🧭 Medicina';

function conNotas() {
  const v = vaultNuevo();
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  v.okt(['nota', 'nueva', 'nota', '🫀 Infarto', '--carpeta', 'Medicina/Cardiología', '--resumen', 'Necrosis miocárdica.']);
  v.okt(['nota', 'nueva', 'nota', '💔 Angina inestable', '--carpeta', 'Medicina/Cardiología', '--resumen', 'Dolor sin necrosis.']);
  v.okt(['nota', 'nueva', 'nota', '🩸 Anemia', '--carpeta', 'Medicina', '--resumen', 'Hb baja.']);
  escribir(v.vault, `${MEDICINA}/🫀 Cardiología/🧪 Troponina.md`, '---\ntipo: nota\nresumen: Marcador.\n---\n\n# 🧪 Troponina\n\nSube en el [[🫀 Infarto]].\n');
  return v;
}

test('reorganizar preparar: mapa compacto con resúmenes y enlaces, sin el texto de las notas', () => {
  const v = conNotas();
  const r = v.okt(['reorganizar', 'preparar', '--carpeta', 'Medicina']);
  assert.equal(r.codigo, 0, r.error);
  const paquete = readFileSync(join(v.vault, r.salida.match(/Mapa: (\S+)/)[1]), 'utf8');
  assert.match(paquete, /- 🫀 Infarto \(nota · 0 enlaces → · 1 ←\): Necrosis miocárdica\./);
  assert.match(paquete, /🧭 Medicina \(area · nota principal/);
  assert.doesNotMatch(paquete, /Sube en el/, 'no copia el texto');
  assert.match(r.salida, /"operaciones"/);
  v.borrar();
});

test('reorganizar aplicar: crea el tema, mueve y renombra en orden; un plan con errores no toca nada', () => {
  const v = conNotas();
  const malo = escribir(v.dir, 'malo.json', JSON.stringify({ operaciones: [
    { tema: 'Medicina/Cardiología/💔 Síndrome coronario agudo' },
    { mover: '🫀 Infarto', a: 'Medicina/Cardiología/Síndrome coronario agudo' },
    { mover: 'No existe', a: 'Medicina' },
    { renombrar: '🩸 Anemia' },
    { borrar: 'x' },
  ] }));
  let r = v.okt(['reorganizar', 'aplicar', malo]);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /no se tocó nada/);
  assert.match(r.error, /3: No encontré la nota «No existe»/);
  assert.match(r.error, /4: «renombrar» necesita «a»/);
  assert.match(r.error, /5: cada operación lleva una sola/);
  assert.ok(!existsSync(join(v.vault, `${MEDICINA}/🫀 Cardiología/💔 Síndrome coronario agudo`)), 'no creó el tema');

  const bueno = escribir(v.dir, 'bueno.json', JSON.stringify({ operaciones: [
    { tema: 'Medicina/Cardiología/💔 Síndrome coronario agudo' },
    { mover: '🫀 Infarto', a: 'Medicina/Cardiología/Síndrome coronario agudo' },
    { mover: '💔 Angina inestable', a: 'Medicina/Cardiología/Síndrome coronario agudo' },
    { renombrar: '🩸 Anemia', a: '🩸 Anemia ferropénica' },
  ] }));
  r = v.okt(['reorganizar', 'aplicar', bueno]);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Reorganizado: 4 operaciones/);
  const sca = `${MEDICINA}/🫀 Cardiología/💔 Síndrome coronario agudo`;
  assert.deepEqual(readdirSync(join(v.vault, sca)).sort(), ['💔 Angina inestable.md', '💔 Síndrome coronario agudo.md', '🫀 Infarto.md']);
  assert.ok(existsSync(join(v.vault, `${MEDICINA}/🩸 Anemia ferropénica.md`)));
  // El índice de la nota principal ya refleja el tema nuevo (cerrar regenera los índices).
  assert.match(readFileSync(join(v.vault, `${MEDICINA}/🫀 Cardiología/🫀 Cardiología.md`), 'utf8'), /\[\[💔 Síndrome coronario agudo\]\] \(2 notas\)/);
  v.borrar();
});

test('reorganizar: el plan detecta un destino fuera de las áreas, un nombre viejo ya renombrado y un choque de nombres', () => {
  const v = conNotas();
  const plan = escribir(v.dir, 'plan.json', JSON.stringify({ operaciones: [
    { mover: '🫀 Infarto', a: 'bandeja' },
    { renombrar: '🩸 Anemia', a: '🧪 Laboratorio' },
    { mover: '🩸 Anemia', a: 'Medicina' },
    { mover: '💔 Angina inestable', a: 'Medicina/Laboratorio' },
    { renombrar: '🧪 Troponina', a: '🫀 Infarto' },
    { renombrar: '🫀 Cardiología', a: '❤️ Cardiología' },
  ] }));
  const r = v.okt(['reorganizar', 'aplicar', plan]);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /1: «bandeja» no es una carpeta de un área o un proyecto/);
  assert.match(r.error, /3: «🩸 Anemia» se renombra antes en el plan/);
  assert.match(r.error, /4: «Medicina\/Laboratorio» no es una carpeta/, 'una nota renombrada no es una carpeta');
  assert.match(r.error, /5: ya existe una nota llamada «🫀 Infarto»/);
  assert.doesNotMatch(r.error, /6:/, 'cambiar solo el emoji no choca consigo misma');
  v.borrar();
});
