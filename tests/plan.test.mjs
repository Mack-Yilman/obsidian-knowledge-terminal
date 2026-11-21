import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './ayuda.mjs';
import { generarPlan } from '../scripts/lib/plan.mjs';
import { crearFsrs } from '../scripts/lib/fsrs.mjs';
import { validar } from '../scripts/lib/estudio-datos.mjs';

// Temario inventado del ENCAPS (40 temas, pesos 3–5): meta del 2026-12-22 al 2027-04-10.
const FIX = JSON.parse(readFileSync(join(RAIZ, 'tests', 'fixtures', 'estudio-encaps.json'), 'utf8'));
const fsrs = crearFsrs();
const perfilBase = { version: 1, minutos_laborable: 150, minutos_fin: 240, dias_libres: [], retencion_deseada: 0.9, remnote_min: 20, cuestionario: {}, diagnostico: [], actualizado: '2026-12-22' };

function entrada(cambios = {}) {
  return {
    metas: structuredClone(FIX.metas),
    perfil: { ...perfilBase, ...(cambios.perfil || {}) },
    temas: structuredClone(FIX.temas),
    eventos: [],
    planAnterior: null,
    hoy: '2026-12-22',
    generado: '2026-12-22T07:00:00-05:00',
    fsrs,
    ...cambios,
    ...(cambios.perfil ? { perfil: { ...perfilBase, ...cambios.perfil } } : {}),
  };
}
const bloques = (plan) => plan.dias.flatMap((d) => d.bloques.map((b) => ({ ...b, fecha: d.fecha })));
const nuevos = (plan) => bloques(plan).filter((b) => b.herramienta === 'lectura');
const suma = (bs) => bs.reduce((s, b) => s + b.minutos, 0);
const dia = (plan, fecha) => plan.dias.find((d) => d.fecha === fecha);

function sano(plan) {
  assert.deepEqual(validar('plan', plan), [], 'el plan no cumple el contrato');
  for (const d of plan.dias) {
    assert.ok(suma(d.bloques) <= d.minutos, `${d.fecha}: ${suma(d.bloques)} min de bloques en un día de ${d.minutos}`);
    d.bloques.forEach((b) => assert.ok(b.id.startsWith(`${d.fecha}-`), `${b.id} fuera de su día`));
    assert.equal(new Set(d.bloques.map((b) => b.id)).size, d.bloques.length, `${d.fecha}: ids repetidos`);
  }
}

test('ENCAPS desde el 22/12: 14 días sostenibles, RemNote primero y temas nuevos a ritmo de cuota', () => {
  for (const minutos of [120, 150, 240]) {
    const plan = generarPlan(entrada({ perfil: { minutos_laborable: minutos } }));
    sano(plan);
    assert.equal(plan.meta, 'encaps-2027-i');
    assert.equal(plan.dias.length, 14);
    assert.equal(plan.dias[0].fecha, '2026-12-22');
    assert.equal(plan.dias[0].minutos, minutos); // martes
    assert.equal(dia(plan, '2026-12-26').minutos, 240); // sábado
    for (const d of plan.dias) assert.equal(d.bloques[0].herramienta, 'remnote', `${d.fecha} empieza por RemNote`);
    // 40 temas en ~102 días útiles → unos 5–6 en 14 días; ninguno repetido.
    const n = nuevos(plan);
    assert.ok(n.length >= 5 && n.length <= 6, `${n.length} temas nuevos en 14 días`);
    assert.equal(new Set(n.map((b) => b.tema)).size, n.length);
    for (const b of n) assert.ok(b.minutos >= 30 && b.minutos <= 60);
  }
});

test('cada tema nuevo trae pretest, lectura y NotebookLM el mismo día, y su recuerdo libre inicial al día siguiente', () => {
  const plan = generarPlan(entrada());
  const todos = bloques(plan);
  for (const lectura of nuevos(plan)) {
    const delDia = todos.filter((b) => b.fecha === lectura.fecha && b.tema === lectura.tema).map((b) => b.herramienta);
    assert.deepEqual(delDia, ['banqueo', 'lectura', 'notebooklm'], `${lectura.tema} el ${lectura.fecha}`);
    const despues = todos.find((b) => b.tema === lectura.tema && b.herramienta === 'repaso' && b.fecha > lectura.fecha);
    if (lectura.fecha < plan.dias.at(-1).fecha) {
      assert.ok(despues, `${lectura.tema}: falta su recuerdo libre inicial`);
      assert.match(despues.accion, /Recuerdo libre inicial/);
    }
  }
  // El primero es el de mayor prioridad: con todo en cero, el de mayor peso y, a igual peso, el primero del temario.
  const maxPeso = Math.max(...FIX.metas.metas[0].temario.map((t) => t.peso));
  assert.equal(nuevos(plan)[0].tema, FIX.metas.metas[0].temario.find((t) => t.peso === maxPeso).tema);
});

