import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir, RAIZ } from './ayuda.mjs';
import { preparar, aplicar, verificar, pendientes, sanear } from '../scripts/lib/libro.mjs';
import { leerFrontmatter, escribirFrontmatter } from '../scripts/lib/frontmatter.mjs';
import { sobrescribir } from '../scripts/lib/rutas.mjs';

const FAKE_BIN = join(RAIZ, 'tests', 'fakes', 'todo-a-markdown.mjs');
process.env['OKT_BIN_TODO-A-MARKDOWN'] = FAKE_BIN;
process.env.OKT_FECHA = '2026-10-22T10:30';

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');

test('un libro sin propuestas termina en un paso: crea tema, texto, ficha, mueve imagen y original a Bruto y borra caché', () => {
  const v = vaultNuevo();
  escribir(v.vault, '00 │ 📥 Bandeja/Manual de Semiología.epub', 'title: Manual de Semiología\nauthor: Dr. Pérez\nsin-propuestas\n');

  const r = preparar(v.vault, '00 │ 📥 Bandeja/Manual de Semiología.epub', {
    en: 'Medicina',
    publicado: '2024',
  });

  assert.equal(r.datos.estado, 'ok');
  assert.match(r.texto, /Siguiente paso: lee el índice de la ficha/);

  const carpetaTema = '02 │ 🧭 Areas/🧭 Medicina/📚 Manual de Semiología';
  assert.ok(existsSync(join(v.vault, `${carpetaTema}/📚 Manual de Semiología.md`)), 'nota principal del tema');

  const relTexto = `${carpetaTema}/📖 Manual de Semiología - Texto completo.md`;
  const relFicha = `${carpetaTema}/📄 Manual de Semiología.md`;
  assert.ok(existsSync(join(v.vault, relTexto)), 'texto completo creado');
  assert.ok(existsSync(join(v.vault, relFicha)), 'ficha creada');

  const fmTexto = leerFrontmatter(leer(v, relTexto));
  assert.equal(fmTexto.datos.tipo, 'fuente');
  assert.equal(fmTexto.datos.estado, 'revisado');
  assert.equal(fmTexto.datos.resumen, 'Texto íntegro de Manual de Semiología en Markdown, con navegación por capítulos.');
  assert.deepEqual(fmTexto.datos.aliases, ['Manual de Semiología - Texto completo']);
  assert.deepEqual(fmTexto.datos.fuentes, ['[[📄 Manual de Semiología]]']);
  assert.match(fmTexto.cuerpo, /\(3\)/, '^[[3]] convertido a (3)');
  assert.match(fmTexto.cuerpo, /^## Capítulo 2$/m, '[7] quitado del encabezado');

  const fmFicha = leerFrontmatter(leer(v, relFicha));
  assert.equal(fmFicha.datos.tipo, 'fuente');
  assert.equal(fmFicha.datos.estado, 'borrador');
  assert.equal(fmFicha.datos.resumen, '');
  assert.equal(fmFicha.datos.origen, 'archivo');
  assert.equal(fmFicha.datos.autor, 'Dr. Pérez');
  assert.equal(fmFicha.datos.publicado, '2024');
  assert.deepEqual(fmFicha.datos.aliases, ['Manual de Semiología']);
  assert.match(fmFicha.cuerpo, /## 🔗 Relacionado\n- \[\[📚 Manual de Semiología\]\]/);

  // Imagen movida a la carpeta de adjuntos de destino
  const rutaImg = '05 │ ⚙️ Sistema/📎 adjuntos/📖 libros/Manual de Semiología/Manual de Semiología - 00001.jpeg';
  assert.ok(existsSync(join(v.vault, rutaImg)), 'imagen movida a R.adjuntos/📖 libros/<Título>');

  // Original movido a Bruto
  assert.equal(existsSync(join(v.vault, '00 │ 📥 Bandeja/Manual de Semiología.epub')), false);
  assert.ok(existsSync(join(v.vault, '04 │ 🗄️ Archivo/📥 Bruto/2026-10/Manual de Semiología.epub')), 'original en Bruto');

  // Caché borrada
  assert.equal(pendientes(v.vault).datos.pendientes.length, 0);

  // Si ya tiene Texto completo, código 3
  escribir(v.vault, '00 │ 📥 Bandeja/Manual de Semiología.epub', 'sin-propuestas');
  assert.throws(
    () => preparar(v.vault, '00 │ 📥 Bandeja/Manual de Semiología.epub', { en: 'Medicina' }),
    (err) => err.codigo === 3,
  );

  v.borrar();
});

test('con propuestas: preparar para en pendiente; aplicar con p1 deja ## CAPÍTULO 4 en texto e índice, y con --aceptar "" no', () => {
  const v = vaultNuevo();
  escribir(v.vault, '00 │ 📥 Bandeja/Tratado.epub', 'title: Tratado\nauthor: Autora\n');

  const prep = preparar(v.vault, '00 │ 📥 Bandeja/Tratado.epub', { en: 'Medicina' });
  assert.equal(prep.datos.estado, 'pendiente');
  assert.equal(prep.datos.propuestas.length, 1);
  assert.equal(prep.datos.propuestas[0].id, 'p1');
  assert.match(prep.texto, /okt libro aplicar "Tratado" --aceptar "p1,p3"/);
  assert.equal(pendientes(v.vault).datos.pendientes.length, 1);

  const fin = aplicar(v.vault, 'Tratado', { aceptar: 'p1' });
  assert.equal(fin.datos.estado, 'ok');
  assert.equal(pendientes(v.vault).datos.pendientes.length, 0);

  const texto = leer(v, fin.datos.textoCompleto);
  const ficha = leer(v, fin.datos.ficha);
  assert.match(texto, /^## CAPÍTULO 4$/m);
  assert.match(ficha, /\[\[📖 Tratado - Texto completo#CAPÍTULO 4\|CAPÍTULO 4\]\]/);

  // Segundo libro: con --aceptar "" no convierte **CAPÍTULO 4** en ##
  escribir(v.vault, '00 │ 📥 Bandeja/Compendio.pdf', 'title: Compendio\n');
  const prep2 = preparar(v.vault, '00 │ 📥 Bandeja/Compendio.pdf', { en: 'Medicina' });
  assert.equal(prep2.datos.estado, 'pendiente');

  const fin2 = aplicar(v.vault, '📚 Compendio', { aceptar: '' });
  assert.equal(fin2.datos.estado, 'ok');
  const texto2 = leer(v, fin2.datos.textoCompleto);
  const ficha2 = leer(v, fin2.datos.ficha);
  assert.doesNotMatch(texto2, /^## CAPÍTULO 4$/m);
  assert.match(texto2, /^\*\*CAPÍTULO 4\*\*$/m);
  assert.doesNotMatch(ficha2, /CAPÍTULO 4/);

  v.borrar();
});

test('sanear como función pura: aplica cada regla y no cambia ninguna otra palabra', () => {
  const entrada = [
    '# Título principal[1]',
    '',
    '## Sección A<sup>19</sup>',
    '',
    'Párrafo intacto con palabras exactas y nota^[[19]] aquí.',
    '',
    '',
    '',
    '',
    '### Subsección B[^4]',
    '',
    'Otro párrafo con [enlace normal](https://example.com) y corchetes [19] en texto normal.',
  ].join('\n');

  const { texto, cambios } = sanear(entrada);
  assert.equal(cambios.notas_encabezado, 3);
  assert.equal(cambios.notas_texto, 1);
  assert.equal(cambios.lineas_en_blanco, 1);

  const esperado = [
    '# Título principal',
    '',
    '## Sección A',
    '',
    'Párrafo intacto con palabras exactas y nota(19) aquí.',
    '',
    '### Subsección B',
    '',
    'Otro párrafo con [enlace normal](https://example.com) y corchetes [19] en texto normal.',
  ].join('\n');

  assert.equal(texto, esperado);
});

test('la ficha no tiene ![[ en el índice, sus anclas existen, y verificar falla con okt:llm y pasa al completar resumen y secciones', () => {
  const v = vaultNuevo();
  escribir(v.vault, '00 │ 📥 Bandeja/Fisiología.epub', 'title: Fisiología\nsin-propuestas\n');

  const r = preparar(v.vault, '00 │ 📥 Bandeja/Fisiología.epub', { en: 'Medicina' });
  const fichaTexto = leer(v, r.datos.ficha);
  const completoTexto = leer(v, r.datos.textoCompleto);

  assert.doesNotMatch(fichaTexto, /!\[\[/, 'ningún ![[ en la ficha ni en el índice');
  assert.match(fichaTexto, /- \[\[📖 Fisiología - Texto completo#\*\*Capítulo 3\*\*\|Capítulo 3\]\]/, 'etiqueta sin ** pero ancla exacta');

  // Todas las anclas del índice existen como ## en el texto completo
  const encabezados = new Set([...completoTexto.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1].trim()));
  const enlacesIndice = [...fichaTexto.matchAll(/- \[\[📖 Fisiología - Texto completo#([^|\]]+)\|([^\]]+)\]\]/g)];
  assert.equal(enlacesIndice.length, 3);
  for (const [, ancla] of enlacesIndice) {
    assert.ok(encabezados.has(ancla), `debe existir el encabezado ## ${ancla}`);
  }

  // verificar falla mientras queden <!-- okt:llm --> y resumen vacío
  const v1 = verificar(v.vault, 'Fisiología');
  assert.equal(v1.datos.ok, false);
  assert.ok(v1.datos.problemas.some((p) => p.includes('okt:llm')));
  assert.ok(v1.datos.problemas.some((p) => p.includes('resumen')));

  // Reemplazamos los marcadores okt:llm y completamos el resumen
  const { datos, cuerpo } = leerFrontmatter(fichaTexto);
  const cuerpoLimpio = cuerpo.replace(/<!-- okt:llm .*? -->/g, 'Contenido redactado por el modelo.');
  sobrescribir(join(v.vault, r.datos.ficha), escribirFrontmatter({ ...datos, resumen: 'Síntesis completa de fisiología.' }, cuerpoLimpio));

  const v2 = verificar(v.vault, '📄 Fisiología');
  assert.equal(v2.datos.ok, true, v2.texto);
  assert.deepEqual(v2.datos.problemas, []);

  v.borrar();
});

test('sin el binario todo-a-markdown lanza error de uso indicando cómo instalarlo', () => {
  const v = vaultNuevo();
  escribir(v.vault, '00 │ 📥 Bandeja/Libro.epub', 'sin-propuestas');
  const prevBin = process.env['OKT_BIN_TODO-A-MARKDOWN'];
  const prevPath = process.env.PATH;
  try {
    process.env['OKT_BIN_TODO-A-MARKDOWN'] = join(v.dir, 'no-existe.exe');
    process.env.PATH = '';
    assert.throws(
      () => preparar(v.vault, '00 │ 📥 Bandeja/Libro.epub', { en: 'Medicina' }),
      (err) => err.codigo === 2 && /Falta la CLI todo-a-markdown.*skill todo-a-markdown/.test(err.message),
    );
  } finally {
    process.env['OKT_BIN_TODO-A-MARKDOWN'] = prevBin;
    process.env.PATH = prevPath;
    v.borrar();
  }
});

test('vault numerado crea 01 │ … y soporta título con ñ, tildes y emoji temático (archivo fuera del vault)', () => {
  const v = vaultNuevo({ numerar: 'si' });
  const archivoExterno = escribir(v.dir, 'externo/niño-sueño.epub', 'title: El niño y el sueño\nauthor: Dra. Ñañez\nsin-propuestas\n');

  const r = preparar(v.vault, archivoExterno, {
    en: 'Medicina',
    titulo: '🧠 El niño y el sueño clínico',
  });

  assert.equal(r.datos.estado, 'ok');
  assert.equal(r.datos.tema, '02 │ 🧭 Areas/01 │ 🧭 Medicina/01 │ 🧠 El niño y el sueño clínico');
  assert.ok(existsSync(join(v.vault, '02 │ 🧭 Areas/01 │ 🧭 Medicina/01 │ 🧠 El niño y el sueño clínico/01 │ 🧠 El niño y el sueño clínico.md')));
  assert.ok(existsSync(join(v.vault, '02 │ 🧭 Areas/01 │ 🧭 Medicina/01 │ 🧠 El niño y el sueño clínico/📄 El niño y el sueño clínico.md')));
  assert.ok(existsSync(join(v.vault, '02 │ 🧭 Areas/01 │ 🧭 Medicina/01 │ 🧠 El niño y el sueño clínico/📖 El niño y el sueño clínico - Texto completo.md')));
  assert.ok(existsSync( archivoExterno ), 'el archivo fuera del vault no se mueve');
  assert.match(r.texto, /fuera del vault/);

  const ficha = leer(v, r.datos.ficha);
  assert.match(ficha, /## 🔗 Relacionado\n- \[\[01 │ 🧠 El niño y el sueño clínico\]\]/);

  v.borrar();
});
