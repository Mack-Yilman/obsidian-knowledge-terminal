// Numeración «NN │ » de áreas, proyectos y temas (0.9.0): okt numerar, y que crear, mover y renombrar respeten el número.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { numeroDe, sinNumero, sinEmoji, empiezaConEmoji, emojiInicial, conNumero } from '../scripts/lib/nombres.mjs';
import { conEmoji } from '../scripts/lib/estructura.mjs';

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');
const AREAS = '02 │ 🧭 Areas';
const config = (v) => JSON.parse(leer(v, '.cerebro/config.json'));

// Un vault sin numerar, con temas, un proyecto y enlaces entre notas.
function conTemas() {
  const v = vaultNuevo({ areas: '🩺 Medicina,🌱 Personal' });
  for (const t of ['Medicina/🫀 Cardiología', 'Medicina/🧠 Neurología', 'Medicina/Cardiología/💔 Síndrome coronario', 'Personal/🏃 Deporte']) assert.equal(v.okt(['tema', 'nuevo', t]).codigo, 0);
  assert.equal(v.okt(['nota', 'nueva', 'proyecto', '🎓 Tesis de año', '--area', 'Medicina']).codigo, 0);
  assert.equal(v.okt(['nota', 'nueva', 'nota', '🧪 Troponina', '--carpeta', 'Medicina/Cardiología']).codigo, 0);
  const nota = `${AREAS}/🩺 Medicina/🫀 Cardiología/🧪 Troponina.md`;
  writeFileSync(join(v.vault, nota), `${leer(v, nota)}\nVer [[🫀 Cardiología]], [[💔 Síndrome coronario#Clínica|el SCA]] y [[🩺 Medicina]].\n`);
  return { v, nota };
}

test('nombres: el número va antes del emoji y el nombre base no lo lleva', () => {
  assert.equal(numeroDe('03 │ 🫀 Cardiología'), 3);
  assert.equal(numeroDe('🫀 Cardiología'), null);
  assert.equal(numeroDe('2026 informe'), null, 'un año al inicio no es un número de orden');
  assert.equal(sinNumero('110 │ 🫀 X'), '🫀 X');
  assert.equal(sinEmoji('03 │ 🫀 Cardiología'), 'Cardiología');
  assert.ok(empiezaConEmoji('03 │ 🫀 Cardiología'));
  assert.equal(emojiInicial('03 │ 🫀 Cardiología'), '🫀');
  assert.equal(conNumero(7, '02 │ 🫀 Cardiología'), '07 │ 🫀 Cardiología');
  assert.equal(conEmoji('tema', '03 │ 🫀 Cardiología'), '03 │ 🫀 Cardiología', 'conEmoji conserva número y emoji temático');
  assert.equal(conEmoji('area', '04 │ Medicina'), '04 │ 🧭 Medicina');
});

