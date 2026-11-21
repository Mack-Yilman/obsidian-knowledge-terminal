// F2 del plan del tutor (OKT 0.11.0): clase viva con NotebookLM.
//   okt notebooklm cuaderno crear | fuente agregar | crear quiz|flashcards
//   okt clase preparar "<curso>" --audio … [--diapos …] [--video …] [--tema …]
//   okt clase recurso "<nota>" <tipo> [--id]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir, RAIZ } from './ayuda.mjs';

const CARDIO = '66666666-2222-3333-4444-555555555555';
const DATOS = {
  notebooklm: {
    cuadernos: [
      { id: '11111111-2222-3333-4444-555555555555', title: 'Tesis anemia', source_count: 12, updated_at: '2026-10-20' },
      { id: CARDIO, title: 'Cardiología', source_count: 3, updated_at: '2026-10-19' },
    ],
    transcripcion: 'Buenos días a todos. Hoy en la clase de fisiología vamos a repasar el ciclo cardiaco. La sístole y la diástole son sus dos fases.',
  },
};

function preparar() {
  const v = vaultNuevo();
  const datos = escribir(v.dir, 'fake.json', JSON.stringify(DATOS));
  const log = join(v.dir, 'llamadas.jsonl');
  const env = { OKT_FAKE_DATOS: datos, OKT_FAKE_LOG: log, OKT_INTERVALO_MS: '5', OKT_BIN_NLM: join(RAIZ, 'tests', 'fakes', 'nlm.mjs') };
  const llamadas = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  // Archivos de la clase fuera del vault, como los tendría el usuario en Descargas.
  const audio = escribir(v.dir, 'descargas/clase 3.mp3', 'MP3FAKE');
  const diapos = escribir(v.dir, 'descargas/Ciclo cardiaco.pdf', '%PDF-fake');
  return { ...v, run: (args, o = {}) => v.okt(args, { env, ...o }), llamadas, audio, diapos };
}

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');
const nlm = (v, a, b) => v.llamadas().filter((c) => c.args[0] === a && (!b || c.args[1] === b));
const CURSO = '01 │ 🎯 Proyectos/🎯 Fisiología';

test('notebooklm cuaderno crear: crea el cuaderno y, con --vincular, lo enlaza a la carpeta', () => {
  const v = preparar();
  v.run(['nota', 'nueva', 'proyecto', 'Fisiología']);
  const r = v.run(['notebooklm', 'cuaderno', 'crear', 'Fisiología 2027', '--vincular', 'proyectos/Fisiología']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Cuaderno creado: Fisiología 2027 \(00000000-0000-0000-0000-000000000001\)/);
  assert.match(r.salida, /01 │ 🎯 Proyectos\/🎯 Fisiología ↔ Fisiología 2027/);
  assert.deepEqual(nlm(v, 'notebook', 'create')[0].args.slice(0, 3), ['notebook', 'create', 'Fisiología 2027']);
  // Una sola llamada para crear: el vínculo usa el id devuelto, sin volver a listar cuadernos.
  assert.equal(nlm(v, 'list', 'notebooks').length, 0);
  v.borrar();
});

test('notebooklm fuente agregar: archivo, YouTube y web, siempre esperando el procesamiento', () => {
  const v = preparar();
  let r = v.run(['notebooklm', 'fuente', 'agregar', v.audio, '--cuaderno', CARDIO]);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Fuente agregada a «.*»: clase 3\.mp3 \(src-1\)/);
  r = v.run(['notebooklm', 'fuente', 'agregar', 'https://youtu.be/abc123', '--cuaderno', CARDIO]);
  assert.equal(r.codigo, 0, r.error);
  r = v.run(['notebooklm', 'fuente', 'agregar', 'https://example.org/guia', '--cuaderno', CARDIO]);
  assert.equal(r.codigo, 0, r.error);
  const [f1, f2, f3] = nlm(v, 'source', 'add').map((c) => c.args);
  assert.ok(f1.includes('--file') && f1.includes('--wait') && f1.includes('--json'));
  assert.ok(f2.includes('--youtube'));
  assert.ok(f3.includes('--url'));
  // Las clases largas tardan: el tiempo de espera sube del valor por defecto de nlm (600 s).
  assert.ok(Number(f1[f1.indexOf('--wait-timeout') + 1]) >= 1800);
  v.borrar();
});

test('notebooklm fuente agregar: un archivo que no existe falla antes de llamar a NotebookLM', () => {
  const v = preparar();
  const r = v.run(['notebooklm', 'fuente', 'agregar', join(v.dir, 'no-existe.mp3'), '--cuaderno', CARDIO]);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /No existe el archivo/);
  assert.equal(nlm(v, 'source', 'add').length, 0);
  v.borrar();
});