test('banqueo intercalado con 3 temas vistos y sin simulacro a más de 8 semanas', () => {
  const plan = generarPlan(entrada());
  const inter = bloques(plan).filter((b) => b.herramienta === 'banqueo' && b.temas);
  assert.ok(inter.length >= 1, 'falta el banqueo intercalado');
  for (const b of inter) assert.equal(b.temas.length, 3);
  // Rota: con más de 3 temas vistos, el siguiente intercalado no repite los mismos tres.
  for (let i = 1; i < inter.length; i++) assert.notDeepEqual([...inter[i].temas].sort(), [...inter[i - 1].temas].sort(), `${inter[i].fecha} repite el intercalado anterior`);
  assert.equal(bloques(plan).filter((b) => b.herramienta === 'simulacro').length, 0);
});

test('es determinista', () => {
  assert.deepEqual(generarPlan(entrada()), generarPlan(entrada()));
});

test('repaso final: sin temas nuevos en los últimos 7 días y simulacro el sábado', () => {
  const plan = generarPlan(entrada({ hoy: '2027-03-30', generado: '2027-03-30T07:00:00-05:00' }));
  sano(plan);
  for (const b of nuevos(plan)) assert.ok(b.fecha <= '2027-04-02', `tema nuevo el ${b.fecha}`);
  const sim = bloques(plan).filter((b) => b.herramienta === 'simulacro');
  assert.ok(sim.some((b) => b.fecha === '2027-04-03' && b.minutos === 120), 'falta el simulacro del sábado 3/4');
  assert.ok(sim.every((b) => b.fecha <= '2027-04-10'));
  assert.ok(sim[0].temas.length === 40);
});

test('días libres sin bloques', () => {
  const plan = generarPlan(entrada({ perfil: { dias_libres: ['2026-12-25'] } }));
  sano(plan);
  assert.equal(dia(plan, '2026-12-25').minutos, 0);
  assert.equal(dia(plan, '2026-12-25').bloques.length, 0);
});

test('reorganiza solo: lo saltado ayer vuelve hoy, una vez, y su tema no se repite como nuevo', () => {
  const ayer = generarPlan(entrada());
  const lectura = nuevos(ayer).find((b) => b.fecha === '2026-12-22');
  const evento = { id: 'ev-20261222-0001', ts: '2026-12-22T21:00:00-05:00', origen: 'telegram', tipo: 'checkin', bloque: lectura.id, estado: 'saltado', herramienta: 'lectura', tema: lectura.tema, minutos: lectura.minutos };
  const hoy = generarPlan(entrada({ hoy: '2026-12-23', generado: '2026-12-23T07:00:00-05:00', planAnterior: ayer, eventos: [evento] }));
  sano(hoy);
  // El día de ayer queda en el historial, con el saltado marcado.
  assert.equal(hoy.dias[0].fecha, '2026-12-22');
  assert.equal(hoy.dias.length, 15);
  assert.equal(dia(hoy, '2026-12-22').bloques.find((b) => b.id === lectura.id).estado, 'saltado');
  const movido = dia(hoy, '2026-12-23').bloques.find((b) => b.tema === lectura.tema && b.herramienta === 'lectura');
  assert.ok(movido, 'el bloque saltado no volvió');
  assert.equal(movido.arrastres, 1);
  assert.equal(dia(hoy, '2026-12-23').bloques[0].arrastres, 1, 'lo arrastrado va primero');
  assert.match(hoy.aviso, /Moví \d+ bloques? pendientes?/);
  assert.equal(nuevos(hoy).filter((b) => b.fecha >= '2026-12-23' && b.tema === lectura.tema).length, 1, 'el tema no se programa otra vez como nuevo');
  // Los bloques pendientes de ayer de RemNote y repaso no se arrastran: se recalculan.
  assert.equal(dia(hoy, '2026-12-23').bloques.filter((b) => b.herramienta === 'remnote').length, 1);
  // Regenerar el mismo día no arrastra de nuevo.
  const otraVez = generarPlan(entrada({ hoy: '2026-12-23', generado: '2026-12-23T09:00:00-05:00', planAnterior: hoy, eventos: [evento] }));
  assert.equal(bloques(otraVez).filter((b) => b.fecha >= '2026-12-23' && b.tema === lectura.tema && b.herramienta === 'lectura').length, 1);
});

test('un bloque movido 2 veces que se vuelve a saltar se descarta y se avisa', () => {
  const ayer = generarPlan(entrada());
  const d0 = ayer.dias[0];
  const viejo = { id: `${d0.fecha}-99`, accion: 'Clase o lectura: Asma bronquial', herramienta: 'lectura', tema: 'asma-bronquial', minutos: 40, estado: 'pendiente', arrastres: 2 };
  d0.bloques.push(viejo);
  d0.minutos += 40;
  const hoy = generarPlan(entrada({ hoy: '2026-12-23', generado: '2026-12-23T07:00:00-05:00', planAnterior: ayer }));
  sano(hoy);
  assert.ok(!bloques(hoy).some((b) => b.fecha >= '2026-12-23' && b.arrastres === 3));
  assert.match(hoy.aviso, /Descarté 1/);
});

