import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir, RAIZ } from './ayuda.mjs';
import { transcripcion, elegirPista, idDeYoutube, tipoDeUrl, reloj, lanzarSegundoPlano } from '../scripts/lib/importar-url.mjs';

const WEB = 'https://ejemplo.org/anemia';
const ID = 'abcdefghijk';
const json3 = (events) => `data:application/json,${encodeURIComponent(JSON.stringify({ events }))}`;
const EVENTOS = [
  { tStartMs: 0, dDurationMs: 999999, id: 1 },
  { tStartMs: 2000, segs: [{ utf8: 'hola' }, { utf8: ' a todos' }] },
  { tStartMs: 3000, aAppend: 1, segs: [{ utf8: '\n' }] },
  { tStartMs: 30000, segs: [{ utf8: 'la ferritina' }] },
  { tStartMs: 65000, segs: [{ utf8: 'baja en la anemia' }] },
];

const DATOS = {
  web: {
    [WEB]: {
      title: 'Anemia: guía rápida',
      author: 'Ana Pérez',
      site: 'Ejemplo',
      published: '2026-09-01T10:00:00Z',
      content: '## Qué es\n\nHemoglobina baja.\n\n![grafico](https://ejemplo.org/img/hb.png)\n\n![rel](/img/rel\\(1\\).png "t")\n\n![grafico](https://ejemplo.org/img/hb.png)',
    },
  },
  youtube: {
    [ID]: {
      title: 'Clase de anemia',
      channel: 'Canal Médico',
      upload_date: '20260901',
      duration: 125,
      language: 'es',
      chapters: [{ start_time: 0, title: 'Intro' }, { start_time: 60, title: 'Diagnóstico' }],
      subtitles: {},
      automatic_captions: { 'es-orig': [{ ext: 'vtt', url: 'x' }, { ext: 'json3', url: json3(EVENTOS) }], en: [{ ext: 'json3', url: 'data:,no' }] },
    },
    sinsubtitul: { title: 'Sin subtítulos', channel: 'X', subtitles: {}, automatic_captions: {} },
  },
};

function preparar() {
  const v = vaultNuevo();
  const datos = escribir(v.dir, 'fake.json', JSON.stringify(DATOS));
  const env = {
    OKT_FAKE_DATOS: datos,
    OKT_FAKE_DESCARGAS: '1',
    OKT_BIN_DEFUDDLE: join(RAIZ, 'tests', 'fakes', 'defuddle.mjs'),
    'OKT_BIN_YT-DLP': join(RAIZ, 'tests', 'fakes', 'yt-dlp.mjs'),
  };
  return { ...v, run: (args, o = {}) => v.okt(args, { env, ...o }), leer: (rel) => readFileSync(join(v.vault, rel), 'utf8') };
}

test('url: reconoce YouTube, Drive y web', () => {
  assert.equal(idDeYoutube('https://youtu.be/abcdefghijk?t=3'), ID);
  assert.equal(idDeYoutube('https://www.youtube.com/watch?list=x&v=abcdefghijk'), ID);
  assert.equal(idDeYoutube('https://www.youtube.com/shorts/abcdefghijk'), ID);
  assert.equal(tipoDeUrl('https://drive.google.com/file/d/VIDEOID123456789abc/view'), 'drive');
  assert.equal(tipoDeUrl(WEB), 'web');
  assert.equal(reloj(3725000), '1:02:05');
  assert.equal(reloj(65000), '1:05');
});

test('youtube: prefiere los subtítulos manuales; en los automáticos, el original y no una traducción', () => {
  const pista = elegirPista(DATOS.youtube[ID]);
  assert.deepEqual({ ...pista, url: undefined }, { url: undefined, idioma: 'es', automatica: true });
  assert.match(pista.url, /^data:application\/json/);
  const manual = elegirPista({ language: 'en', subtitles: { de: [{ ext: 'json3', url: 'd' }], en: [{ ext: 'json3', url: 'e' }], live_chat: [{ ext: 'json3', url: 'c' }] }, automatic_captions: { 'en-orig': [{ ext: 'json3', url: 'a' }] } });
  assert.deepEqual(manual, { url: 'e', idioma: 'en', automatica: false });
  assert.equal(elegirPista({ subtitles: {}, automatic_captions: {} }), null);
});