test('notebooklm crear flashcards: baja en JSON y cada tarjeta es un callout plegable', () => {
  const v = preparar();
  const r = v.run(['notebooklm', 'crear', 'flashcards', '--cuaderno', 'Cardiología', '--enfoque', 'ciclo cardiaco']);
  assert.equal(r.codigo, 0, r.error);
  const crear = nlm(v, 'flashcards', 'create')[0].args;
  assert.ok(!crear.includes('--language'), 'nlm flashcards create no acepta --language');
  assert.deepEqual(crear.slice(crear.indexOf('--focus'), crear.indexOf('--focus') + 2), ['--focus', 'ciclo cardiaco']);
  const bajar = nlm(v, 'download', 'flashcards')[0].args;
  assert.deepEqual(bajar.slice(bajar.indexOf('--format'), bajar.indexOf('--format') + 2), ['--format', 'json']);
  const nota = leer(v, '00 │ 📥 Bandeja/🤖 Flashcards - Cardiología.md');
  assert.match(nota, /> \[!question\]- 1\. ¿Cuáles son las dos fases del ciclo cardiaco\?\n> La sístole y la diástole\./);
  assert.match(nota, /> \[!question\]- 2\. ¿Qué produce el primer ruido cardiaco\?/);
  assert.doesNotMatch(nota, /flashcardContentBlock/);
  v.borrar();
});

test('notebooklm crear quiz: cantidad y dificultad; opciones a la vista, pista y respuesta plegadas', () => {
  const v = preparar();
  const r = v.run(['notebooklm', 'crear', 'quiz', '--cuaderno', 'Cardiología', '--cantidad', '5', '--dificultad', '3']);
  assert.equal(r.codigo, 0, r.error);
  const crear = nlm(v, 'quiz', 'create')[0].args;
  assert.deepEqual(crear.slice(crear.indexOf('--count'), crear.indexOf('--count') + 2), ['--count', '5']);
  assert.deepEqual(crear.slice(crear.indexOf('--difficulty'), crear.indexOf('--difficulty') + 2), ['--difficulty', '3']);
  assert.ok(!crear.includes('--language'));
  const nota = leer(v, '00 │ 📥 Bandeja/🤖 Quiz - Cardiología.md');
  assert.match(nota, /\*\*1\. ¿Qué provoca el inicio de la eyección ventricular\?\*\*\n- a\) La presión del ventrículo izquierdo supera la de la aorta\.\n- b\) Se abren las válvulas auriculoventriculares\./);
  assert.match(nota, /> \[!tip\]- Pista\n> Piensa en el gradiente de presión\./);
  assert.match(nota, /> \[!success\]- Respuesta\n> a\) La presión del ventrículo izquierdo supera la de la aorta\. — Así se abre la válvula aórtica\./);
  v.borrar();
});

test('clase preparar: sin cuaderno vinculado lo crea, sube audio y diapositivas y deja la transcripción lista para redactar', () => {
  const v = preparar();
  v.run(['nota', 'nueva', 'proyecto', 'Fisiología']);
  const r = v.run(['clase', 'preparar', 'Fisiología', '--audio', v.audio, '--diapos', v.diapos, '--tema', 'Ciclo cardiaco']);
  assert.equal(r.codigo, 0, r.error);
  // Cuaderno nuevo con el nombre del curso (sin emoji ni número) y vinculado a su carpeta.
  assert.deepEqual(nlm(v, 'notebook', 'create')[0].args.slice(0, 3), ['notebook', 'create', 'Fisiología']);
  const cfg = JSON.parse(leer(v, '.cerebro/config.json'));
  assert.equal(cfg.cuadernos[CURSO].id, '00000000-0000-0000-0000-000000000001');
  // Audio y diapositivas suben a NotebookLM; solo la transcripción del audio se baja.
  const subidas = nlm(v, 'source', 'add').map((c) => c.args[c.args.indexOf('--file') + 1]);
  assert.deepEqual(subidas, [v.audio, v.diapos]);
  assert.deepEqual(nlm(v, 'source', 'content').map((c) => c.args[2]), ['src-1']);
  // La nota de la clase va en la carpeta del curso, con su transcripción y sus propiedades.
  const rel = `${CURSO}/🎓 Ciclo cardiaco.md`;
  const nota = leer(v, rel);
  assert.match(nota, /vamos a repasar el ciclo cardiaco/);
  assert.match(nota, /curso: "\[\[🎯 Fisiología\]\]"/);
  assert.match(nota, /notebooklm: 00000000-0000-0000-0000-000000000001/);
  assert.match(nota, /diapositivas: "\[\[Ciclo cardiaco\.pdf\]\]"/);
  assert.match(nota, /bruto:\n {2}- "\[\[📥 Ciclo cardiaco\]\]"/);
  // El PDF se copia a los adjuntos (git no lo versiona); el audio no entra al vault.
  assert.ok(existsSync(join(v.vault, '05 │ ⚙️ Sistema/📎 adjuntos/📕 pdf/Ciclo cardiaco.pdf')));
  const todos = readdirSync(v.vault, { recursive: true }).map(String);
  assert.ok(!todos.some((f) => f.endsWith('.mp3')), 'el audio no se copia al vault');
  // Original en Bruto y la salida de redactar preparar con el perfil clase, sin dudas.
  assert.match(r.salida, /Perfil sugerido: clase\n/);
  assert.match(r.salida, /📍 /);
  v.borrar();
});

