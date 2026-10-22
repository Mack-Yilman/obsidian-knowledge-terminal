import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir, RAIZ } from './ayuda.mjs';

const P1 = '1a2b3c4d5e6f708192a3b4c5d6e7f801';
const P2 = '2a2b3c4d5e6f708192a3b4c5d6e7f802';
const P3 = '3a2b3c4d5e6f708192a3b4c5d6e7f803';
const BASE = '9a2b3c4d5e6f708192a3b4c5d6e7f809';

const DATOS = {
  notion: {
    paginas: {
      [P1]: { titulo: 'Apuntes de anemia', editado: '2026-10-20T10:00:00.000Z', markdown: '# Apuntes de anemia\n\nLa ferritina es clave.\n\n![grafico](https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/grafico.png?X-Amz=1)\n\n[externo](https://example.com/x.png)' },
      [P2]: { titulo: 'Clase 2: hierro', editado: '2026-10-21T10:00:00.000Z', markdown: 'Absorción del hierro.' },
      [P3]: { titulo: 'Caso', editado: '2026-10-21T10:00:00.000Z', markdown: 'Paciente con DNI 45879632.' },
    },
    bases: { [BASE]: [P1, P2, P3] },
  },
  drive: {
    archivos: {
      DOCID1234567890abc: { id: 'DOCID1234567890abc', name: 'Resumen de cardiología', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-10-01T00:00:00Z', webViewLink: 'https://docs.google.com/document/d/DOCID1234567890abc/edit', contenido: '# Cardio\n\nInsuficiencia cardiaca.', padre: 'CARPETA1234567890' },
      PDFID1234567890abc: { id: 'PDFID1234567890abc', name: 'Guía de hipertensión.pdf', mimeType: 'application/pdf', modifiedTime: '2026-10-02T00:00:00Z', contenido: '%PDF-fake', padre: 'CARPETA1234567890' },
      HOJAID123456789abc: { id: 'HOJAID123456789abc', name: 'Pacientes octubre', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-10-03T00:00:00Z', contenido: '', padre: 'CARPETA1234567890' },
      CARPETA1234567890: { id: 'CARPETA1234567890', name: 'Medicina', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-10-03T00:00:00Z' },
    },
  },
  notebooklm: {
    cuadernos: [
      { id: '11111111-2222-3333-4444-555555555555', title: 'Tesis anemia', source_count: 12, updated_at: '2026-10-20', notas: [{ id: 'n1', title: 'Resumen de fuentes', content: 'Las fuentes coinciden en la ferritina.', preview: 'Las fuentes' }] },
      { id: '66666666-2222-3333-4444-555555555555', title: 'Cardiología', source_count: 3, updated_at: '2026-10-19' },
    ],
  },
};

function preparar() {
  const v = vaultNuevo();
  const datos = escribir(v.dir, 'fake.json', JSON.stringify(DATOS));
  const log = join(v.dir, 'llamadas.jsonl');
  const env = {
    OKT_FAKE_DATOS: datos,
    OKT_FAKE_LOG: log,
    OKT_FAKE_DESCARGAS: '1',
    OKT_INTERVALO_MS: '5',
    OKT_BIN_NTN: join(RAIZ, 'tests', 'fakes', 'ntn.mjs'),
    OKT_BIN_GWS: join(RAIZ, 'tests', 'fakes', 'gws.mjs'),
    OKT_BIN_NLM: join(RAIZ, 'tests', 'fakes', 'nlm.mjs'),
  };
  const llamadas = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { ...v, run: (args, o = {}) => v.okt(args, { env, ...o }), llamadas };
}

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');

test('notion: una página primero se previsualiza y solo se importa con --aplicar', () => {
  const v = preparar();
  let r = v.run(['importar', 'notion', `https://www.notion.so/mi/Apuntes-de-anemia-${P1}`]);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /«Apuntes de anemia»/);
  assert.equal(existsSync(join(v.vault, '00-Bandeja/importados/Apuntes de anemia.md')), false);
  r = v.run(['importar', 'notion', `https://www.notion.so/mi/Apuntes-de-anemia-${P1}`, '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  const texto = leer(v, '00-Bandeja/importados/Apuntes de anemia.md');
  assert.match(texto, /origen: notion/);
  assert.match(texto, /id_externo: 1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f801/);
  assert.match(texto, /La ferritina es clave/);
  assert.doesNotMatch(texto, /^# Apuntes de anemia\n\n# Apuntes/m);
  assert.match(texto, /!\[\[Apuntes de anemia 1\.png\]\]/, 'la imagen de Notion se descarga y se enlaza');
  assert.match(texto, /\(https:\/\/example\.com\/x\.png\)/, 'las imágenes externas quedan como están');
  assert.ok(existsSync(join(v.vault, '40-Fuentes/adjuntos/notion/Apuntes de anemia 1.png')));
  assert.ok(v.llamadas().every((c) => ['get', '/v1/'].some((x) => c.args.join(' ').includes(x)) || c.args[1] === 'query'), 'solo lecturas en Notion');
  v.borrar();
});

test('notion: una base se lista; con --seleccion importa solo esas páginas, sin propiedades', () => {
  const v = preparar();
  const url = `https://www.notion.so/mi/${BASE}?v=abc123`;
  let r = v.run(['importar', 'notion', url]);
  assert.match(r.salida, /3 páginas/);
  assert.match(r.salida, /1\. Apuntes de anemia/);
  assert.match(r.salida, /2\. Clase 2: hierro/);
  assert.equal(readdirSync(join(v.vault, '00-Bandeja/importados')).length, 0);
  r = v.run(['importar', 'notion', url, '--seleccion', '2']);
  assert.equal(r.codigo, 0, r.error);
  const texto = leer(v, '00-Bandeja/importados/Clase 2 - hierro.md');
  assert.match(texto, /Absorción del hierro/);
  assert.doesNotMatch(texto, /Curso|select/);
  assert.equal(readdirSync(join(v.vault, '00-Bandeja/importados')).length, 1);
  v.borrar();
});

test('notion: no importa contenido con datos de pacientes y reimportar actualiza la misma nota', () => {
  const v = preparar();
  const url = `https://www.notion.so/mi/${BASE}?v=abc123`;
  let r = v.run(['importar', 'notion', url, '--seleccion', '1,3']);
  assert.match(r.salida, /1 importadas, 1 sin importar/);
  assert.match(r.salida, /Caso: .*DNI/);
  const ruta = '00-Bandeja/importados/Apuntes de anemia.md';
  escribir(v.vault, ruta, `${leer(v, ruta)}\nMi comentario propio.\n`);
  r = v.run(['importar', 'notion', url, '--seleccion', '1']);
  assert.match(r.salida, /actualizada/);
  const texto = leer(v, ruta);
  assert.match(texto, /Mi comentario propio\./);
  assert.equal(texto.match(/La ferritina es clave/g).length, 1);
  assert.equal(readdirSync(join(v.vault, '00-Bandeja/importados')).length, 1);
  v.borrar();
});

test('drive: un Doc se exporta a Markdown; un PDF se baja a adjuntos; respeta la regla de --output de gws', () => {
  const v = preparar();
  let r = v.run(['importar', 'drive', 'https://docs.google.com/document/d/DOCID1234567890abc/edit', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, '00-Bandeja/importados/Resumen de cardiología.md'), /Insuficiencia cardiaca/);
  r = v.run(['importar', 'drive', 'https://drive.google.com/file/d/PDFID1234567890abc/view', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.equal(leer(v, '40-Fuentes/adjuntos/drive/Guía de hipertensión.pdf'), '%PDF-fake');
  assert.match(leer(v, '00-Bandeja/importados/Guía de hipertensión.md'), /!\[\[Guía de hipertensión\.pdf\]\]/);
  const metodos = v.llamadas().filter((c) => c.cli === 'gws').map((c) => c.args[2]);
  assert.ok(metodos.every((m) => ['get', 'export', 'list'].includes(m)), 'solo lecturas en Drive');
  v.borrar();
});

test('drive: otro archivo con el mismo nombre no pisa un adjunto; reimportar el mismo sí lo reemplaza', () => {
  const v = preparar();
  escribir(v.vault, '40-Fuentes/adjuntos/drive/Guía de hipertensión.pdf', 'ORIGINAL DEL USUARIO');
  const url = 'https://drive.google.com/file/d/PDFID1234567890abc/view';
  let r = v.run(['importar', 'drive', url, '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.equal(leer(v, '40-Fuentes/adjuntos/drive/Guía de hipertensión.pdf'), 'ORIGINAL DEL USUARIO');
  assert.equal(leer(v, '40-Fuentes/adjuntos/drive/Guía de hipertensión 2.pdf'), '%PDF-fake');
  r = v.run(['importar', 'drive', url, '--aplicar']);
  assert.match(r.salida, /actualizada/);
  assert.deepEqual(readdirSync(join(v.vault, '40-Fuentes/adjuntos/drive')).sort(), ['Guía de hipertensión 2.pdf', 'Guía de hipertensión.pdf']);
  v.borrar();
});

test('notion: un enlace con $ en el texto no se corrompe al reemplazarlo', () => {
  const v = preparar();
  const datos = JSON.parse(readFileSync(join(v.dir, 'fake.json'), 'utf8'));
  datos.notion.paginas[P2].markdown = 'Ver [Tarifa $1 y $&](https://file.notion.so/f/tarifa.pdf).';
  escribir(v.dir, 'fake.json', JSON.stringify(datos));
  const r = v.run(['importar', 'notion', `https://www.notion.so/${P2}`, '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, '00-Bandeja/importados/Clase 2 - hierro.md'), /\[\[Clase 2 - hierro 1\.pdf\|Tarifa \$1 y \$&\]\]/);
  v.borrar();
});

test('drive: una carpeta se lista y las hojas de cálculo no se importan', () => {
  const v = preparar();
  let r = v.run(['importar', 'drive', 'https://drive.google.com/drive/folders/CARPETA1234567890']);
  assert.match(r.salida, /3 archivos/);
  assert.match(r.salida, /Pacientes octubre \(hoja: no se importa\)/);
  r = v.run(['importar', 'drive', 'https://drive.google.com/drive/folders/CARPETA1234567890', '--seleccion', 'todo']);
  assert.match(r.salida, /2 importados, 1 sin importar/);
  assert.match(r.salida, /hojas de cálculo no se importan/);
  v.borrar();
});

test('notebooklm: cuadernos, vínculo de carpeta, notas y pregunta guardada como nota', () => {
  const v = preparar();
  let r = v.run(['notebooklm', 'cuadernos']);
  assert.match(r.salida, /1\. Tesis anemia · 12 fuentes/);
  v.run(['nota', 'nueva', 'proyecto', 'Tesis']);
  r = v.run(['notebooklm', 'vincular', '10-Proyectos/Tesis', 'tesis']);
  assert.equal(r.codigo, 0, r.error);
  const enTesis = join(v.vault, '10-Proyectos', 'Tesis');
  r = v.run(['notebooklm', 'notas'], { cwd: enTesis });
  assert.match(r.salida, /1\. Resumen de fuentes/);
  r = v.run(['notebooklm', 'notas', '--seleccion', '1'], { cwd: enTesis });
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, '00-Bandeja/importados/Resumen de fuentes.md'), /coinciden en la ferritina/);
  r = v.run(['notebooklm', 'preguntar', '¿Qué dicen sobre la ferritina?', '--cuaderno', 'Tesis anemia']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Respuesta sobre: ¿Qué dicen sobre la ferritina\?/);
  const nota = readdirSync(join(v.vault, '00-Bandeja/importados')).find((n) => n.startsWith('NotebookLM'));
  const texto = leer(v, `00-Bandeja/importados/${nota}`);
  assert.match(texto, /Guía de prueba/);
  assert.match(texto, /síntesis, no evidencia/);
  v.borrar();
});

test('notebooklm: crear una infografía espera, descarga e incrusta; el mapa mental se vuelve lista', () => {
  const v = preparar();
  let r = v.run(['notebooklm', 'crear', 'infografia', '--cuaderno', 'Tesis anemia', '--enfoque', 'ferritina']);
  assert.equal(r.codigo, 0, r.error);
  const llamadaCrear = v.llamadas().find((c) => c.args[1] === 'create');
  assert.ok(llamadaCrear.args.includes('--confirm'));
  assert.deepEqual(llamadaCrear.args.slice(llamadaCrear.args.indexOf('--language'), llamadaCrear.args.indexOf('--language') + 2), ['--language', 'es']);
  const nota = leer(v, '00-Bandeja/importados/Infografia - Tesis anemia.md');
  assert.match(nota, /!\[\[infografia Tesis anemia 2026-10-22\.png\]\]/);
  assert.ok(existsSync(join(v.vault, '40-Fuentes/adjuntos/notebooklm/Tesis anemia/infografia Tesis anemia 2026-10-22.png')));
  r = v.run(['notebooklm', 'crear', 'mapa', '--cuaderno', 'Tesis anemia']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, '00-Bandeja/importados/Mapa - Tesis anemia.md'), /- Raíz\n  - Rama A\n    - Hoja\n  - Rama B/);
  v.borrar();
});

test('notebooklm: un informe con datos de pacientes no entra al vault (ni nota ni adjunto)', () => {
  const v = preparar();
  const datos = JSON.parse(readFileSync(join(v.dir, 'fake.json'), 'utf8'));
  datos.notebooklm.informe = '# Informe\n\nPaciente con HC 1234567 y anemia.';
  escribir(v.dir, 'fake.json', JSON.stringify(datos));
  const r = v.run(['notebooklm', 'crear', 'informe', '--cuaderno', 'Tesis anemia']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.error, /historia clínica/);
  assert.equal(existsSync(join(v.vault, '00-Bandeja/importados/Informe - Tesis anemia.md')), false);
  assert.deepEqual(readdirSync(join(v.vault, '40-Fuentes/adjuntos/notebooklm/Tesis anemia')), []);
  assert.deepEqual(readdirSync(join(v.vault, '.cerebro/cache/notebooklm')), []);
  v.borrar();
});

test('notebooklm: si no termina a tiempo, queda pendiente con el comando para descargarlo', () => {
  const v = preparar();
  const r = v.run(['notebooklm', 'crear', 'presentacion', '--cuaderno', 'Cardiología', '--esperar', '0']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /sigue en proceso.*okt notebooklm descargar presentacion/s);
  v.borrar();
});

test('sin el CLI instalado, el error dice cómo instalarlo', () => {
  const v = vaultNuevo();
  const r = v.okt(['importar', 'notion', `https://www.notion.so/${P1}`], { env: { OKT_BIN_NTN: join(v.dir, 'no-existe.exe'), PATH: '' } });
  assert.notEqual(r.codigo, 0);
  assert.match(r.error, /Falta el CLI de Notion \(ntn\)\. Instálalo/);
  v.borrar();
});