test('youtube: la transcripción va por capítulos y en párrafos de un minuto, con la marca de tiempo enlazada', () => {
  const t = transcripcion({ events: EVENTOS }, { id: ID, capitulos: DATOS.youtube[ID].chapters });
  assert.equal(
    t,
    `### [0:00](https://youtu.be/${ID}?t=0) Intro\n\n[0:02](https://youtu.be/${ID}?t=2) hola a todos la ferritina\n\n### [1:00](https://youtu.be/${ID}?t=60) Diagnóstico\n\n[1:05](https://youtu.be/${ID}?t=65) baja en la anemia`,
  );
  // Sin capítulos, un párrafo nuevo cada minuto.
  assert.equal(transcripcion({ events: EVENTOS }, { id: ID }).split('\n\n').length, 2);
});

test('importar url: una web entra completa a la Bandeja, con sus imágenes descargadas (una vez cada una)', () => {
  const v = preparar();
  const r = v.run(['importar', 'url', WEB]);
  assert.equal(r.codigo, 0, r.error);
  const nota = v.leer('00 │ 📥 Bandeja/🌐 Anemia - guía rápida.md');
  assert.match(nota, /origen: web/);
  assert.match(nota, /autor: Ana Pérez/);
  assert.match(nota, /publicado: 2026-09-01/);
  assert.match(nota, /Hemoglobina baja\./);
  assert.equal((nota.match(/!\[\[Anemia - guía rápida 1\.png\]\]/g) || []).length, 2, 'la misma imagen se baja una vez');
  assert.match(nota, /!\[\[Anemia - guía rápida 2\.png\]\]/, 'una ruta relativa se resuelve contra la página');
  assert.deepEqual(readdirSync(join(v.vault, '99 │ ⚙️ Sistema/📎 adjuntos/🌐 web')).sort(), ['Anemia - guía rápida 1.png', 'Anemia - guía rápida 2.png']);
  // Reimportar actualiza la misma nota.
  assert.match(v.run(['importar', 'url', WEB]).salida, /actualizada/);
  v.borrar();
});