test('numerar: la vista previa no toca nada; aplicar numera carpetas, notas principales, enlaces, registros y AGENTS.md', () => {
  const { v } = conTemas();
  let r = v.okt(['numerar']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /🩺 Medicina → 01 │ 🩺 Medicina/);
  assert.ok(existsSync(join(v.vault, `${AREAS}/🩺 Medicina`)), 'la vista previa no renombra');

  r = v.okt(['numerar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  const cardio = `${AREAS}/01 │ 🩺 Medicina/01 │ 🫀 Cardiología`;
  assert.ok(existsSync(join(v.vault, `${cardio}/01 │ 🫀 Cardiología.md`)));
  assert.ok(existsSync(join(v.vault, `${cardio}/01 │ 💔 Síndrome coronario/01 │ 💔 Síndrome coronario.md`)), 'los temas anidados también');
  assert.ok(existsSync(join(v.vault, `${AREAS}/01 │ 🩺 Medicina/02 │ 🧠 Neurología`)), 'hermanas por orden alfabético');
  assert.ok(existsSync(join(v.vault, `${AREAS}/02 │ 🌱 Personal/01 │ 🏃 Deporte`)));
  assert.ok(existsSync(join(v.vault, '01 │ 🎯 Proyectos/01 │ 🎓 Tesis de año')));
  const tropo = leer(v, `${cardio}/🧪 Troponina.md`);
  assert.match(tropo, /\[\[01 │ 🫀 Cardiología\]\]/);
  assert.match(tropo, /\[\[01 │ 💔 Síndrome coronario#Clínica\|el SCA\]\]/, 'conserva la sección y el alias del enlace');
  assert.match(tropo, /\[\[01 │ 🩺 Medicina\]\]/);
  const principal = leer(v, `${cardio}/01 │ 🫀 Cardiología.md`);
  assert.match(principal, /^# 01 │ 🫀 Cardiología$/m);
  assert.match(principal, /aliases:\n {2}- Cardiología\n/);
  assert.match(leer(v, '01 │ 🎯 Proyectos/01 │ 🎓 Tesis de año/01 │ 🎓 Tesis de año.md'), /area: "\[\[01 │ 🩺 Medicina\]\]"/);
  assert.deepEqual(config(v).areas.sort(), ['01 │ 🩺 Medicina', '02 │ 🌱 Personal']);
  assert.equal(config(v).numerar_carpetas, true);
  assert.match(leer(v, 'AGENTS.md'), /\[\[01 │ 🩺 Medicina\]\]/);
  assert.equal(v.okt(['lint']).salida.match(/enlace_roto|sin_emoji/g), null);

  // Idempotente, y lo nuevo toma el siguiente número.
  assert.match(v.okt(['numerar']).salida, /no hay nada que cambiar/);
  assert.equal(v.okt(['tema', 'nuevo', 'Medicina/🦠 Infectología']).codigo, 0);
  assert.ok(existsSync(join(v.vault, `${AREAS}/01 │ 🩺 Medicina/03 │ 🦠 Infectología`)));
  v.borrar();
});

test('numerar --orden: renumera las hermanas en el orden pedido; un nombre que no existe no toca nada', () => {
  const { v } = conTemas();
  assert.equal(v.okt(['numerar', '--aplicar']).codigo, 0);
  const orden = join(v.dir, 'orden.json');
  writeFileSync(orden, JSON.stringify({ Medicina: ['Neurología', 'Cardiología'] }));
  let r = v.okt(['numerar', '--orden', orden, '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.deepEqual(readdirSync(join(v.vault, `${AREAS}/01 │ 🩺 Medicina`)).filter((n) => !n.endsWith('.md')).sort(), ['01 │ 🧠 Neurología', '02 │ 🫀 Cardiología']);
  assert.match(leer(v, `${AREAS}/01 │ 🩺 Medicina/02 │ 🫀 Cardiología/🧪 Troponina.md`), /\[\[02 │ 🫀 Cardiología\]\]/);

  writeFileSync(orden, JSON.stringify({ Medicina: ['Pediatría'] }));
  r = v.okt(['numerar', '--orden', orden, '--aplicar']);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /Pediatría/);
  assert.ok(existsSync(join(v.vault, `${AREAS}/01 │ 🩺 Medicina/01 │ 🧠 Neurología`)), 'no se tocó nada');
  v.borrar();
});

test('numerar: actualiza las rutas de los cuadernos vinculados y avisa de rutas largas', () => {
  const { v } = conTemas();
  const cfg = config(v);
  cfg.cuadernos = { [`${AREAS}/🩺 Medicina/🫀 Cardiología`]: { id: 'x', titulo: 'Cardio' } };
  writeFileSync(join(v.vault, '.cerebro/config.json'), JSON.stringify(cfg));
  const largo = 'Ñandú con una descripción muy larga para probar el límite de las rutas de Windows';
  assert.equal(v.okt(['tema', 'nuevo', `Personal/Deporte/🏊 ${largo}`]).codigo, 0);
  assert.equal(v.okt(['tema', 'nuevo', `Personal/Deporte/${largo}/🌊 ${largo} dos`]).codigo, 0);
  const r = v.okt(['numerar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.deepEqual(Object.keys(config(v).cuadernos), [`${AREAS}/01 │ 🩺 Medicina/01 │ 🫀 Cardiología`]);
  if (v.vault.length < 60) assert.match(r.salida, /rutas de más de 240/);
  v.borrar();
});

test('renombrar conserva el número de la carpeta; mover renumera si el número ya lo usa una hermana', () => {
  const v = vaultNuevo({ areas: '🩺 Medicina,🌱 Personal', numerar: 'si' });
  assert.equal(v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']).codigo, 0);
  assert.equal(v.okt(['tema', 'nuevo', 'Personal/🏃 Deporte']).codigo, 0);
  let r = v.okt(['renombrar', '01 │ 🫀 Cardiología', '❤️ Corazón']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, `${AREAS}/01 │ 🩺 Medicina/01 │ ❤️ Corazón/01 │ ❤️ Corazón.md`)));
  // Deporte (01 en Personal) llega a Medicina, donde ya hay un 01: toma el 02 y su nota principal también.
  r = v.okt(['mover', 'Deporte', 'Medicina']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, `${AREAS}/01 │ 🩺 Medicina/02 │ 🏃 Deporte/02 │ 🏃 Deporte.md`)));
  assert.ok(!existsSync(join(v.vault, `${AREAS}/02 │ 🌱 Personal/01 │ 🏃 Deporte`)));
  v.borrar();
});

test('tema nuevo en un vault numerado: no duplica un tema que ya existe con número, y la nota que crece toma número', () => {
  const v = vaultNuevo({ areas: 'Medicina', numerar: 'si' });
  assert.equal(v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']).codigo, 0);
  const r = v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Ya existía/);
  assert.equal(v.okt(['nota', 'nueva', 'nota', '🧠 Neurología', '--carpeta', 'Medicina']).codigo, 0);
  escribir(v.vault, `${AREAS}/01 │ 🧭 Medicina/01 │ 🫀 Cardiología/🧪 Troponina.md`, '---\ntipo: nota\ncreado: 2026-10-22\n---\n\nVer [[🧠 Neurología]].\n');
  assert.equal(v.okt(['tema', 'nuevo', 'Medicina/🧠 Neurología']).codigo, 0);
  assert.ok(existsSync(join(v.vault, `${AREAS}/01 │ 🧭 Medicina/02 │ 🧠 Neurología/02 │ 🧠 Neurología.md`)));
  assert.match(leer(v, `${AREAS}/01 │ 🧭 Medicina/01 │ 🫀 Cardiología/🧪 Troponina.md`), /\[\[02 │ 🧠 Neurología\]\]/);
  v.borrar();
});