test('clase preparar: con el cuaderno ya vinculado lo reutiliza; un video de YouTube va como fuente', () => {
  const v = preparar();
  v.run(['nota', 'nueva', 'proyecto', 'Fisiología']);
  v.run(['notebooklm', 'vincular', 'proyectos/Fisiología', 'Cardiología']);
  const r = v.run(['clase', 'preparar', 'Fisiología', '--audio', v.audio, '--video', 'https://www.youtube.com/watch?v=abc123']);
  assert.equal(r.codigo, 0, r.error);
  assert.equal(nlm(v, 'notebook', 'create').length, 0);
  const adds = nlm(v, 'source', 'add').map((c) => c.args);
  assert.ok(adds.every((a) => a[2] === CARDIO));
  assert.ok(adds.some((a) => a.includes('--youtube')));
  // Sin --tema, el nombre es «Clase <fecha>».
  assert.match(leer(v, `${CURSO}/🎓 Clase 2026-10-22.md`), /notebooklm: 66666666-2222-3333-4444-555555555555/);
  v.borrar();
});

test('clase preparar: sin audio ni video, o con un curso que no existe, falla antes de tocar NotebookLM', () => {
  const v = preparar();
  v.run(['nota', 'nueva', 'proyecto', 'Fisiología']);
  let r = v.run(['clase', 'preparar', 'Fisiología', '--diapos', v.diapos]);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /--audio/);
  r = v.run(['clase', 'preparar', 'Química', '--audio', v.audio]);
  assert.equal(r.codigo, 2);
  r = v.run(['clase', 'preparar', 'Fisiología', '--audio', join(v.dir, 'no.mp3')]);
  assert.equal(r.codigo, 2);
  assert.equal(v.llamadas().length, 0);
  v.borrar();
});

test('clase recurso: incrusta flashcards e infografía en «🧪 Recursos de estudio» de la nota, una sola sección', () => {
  const v = preparar();
  v.run(['nota', 'nueva', 'proyecto', 'Fisiología']);
  v.run(['clase', 'preparar', 'Fisiología', '--audio', v.audio, '--tema', 'Ciclo cardiaco']);
  let r = v.run(['clase', 'recurso', 'Ciclo cardiaco', 'flashcards']);
  assert.equal(r.codigo, 0, r.error);
  r = v.run(['clase', 'recurso', 'Ciclo cardiaco', 'infografia', '--enfoque', 'sístole']);
  assert.equal(r.codigo, 0, r.error);
  const nota = leer(v, `${CURSO}/🎓 Ciclo cardiaco.md`);
  assert.equal(nota.match(/^## 🧪 Recursos de estudio$/gm).length, 1);
  assert.match(nota, /> \[!question\]- 1\. ¿Cuáles son las dos fases del ciclo cardiaco\?/);
  assert.match(nota, /!\[\[infografia .* 2026-10-22\.png\]\]/);
  // El recurso va en la nota de la clase: no se crea una captura aparte en la Bandeja.
  assert.ok(!readdirSync(join(v.vault, '00 │ 📥 Bandeja')).some((n) => n.startsWith('🤖')));
  // Usa el cuaderno de la propiedad notebooklm de la nota.
  assert.ok(nlm(v, 'flashcards', 'create')[0].args.includes('00000000-0000-0000-0000-000000000001'));
  v.borrar();
});

test('clase recurso: si no termina a tiempo, dice cómo retomarlo con --id y luego lo incrusta', () => {
  const v = preparar();
  v.run(['nota', 'nueva', 'proyecto', 'Fisiología']);
  v.run(['clase', 'preparar', 'Fisiología', '--audio', v.audio, '--tema', 'Ciclo cardiaco']);
  let r = v.run(['clase', 'recurso', 'Ciclo cardiaco', 'quiz', '--esperar', '0']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /okt clase recurso "🎓 Ciclo cardiaco" quiz --id art-1/);
  v.run(['notebooklm', 'estado', '--cuaderno', '00000000-0000-0000-0000-000000000001']);
  r = v.run(['clase', 'recurso', 'Ciclo cardiaco', 'quiz', '--id', 'art-1']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, `${CURSO}/🎓 Ciclo cardiaco.md`), /## 🧪 Recursos de estudio[\s\S]*\*\*1\. ¿Qué provoca/);
  v.borrar();
});

test('clase recurso: una nota sin cuaderno de NotebookLM falla con un mensaje claro', () => {
  const v = preparar();
  v.run(['nota', 'nueva', 'proyecto', 'Fisiología']);
  const r = v.run(['clase', 'recurso', 'Fisiología', 'quiz']);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /notebooklm/);
  v.borrar();
});