test('importar url: YouTube incrusta el video y trae la transcripción; con --carpeta es una fuente', () => {
  const v = preparar();
  let r = v.run(['importar', 'url', `https://youtu.be/${ID}`, '--carpeta', 'Medicina']);
  assert.equal(r.codigo, 0, r.error);
  const nota = v.leer('20 │ 🧭 Areas/🧭 Medicina/▶️ Clase de anemia.md');
  assert.match(nota, /tipo: fuente/);
  assert.match(nota, /autor: Canal Médico/);
  assert.match(nota, new RegExp(`!\\[\\]\\(https://www.youtube.com/watch\\?v=${ID}\\)`));
  assert.match(nota, /## Transcripción automática \(es, en bruto\)/);
  assert.match(nota, /### \[1:00\]\(https:\/\/youtu.be\/abcdefghijk\?t=60\) Diagnóstico/);
  r = v.run(['importar', 'url', 'https://www.youtube.com/watch?v=sinsubtitul']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /sin subtítulos/);
  assert.match(v.leer('00 │ 📥 Bandeja/▶️ Sin subtítulos.md'), /NotebookLM/);
  v.borrar();
});

test('importar enlaces: completa en su lugar las capturas con url; lo que falla queda anotado y no se reintenta solo', () => {
  const v = preparar();
  const captura = (nombre, url) =>
    escribir(v.vault, `00 │ 📥 Bandeja/${nombre}.md`, `---\ntipo: captura\ncreado: 2026-10-21\norigen: telegram\nurl: ${url}\n---\n\n# ${nombre}\n\nmirar luego\n`);
  captura('📲 2026-10-21 1805 web', WEB);
  captura('📲 2026-10-21 1806 video', `https://www.youtube.com/watch?v=${ID}`);
  captura('📲 2026-10-21 1807 roto', 'https://ejemplo.org/no-existe');
  assert.equal(lanzarSegundoPlanoCon(v), 3, 'el hook lanzaría el segundo plano');
  let r = v.run(['importar', 'enlaces']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /2 traídos, 1 con error/);
  const web = v.leer('00 │ 📥 Bandeja/📲 2026-10-21 1805 web.md');
  assert.match(web, /origen: telegram/, 'conserva su origen');
  assert.match(web, /importado: /);
  assert.match(web, /mirar luego[\s\S]*<!-- okt:inicio -->[\s\S]*Hemoglobina baja/, 'el comentario del usuario queda arriba');
  assert.match(v.leer('00 │ 📥 Bandeja/📲 2026-10-21 1806 video.md'), /hola a todos/);
  assert.match(v.leer('00 │ 📥 Bandeja/📲 2026-10-21 1807 roto.md'), /importar_error: /);
  assert.equal(readdirSync(join(v.vault, '00 │ 📥 Bandeja')).length, 3, 'no crea notas nuevas');
  r = v.run(['importar', 'enlaces']);
  assert.match(r.salida, /No hay enlaces pendientes/);
  assert.equal(lanzarSegundoPlanoCon(v), 0);
  r = v.run(['importar', 'enlaces', '--reintentar']);
  assert.match(r.salida, /0 traídos, 1 con error/);
  v.borrar();
});

// Lo que lanzaría el hook, sin lanzar el proceso (OKT_SIN_SEGUNDO_PLANO).
function lanzarSegundoPlanoCon(v) {
  const previo = process.env.OKT_SIN_SEGUNDO_PLANO;
  process.env.OKT_SIN_SEGUNDO_PLANO = '1';
  try {
    const args = lanzarSegundoPlano(v.vault);
    if (args) assert.deepEqual(args.slice(1, 4), ['importar', 'enlaces', '--silencioso']);
    return args ? readdirSync(join(v.vault, '00 │ 📥 Bandeja')).length : 0;
  } finally {
    if (previo === undefined) delete process.env.OKT_SIN_SEGUNDO_PLANO;
    else process.env.OKT_SIN_SEGUNDO_PLANO = previo;
  }
}

test('drive: un video no se descarga; se ve con el reproductor de Drive y un enlace para abrirlo', () => {
  const v = preparar();
  const datos = JSON.parse(readFileSync(join(v.dir, 'fake.json'), 'utf8'));
  datos.drive = { archivos: { VIDEOID123456789abc: { id: 'VIDEOID123456789abc', name: 'Clase grabada.mp4', mimeType: 'video/mp4', webViewLink: 'https://drive.google.com/file/d/VIDEOID123456789abc/view', contenido: 'BYTES' } } };
  escribir(v.dir, 'fake.json', JSON.stringify(datos));
  const r = v.run(['importar', 'url', 'https://drive.google.com/file/d/VIDEOID123456789abc/view'], { env: { OKT_FAKE_DATOS: join(v.dir, 'fake.json'), OKT_BIN_GWS: join(RAIZ, 'tests', 'fakes', 'gws.mjs') } });
  assert.equal(r.codigo, 0, r.error);
  const nota = v.leer('00 │ 📥 Bandeja/☁️ Clase grabada.md');
  assert.match(nota, /<iframe src="https:\/\/drive.google.com\/file\/d\/VIDEOID123456789abc\/preview"/);
  assert.match(nota, /\[▶️ Abrir en Drive\]\(https:\/\/drive.google.com\/file\/d\/VIDEOID123456789abc\/view\)/);
  assert.ok(!existsSync(join(v.vault, '99 │ ⚙️ Sistema/📎 adjuntos/☁️ drive')), 'no baja el video');
  v.borrar();
});

test('importar url: sin el CLI instalado, el error dice cómo instalarlo', () => {
  const v = preparar();
  const r = v.run(['importar', 'url', WEB], { env: { OKT_FAKE_DATOS: join(v.dir, 'fake.json'), OKT_BIN_DEFUDDLE: join(v.dir, 'no-existe.mjs') } });
  assert.notEqual(r.codigo, 0);
  assert.match(r.error, /npm install -g defuddle/);
  v.borrar();
});