test('conserva lo ya marcado hoy y numera después', () => {
  const temprano = generarPlan(entrada());
  temprano.dias[0].bloques[0].estado = 'hecho';
  const id = temprano.dias[0].bloques[0].id;
  const tarde = generarPlan(entrada({ generado: '2026-12-22T15:00:00-05:00', planAnterior: temprano }));
  sano(tarde);
  const b0 = tarde.dias[0].bloques.find((b) => b.id === id);
  assert.equal(b0.estado, 'hecho');
  assert.equal(tarde.dias[0].bloques.filter((b) => b.herramienta === 'remnote').length, 1, 'no duplica lo ya hecho');
});

test('vencidos: primero los que aún se salvan; como máximo 2 olvidados; con tope del 30 % del día', () => {
  const temas = structuredClone(FIX.temas);
  const ids = Object.keys(temas.temas);
  // 1 tema recién vencido (R alta) y 4 muy olvidados (R baja), todos vencidos hoy.
  temas.temas[ids[10]].fsrs = { estabilidad: 10, dificultad: 5, repasos: 2, lapsos: 0, ultimo: '2026-12-12', vence: '2026-12-22' };
  for (const i of [11, 12, 13, 14]) temas.temas[ids[i]].fsrs = { estabilidad: 1, dificultad: 7, repasos: 3, lapsos: 1, ultimo: '2026-11-01', vence: '2026-11-02' };
  const plan = generarPlan(entrada({ temas }));
  sano(plan);
  const rep = plan.dias[0].bloques.filter((b) => b.herramienta === 'repaso');
  assert.equal(rep[0].tema, ids[10], 'el salvable va primero');
  assert.equal(rep.filter((b) => [11, 12, 13, 14].map((i) => ids[i]).includes(b.tema)).length, 2);
  assert.ok(suma(rep) <= Math.floor(0.3 * 150));
  // Repasado hoy en la proyección: no reaparece mañana.
  assert.ok(!plan.dias[1].bloques.some((b) => b.herramienta === 'repaso' && b.tema === ids[10]));
});

test('tema visto sin repaso (clase marcada hecha) recibe su recuerdo libre inicial y deja de ser nuevo', () => {
  const ev = { id: 'ev-20261221-0001', ts: '2026-12-21T20:00:00-05:00', origen: 'cli', tipo: 'checkin', bloque: '2026-12-21-3', estado: 'hecho', herramienta: 'lectura', tema: 'sepsis-shock-septico', minutos: 45 };
  const plan = generarPlan(entrada({ eventos: [ev] }));
  const b = plan.dias[0].bloques.find((x) => x.tema === 'sepsis-shock-septico');
  assert.equal(b?.herramienta, 'repaso');
  assert.match(b.accion, /Recuerdo libre inicial/);
  assert.ok(!nuevos(plan).some((x) => x.tema === 'sepsis-shock-septico'));
});

test('los errores recientes suben la prioridad de un tema nuevo', () => {
  const ev = { id: 'ev-20261220-0001', ts: '2026-12-20T20:00:00-05:00', origen: 'cli', tipo: 'examen', nombre: 'Banqueo', aciertos: 1, total: 10, por_tema: { 'cancer-cuello-uterino': { aciertos: 1, total: 10 } } };
  const plan = generarPlan(entrada({ eventos: [ev] }));
  assert.equal(nuevos(plan)[0].tema, 'cancer-cuello-uterino');
});

test('meta continua sin fecha: 3 temas nuevos por semana', () => {
  const metas = { version: 1, metas: [{ id: 'ingles-medico', titulo: 'Inglés médico', tipo: 'continuo', inicio: '2026-12-01', temario: [], activa: true }] };
  const temas = { version: 1, temas: {} };
  for (let i = 1; i <= 10; i++) temas.temas[`unidad-${i}`] = { titulo: `Unidad ${i}`, metas: ['ingles-medico'], pregunta: '', canonica: '', rubrica: [], fsrs: null, aciertos: 0, preguntas: 0, contrasta_con: [], retirado: false };
  const plan = generarPlan(entrada({ metas, temas, perfil: { remnote_min: 0 } }));
  sano(plan);
  assert.equal(plan.meta, 'ingles-medico');
  assert.equal(nuevos(plan).length, 6);
  assert.equal(nuevos(plan)[0].tema, 'unidad-1');
});

test('si no cabe, avisa cuánto subir; sin metas, pide crear una', () => {
  const plan = generarPlan(entrada({ perfil: { minutos_laborable: 60, minutos_fin: 60, remnote_min: 20 } }));
  sano(plan);
  assert.match(plan.aviso, /No caben \d+ temas nuevos en 14 días: sube a \d+ min por día laborable/);
  const sinMetas = entrada();
  sinMetas.metas.metas[0].activa = false;
  assert.throws(() => generarPlan(sinMetas), (e) => e.codigo === 1 && /okt estudio meta agregar/.test(e.message));
});
