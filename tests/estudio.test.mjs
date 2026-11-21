import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { validar } from '../scripts/lib/estudio-datos.mjs';

const HOY = { OKT_FECHA: '2026-12-22T10:30' };
const DIR = '.cerebro/estudio';

function vault() {
  const v = vaultNuevo();
  const correr = (args, fecha = HOY) => v.okt(['estudio', ...args], { env: fecha });
  const ok = (args, fecha) => {
    const r = correr(args, fecha);
    assert.equal(r.codigo, 0, `okt estudio ${args.join(' ')}\n${r.error}${r.salida}`);
    return r;
  };
  const json = (args, fecha) => JSON.parse(ok([...args, '--json'], fecha).salida);
  const leer = (archivo) => JSON.parse(readFileSync(join(v.vault, DIR, archivo), 'utf8'));
  const eventos = () => readFileSync(join(v.vault, DIR, 'eventos.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { ...v, correr, ok, json, leer, eventos };
}

function conTema(v) {
  v.ok(['meta', 'agregar', 'ENCAPS 2027-I', '--tipo', 'examen', '--fecha', '2027-04-10', '--temario', 'Insuficiencia cardiaca:3,Neumonía:2']);
  v.ok(['tema', 'editar', 'insuficiencia-cardiaca', '--pregunta', 'Explica la insuficiencia cardiaca', '--canonica', 'Falla de bomba: sistólica o diastólica; congestión y bajo gasto; diurético de asa.', '--rubrica', 'Sistólica frente a diastólica|Congestión y bajo gasto|Diurético de asa']);
}

test('meta agregar crea la meta y sus temas, con ids sin tildes, y cada salida dice el siguiente comando', () => {
  const v = vault();
  const r = v.ok(['meta', 'agregar', 'ENCAPS 2027-I', '--tipo', 'examen', '--fecha', '2027-04-10', '--temario', 'Insuficiencia cardiaca:3,Neumonía:2,Asma']);
  assert.match(r.salida, /📍 siguiente: okt estudio /);
  const metas = v.leer('metas.json');
  assert.deepEqual(validar('metas', metas), []);
  assert.equal(metas.metas[0].id, 'encaps-2027-i');
  assert.equal(metas.metas[0].inicio, '2026-12-22');
  assert.deepEqual(metas.metas[0].temario, [{ tema: 'insuficiencia-cardiaca', peso: 3 }, { tema: 'neumonia', peso: 2 }, { tema: 'asma', peso: 1 }]);
  const temas = v.leer('temas.json');
  assert.deepEqual(validar('temas', temas), []);
  assert.equal(temas.temas.neumonia.titulo, 'Neumonía');
  assert.deepEqual(temas.temas.neumonia.metas, ['encaps-2027-i']);
  assert.equal(temas.temas.neumonia.fsrs, null);
  // Un examen sin fecha y una meta repetida se rechazan con un error de uso.
  assert.equal(v.correr(['meta', 'agregar', 'Otro', '--tipo', 'examen']).codigo, 2);
  assert.equal(v.correr(['meta', 'agregar', 'ENCAPS 2027-I', '--tipo', 'continuo']).codigo, 2);
  assert.equal(v.json(['meta', 'listar']).metas.length, 1);
  v.ok(['meta', 'cerrar', 'encaps-2027-i']);
  assert.equal(v.leer('metas.json').metas[0].activa, false);
  v.borrar();
});

test('perfil guarda el tiempo y convierte el cuestionario en diagnóstico con citas', () => {
  const v = vault();
  v.ok(['perfil', '--minutos-laborable', '150', '--minutos-fin', '240', '--remnote', '20', '--dias-libres', '2026-12-25,2027-01-01', '--cuestionario', '3a,5b,7d']);
  const p = v.leer('perfil.json');
  assert.deepEqual(validar('perfil', p), []);
  assert.equal(p.minutos_laborable, 150);
  assert.equal(p.remnote_min, 20);
  assert.deepEqual(p.dias_libres, ['2026-12-25', '2027-01-01']);
  assert.deepEqual(p.cuestionario, { p3: 'a', p5: 'b', p7: 'd' });
  // 7d es un hábito sano (sin recomendación): solo 3a y 5b dan diagnóstico.
  assert.deepEqual(p.diagnostico.map((d) => d.pregunta), ['p3', 'p5']);
  assert.ok(p.diagnostico.every((d) => d.citas.length > 0 && d.recomendacion));
  assert.equal(v.correr(['perfil', '--retencion', '0.99']).codigo, 1);
  assert.equal(v.correr(['perfil', '--cuestionario', '11a']).codigo, 2);
  v.borrar();
});

test('registrar examen suma aciertos por tema; error valida el tipo de la taxonomía', () => {
  const v = vault();
  conTema(v);
  v.ok(['registrar', 'examen', 'Simulacro 1', '--aciertos', '72', '--total', '100', '--por-tema', 'insuficiencia-cardiaca:7/10,neumonia:3/5']);
  v.ok(['registrar', 'examen', 'Banqueo', '--aciertos', '4', '--total', '5', '--por-tema', 'neumonia:4/5']);
  const t = v.leer('temas.json').temas;
  assert.deepEqual([t.neumonia.aciertos, t.neumonia.preguntas], [7, 10]);
  v.ok(['registrar', 'error', '--tema', 'neumonia', '--tipo', 'C-CON-03', '--flashcard', 'remnote']);
  assert.notEqual(v.correr(['registrar', 'error', '--tema', 'neumonia', '--tipo', 'anclaje']).codigo, 0);
  assert.notEqual(v.correr(['registrar', 'error', '--tema', 'no-existe']).codigo, 0);
  v.ok(['registrar', 'sesion', '--minutos', '90', '--actividad', 'lectura', '--tema', 'neumonia']);
  const ev = v.eventos();
  assert.deepEqual(ev.map((e) => e.tipo), ['examen', 'examen', 'error', 'sesion']);
  for (const e of ev) assert.deepEqual(validar('evento', e), []);
  v.borrar();
});

test('calificar preparar escribe un paquete ciego: solo el paquete en su carpeta y sin la confianza', () => {
  const v = vault();
  conTema(v);
  const resp = escribir(v.dir, 'respuesta.txt', 'Falla la bomba y se acumula líquido; furosemida.');
  // Sin pregunta, canónica o rúbrica no se puede calificar.
  assert.equal(v.correr(['calificar', 'preparar', '--tema', 'neumonia', '--respuesta', resp]).codigo, 2);
  const d = v.json(['calificar', 'preparar', '--tema', 'insuficiencia-cardiaca', '--respuesta', resp, '--confianza', '70']);
  assert.match(d.id, /^cal-20261222-\d{4}$/);
  const carpeta = join(v.vault, '.cerebro/cache/estudio/calificar', d.id);
  assert.deepEqual(readdirSync(carpeta), ['paquete.json']);
  const paq = JSON.parse(readFileSync(join(carpeta, 'paquete.json'), 'utf8'));
  assert.deepEqual(validar('paquete', paq), []);
  assert.deepEqual(Object.keys(paq).sort(), ['canonica', 'concepto', 'id', 'pregunta', 'respuesta', 'rubrica', 'version']);
  assert.equal(paq.respuesta, 'Falla la bomba y se acumula líquido; furosemida.');
  const aparte = JSON.parse(readFileSync(join(v.vault, '.cerebro/cache/estudio/calificar', `${d.id}.json`), 'utf8'));
  assert.deepEqual(aparte, { tema: 'insuficiencia-cardiaca', confianza: 70, preparado: '2026-12-22' });
  assert.equal(v.correr(['calificar', 'preparar', '--tema', 'insuficiencia-cardiaca', '--respuesta', resp, '--confianza', '80']).codigo, 2);
  v.borrar();
});

function recibo(v, id, calificacion, errores = []) {
  return escribir(v.dir, `recibo-${id}-${calificacion}.json`, JSON.stringify({
    version: 1,
    paquete: id,
    calificacion,
    criterios: [{ criterio: 'Sistólica frente a diastólica', cumple: true, nota: '' }, { criterio: 'Congestión y bajo gasto', cumple: calificacion === 'recordado', nota: '' }, { criterio: 'Diurético de asa', cumple: true, nota: '' }],
    errores,
    pregunta_incompleta: [],
    comentario: '',
    evaluador: 'agy',
  }));
}

test('calificar aplicar mueve FSRS con la nota del contrato, es idempotente y no cuenta el reintento del mismo día', () => {
  const v = vault();
  conTema(v);
  const resp = escribir(v.dir, 'r.txt', 'respuesta');
  const p1 = v.json(['calificar', 'preparar', '--tema', 'insuficiencia-cardiaca', '--respuesta', resp, '--confianza', '50']).id;
  // recordado con confianza 50 → nota 3 (good): estabilidad inicial w[2] = 2.3065, vence en 3 días.
  const a = v.json(['calificar', 'aplicar', p1, '--recibo', recibo(v, p1, 'recordado')]);
  assert.deepEqual([a.calificacion, a.nota, a.vence, a.reintento], ['recordado', 3, '2026-12-25', false]);
  let t = v.leer('temas.json').temas['insuficiencia-cardiaca'];
  assert.deepEqual(t.fsrs, { estabilidad: 2.3065, dificultad: t.fsrs.dificultad, repasos: 1, lapsos: 0, ultimo: '2026-12-22', vence: '2026-12-25' });
  // Aplicar dos veces el mismo recibo no hace nada.
  const otra = v.ok(['calificar', 'aplicar', p1, '--recibo', recibo(v, p1, 'recordado')]);
  assert.match(otra.salida, /ya estaba aplicad/i);
  assert.equal(v.eventos().filter((e) => e.tipo === 'repaso').length, 1);
  // Un recibo de otro paquete se rechaza.
  assert.notEqual(v.correr(['calificar', 'aplicar', p1, '--recibo', recibo(v, 'cal-20261222-9999', 'parcial')]).codigo, 0);
  // Reintento el mismo día: se registra, pero FSRS no cambia.
  const p2 = v.json(['calificar', 'preparar', '--tema', 'insuficiencia-cardiaca', '--respuesta', resp]).id;
  const b = v.json(['calificar', 'aplicar', p2, '--recibo', recibo(v, p2, 'fallado')]);
  assert.equal(b.reintento, true);
  assert.deepEqual(v.leer('temas.json').temas['insuficiencia-cardiaca'].fsrs, t.fsrs);
  // Tres días después: recordado con errores se baja a parcial (nota 2) y lo avisa.
  const dia3 = { OKT_FECHA: '2026-12-25T09:00' };
  const p3 = v.json(['calificar', 'preparar', '--tema', 'insuficiencia-cardiaca', '--respuesta', resp, '--confianza', '90'], dia3).id;
  const r3 = v.ok(['calificar', 'aplicar', p3, '--recibo', recibo(v, p3, 'recordado', ['Confunde la furosemida con un inotrópico'])], dia3);
  assert.match(r3.salida, /parcial/);
  const c = JSON.parse(v.ok(['calificar', 'aplicar', p3, '--recibo', recibo(v, p3, 'recordado', ['x']), '--json'], dia3).salida);
  assert.equal(c.ya_aplicado, true);
  t = v.leer('temas.json').temas['insuficiencia-cardiaca'];
  assert.equal(t.fsrs.repasos, 2);
  assert.equal(t.fsrs.ultimo, '2026-12-25');
  const rep = v.eventos().filter((e) => e.tipo === 'repaso');
  assert.deepEqual(rep.map((e) => [e.reintento, e.recibo.calificacion]), [[false, 'recordado'], [true, 'fallado'], [false, 'parcial']]);
  assert.equal(rep[0].confianza, 50);
  for (const e of rep) assert.deepEqual(validar('evento', e), []);
  v.borrar();
});

test('repasos lista los vencidos con su recuperabilidad', () => {
  const v = vault();
  conTema(v);
  const p = v.json(['calificar', 'preparar', '--tema', 'insuficiencia-cardiaca', '--respuesta', escribir(v.dir, 'r.txt', 'x')]).id;
  v.ok(['calificar', 'aplicar', p, '--recibo', recibo(v, p, 'recordado')]);
  assert.deepEqual(v.json(['repasos']).repasos, []);
  const r = v.json(['repasos'], { OKT_FECHA: '2026-12-26T09:00' }).repasos;
  assert.equal(r.length, 1);
  assert.equal(r[0].tema, 'insuficiencia-cardiaca');
  assert.ok(r[0].r > 0.8 && r[0].r < 0.9);
  v.borrar();
});

test('plan generar, hoy y marcar: el check-in queda en el plan y en los eventos', () => {
  const v = vault();
  conTema(v);
  v.ok(['perfil', '--minutos-laborable', '150', '--minutos-fin', '240', '--remnote', '20']);
  v.ok(['plan', 'generar']);
  const plan = v.leer('plan.json');
  assert.deepEqual(validar('plan', plan), []);
  assert.equal(plan.dias[0].fecha, '2026-12-22');
  const hoy = v.ok(['plan', 'hoy']);
  const id = plan.dias[0].bloques[0].id;
  assert.ok(hoy.salida.includes(id));
  assert.match(hoy.salida, /📍 siguiente: okt estudio /);
  v.ok(['plan', 'marcar', id, 'hecho']);
  assert.equal(v.leer('plan.json').dias[0].bloques.find((b) => b.id === id).estado, 'hecho');
  const ck = v.eventos().find((e) => e.tipo === 'checkin');
  assert.deepEqual([ck.bloque, ck.estado, ck.herramienta, ck.minutos], [id, 'hecho', 'remnote', 20]);
  assert.notEqual(v.correr(['plan', 'marcar', '2026-12-22-99', 'hecho']).codigo, 0);
  assert.notEqual(v.correr(['plan', 'marcar', id, 'quizas']).codigo, 0);
  // registrar checkin es lo mismo (lo usa okt telegram bajar).
  const otro = plan.dias[0].bloques[1].id;
  v.ok(['registrar', 'checkin', otro, 'saltado']);
  assert.equal(v.leer('plan.json').dias[0].bloques.find((b) => b.id === otro).estado, 'saltado');
  v.borrar();
});

test('resumen: días a la meta, cumplimiento, aciertos, errores por tipo y calibración', () => {
  const v = vault();
  conTema(v);
  v.ok(['perfil', '--minutos-laborable', '150', '--minutos-fin', '240', '--remnote', '20']);
  v.ok(['plan', 'generar']);
  const plan = v.leer('plan.json');
  v.ok(['plan', 'marcar', plan.dias[0].bloques[0].id, 'hecho']);
  v.ok(['registrar', 'examen', 'Banqueo', '--aciertos', '7', '--total', '10', '--por-tema', 'insuficiencia-cardiaca:7/10']);
  v.ok(['registrar', 'error', '--tema', 'insuficiencia-cardiaca', '--tipo', 'C-CON-05']);
  v.ok(['registrar', 'sesion', '--minutos', '45', '--actividad', 'banqueo']);
  const p = v.json(['calificar', 'preparar', '--tema', 'insuficiencia-cardiaca', '--respuesta', escribir(v.dir, 'r.txt', 'x'), '--confianza', '90']).id;
  v.ok(['calificar', 'aplicar', p, '--recibo', recibo(v, p, 'parcial')]);
  const r = v.json(['resumen']);
  assert.deepEqual(r.meta, { id: 'encaps-2027-i', titulo: 'ENCAPS 2027-I', dias_restantes: 109 });
  assert.equal(r.cumplimiento_7d.hechos, 1);
  assert.ok(r.cumplimiento_7d.planeados >= 1);
  assert.equal(r.minutos_7d, 45);
  assert.deepEqual(r.temas, { total: 2, vistos: 1, nuevos: 1 });
  assert.deepEqual(r.aciertos_por_tema, [{ tema: 'insuficiencia-cardiaca', aciertos: 7, preguntas: 10, tasa: 0.7 }]);
  assert.deepEqual(r.errores_por_tipo, { 'C-CON-05': 1 });
  assert.deepEqual(r.calibracion['90'], { n: 1, recordados: 0 });
  assert.match(v.ok(['resumen']).salida, /📍 siguiente: okt estudio /);
  v.borrar();
});

test('sin metas, los comandos que la necesitan lo dicen con el siguiente paso', () => {
  const v = vault();
  const r = v.correr(['plan', 'generar']);
  assert.equal(r.codigo, 1);
  assert.match(r.error + r.salida, /okt estudio meta agregar/);
  assert.equal(existsSync(join(v.vault, DIR, 'plan.json')), false);
  assert.equal(v.correr(['nada']).codigo, 2);
  v.borrar();
});
