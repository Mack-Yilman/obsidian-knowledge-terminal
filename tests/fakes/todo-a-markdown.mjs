// Fake de todo-a-markdown: imita conversión (<archivo> -o <dir>) y pulido (pulir <md> [--aplicar <json>]).
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { registrar, fallar, opcion } from './comun.mjs';

const args = process.argv.slice(2);
registrar('todo-a-markdown', args);

if (args[0] === 'pulir') {
  const rutaMd = args[1];
  if (!rutaMd || !existsSync(rutaMd)) fallar(`fake todo-a-markdown pulir: no existe ${rutaMd}`, 2);
  let texto = readFileSync(rutaMd, 'utf8').replace(/\r\n/g, '\n');
  const mTitle = texto.match(/^title:\s*"?([^"\n]+)"?/m);
  const stem = basename(rutaMd, '.md');
  const title = mTitle ? mTitle[1].trim() : stem;

  // Renombra la imagen con el prefijo del title y la enlaza como ![[...]], dejándola en <stem>_adjuntos/.
  const dirAdj = join(dirname(rutaMd), `${stem}_adjuntos`);
  const imgOriginal = join(dirAdj, '00001.jpeg');
  const nombreImg = `${title} - 00001.jpeg`;
  const imgRenombrada = join(dirAdj, nombreImg);
  if (existsSync(imgOriginal)) renameSync(imgOriginal, imgRenombrada);
  texto = texto.replace(`![](${stem}_adjuntos/00001.jpeg)`, `![[${nombreImg}]]`);

  const rutaAplicar = opcion(args, '--aplicar');
  if (rutaAplicar) {
    const dec = JSON.parse(readFileSync(rutaAplicar, 'utf8'));
    const aceptar = new Set(dec.aceptar || []);
    const excluir = new Set((dec.excluir_lineas || []).map(Number));
    const lineas = texto.split('\n');
    let aplicados = 0;
    if (aceptar.has('p1')) {
      for (let i = 0; i < lineas.length; i++) {
        if (excluir.has(i + 1)) continue;
        const m = lineas[i].match(/^\*\*(CAPÍTULO\b.*?)\*\*[ \t]*$/);
        if (m) {
          lineas[i] = `## ${m[1]}`;
          aplicados++;
        }
      }
    }
    writeFileSync(rutaMd, lineas.join('\n'));
    console.log(
      JSON.stringify({
        estado: 'ok',
        cambios: { imagenes_renombradas: 1, capitulos_en_parrafo: aplicados },
        propuestas: [],
      }),
    );
    process.exit(0);
  }

  writeFileSync(rutaMd, texto);
  const lineas = texto.split('\n');
  const hallazgos = [];
  for (let i = 0; i < lineas.length; i++) {
    if (/^\*\*CAPÍTULO\b.*?\*\*[ \t]*$/.test(lineas[i])) {
      hallazgos.push({ linea: i + 1, texto: lineas[i].trim() });
    }
  }

  if (hallazgos.length) {
    console.log(
      JSON.stringify({
        estado: 'pendiente',
        cambios: { imagenes_renombradas: 1 },
        propuestas: [
          {
            id: 'p1',
            tipo: 'capitulo_en_parrafo',
            linea: hallazgos[0].linea,
            total: hallazgos.length,
            muestras: hallazgos.slice(0, 3),
            accion: 'Convertir líneas **CAPÍTULO** en encabezados ##',
          },
        ],
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        estado: 'ok',
        cambios: { imagenes_renombradas: 1 },
        propuestas: [],
      }),
    );
  }
  process.exit(0);
}

// Conversión: todo-a-markdown <archivo> -o <dir>
const archivo = args[0];
const dirSalida = opcion(args, '-o');
if (!archivo || !dirSalida || !existsSync(archivo)) {
  fallar(`fake todo-a-markdown: argumentos no válidos (${args.join(' ')})`, 2);
}

const ext = extname(archivo).toLowerCase().slice(1);
const stem = basename(archivo, extname(archivo));
const origenTexto = readFileSync(archivo, 'utf8');
const mTitle = origenTexto.match(/^title:\s*(.+)$/m);
const mAuthor = origenTexto.match(/^author:\s*(.+)$/m);
const title = mTitle ? mTitle[1].trim() : stem;
const author = mAuthor ? mAuthor[1].trim() : 'Autor de Prueba';
const sinPropuestas = /sin[_-]propuestas/i.test(origenTexto);

mkdirSync(dirSalida, { recursive: true });
const dirAdjuntos = join(dirSalida, `${stem}_adjuntos`);
mkdirSync(dirAdjuntos, { recursive: true });
writeFileSync(join(dirAdjuntos, '00001.jpeg'), 'FAKE-JPEG-CONTENT');

const lineasMd = [
  '---',
  `title: "${title}"`,
  `author: "${author}"`,
  `source: "${basename(archivo)}"`,
  `format: "${ext}"`,
  'converted: "2026-10-22"',
  '---',
  '',
  `# ${title}`,
  '',
  `## Capítulo 1 ![](${stem}_adjuntos/00001.jpeg)`,
  '',
  'Texto del primer capítulo con cita^[[3]] en medio de la oración.',
  '',
  '',
  '',
  '',
  '## Capítulo 2[7]',
  '',
  'Texto del segundo capítulo sobre mecanismos básicos.',
  '',
  '## **Capítulo 3**',
  '',
  'Texto del tercer capítulo con resumen final.',
];

if (!sinPropuestas) {
  lineasMd.push('', '**CAPÍTULO 4**', '', 'Texto del cuarto capítulo detectado en un párrafo.');
}

const salidaMd = join(dirSalida, `${stem}.md`);
writeFileSync(salidaMd, `${lineasMd.join('\n')}\n`);

console.log(
  JSON.stringify({
    archivo,
    salida: salidaMd,
    formato: ext,
    estado: 'ok',
    motivos: [],
    avisos: [],
    metricas: {
      palabras: 38,
      titulos: { h1: 1, h2: 3, h3: 0 },
      imagenes: 1,
      imagenes_rotas: 0,
      wikilinks_falsos: 0,
    },
  }),
);
