import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { detectar, descartar, jerarquia, avisoInicio, avisosLint } from '../scripts/lib/jerarquia.mjs';
import { guardarConfigVault } from '../scripts/lib/rutas.mjs';
import { validarPlan } from '../scripts/lib/reorganizar.mjs';

const MEDICINA = '02 │ 🧭 Areas/🧭 Medicina';
const PERSONAL = '02 │ 🧭 Areas/🧭 Personal';

function cuerpoLargo(secciones, palabrasTotal) {
  const encabezados = Array.from({ length: secciones }, (_, i) => `## Sección ${i + 1}`);
  // Cada "## Sección N" aporta 3 tokens; completamos hasta palabrasTotal exactas.
  const faltan = Math.max(0, palabrasTotal - secciones * 3);
  const relleno = Array.from({ length: faltan }, (_, i) => `término${i + 1}`).join(' ');
  return `${encabezados.join('\n\n')}\n\n${relleno}\n`;
}

test('notas_sueltas y rama_plana: disparan en el umbral y no justo debajo', () => {
  const v = vaultNuevo();
  for (let i = 1; i <= 3; i++) {
    escribir(v.vault, `${MEDICINA}/💡 Nota ${i}.md`, `---\ntipo: nota\n---\n\n# 💡 Nota ${i}\n`);
  }
  assert.equal(detectar(v.vault).some((c) => c.tipo === 'notas_sueltas' && c.carpeta === MEDICINA), false, '3 notas no disparan notas_sueltas');

  escribir(v.vault, `${MEDICINA}/📄 Fuente 4.md`, '---\ntipo: fuente\n---\n\n# 📄 Fuente 4\n');
  const sueltas = detectar(v.vault).find((c) => c.tipo === 'notas_sueltas' && c.carpeta === MEDICINA);
  assert.ok(sueltas, '4 notas (nota + fuente) disparan notas_sueltas');
  assert.deepEqual(sueltas.notas, ['💡 Nota 1', '💡 Nota 2', '💡 Nota 3', '📄 Fuente 4']);

  // rama_plana: 7 subcarpetas no disparan; 8 sí.
  for (let i = 1; i <= 7; i++) {
    v.okt(['tema', 'nuevo', `Personal/📂 Tema ${i}`]);
  }
  assert.equal(detectar(v.vault).some((c) => c.tipo === 'rama_plana' && c.carpeta === PERSONAL), false, '7 subcarpetas no disparan rama_plana');

  v.okt(['tema', 'nuevo', 'Personal/📂 Tema 8']);
  const plana = detectar(v.vault).find((c) => c.tipo === 'rama_plana' && c.carpeta === PERSONAL);
  assert.ok(plana, '8 subcarpetas disparan rama_plana');
  assert.equal(plana.notas.length, 8);
  v.borrar();
});

test('nota_crecio: requiere ≥ 5 encabezados ## y ≥ 1500 palabras sin contar frontmatter ni bloque okt, e ignora artículos y fuentes', () => {
  const v = vaultNuevo();
  // Justo bajo el umbral de palabras (1499 palabras y 5 ##), aunque el bloque okt tenga muchas palabras.
  const bloqueOkt = `<!-- okt:inicio -->\n${'indice '.repeat(300)}\n<!-- okt:fin -->\n`;
  escribir(
    v.vault,
    `${MEDICINA}/🫀 Insuficiencia cardíaca.md`,
    `---\ntipo: nota\nresumen: ${'resumen '.repeat(100)}\n---\n\n${bloqueOkt}${cuerpoLargo(5, 1499)}`,
  );
  // Justo bajo el umbral de encabezados (4 ## y 1600 palabras).
  escribir(v.vault, `${MEDICINA}/🫁 Asma bronquial.md`, `---\ntipo: nota\n---\n\n${cuerpoLargo(4, 1600)}`);
  // Artículo y fuente con 6 ## y 1800 palabras: no cuentan.
  escribir(v.vault, `${MEDICINA}/🔬 Ensayo clínico.md`, `---\ntipo: fuente\n---\n\n${cuerpoLargo(6, 1800)}`);
  escribir(v.vault, `${MEDICINA}/📄 Libro de fisiología.md`, `---\ntipo: nota\nsubtipo: libro\n---\n\n${cuerpoLargo(6, 1800)}`);

  assert.deepEqual(detectar(v.vault).filter((c) => c.tipo === 'nota_crecio'), []);

  // En el umbral exacto: 5 ## y 1500 palabras.
  escribir(v.vault, `${MEDICINA}/🫀 Insuficiencia cardíaca.md`, `---\ntipo: nota\n---\n\n${bloqueOkt}${cuerpoLargo(5, 1500)}`);
  const crecio = detectar(v.vault).filter((c) => c.tipo === 'nota_crecio');
  assert.equal(crecio.length, 1);
  assert.equal(crecio[0].carpeta, MEDICINA);
  assert.deepEqual(crecio[0].notas, ['🫀 Insuficiencia cardíaca']);
  v.borrar();
});

test('tema_casi_vacio: dispara solo con exactamente 1 nota sin subcarpetas; no con 0 ni 2 notas ni cuando es rama con subcarpetas', () => {
  const v = vaultNuevo();
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  // Tema vacío (0 notas además de la principal) → no dispara (esqueleto intencional).
  assert.deepEqual(detectar(v.vault).filter((c) => c.tipo === 'tema_casi_vacio'), []);

  // Con 1 nota además de la principal → dispara.
  escribir(v.vault, `${MEDICINA}/🫀 Cardiología/💡 ECG.md`, '---\ntipo: nota\n---\n\n# 💡 ECG\n');
  const vacios = detectar(v.vault).filter((c) => c.tipo === 'tema_casi_vacio');
  assert.equal(vacios.length, 1);
  assert.equal(vacios[0].carpeta, `${MEDICINA}/🫀 Cardiología`);
  assert.deepEqual(vacios[0].notas, ['💡 ECG']);
  assert.match(vacios[0].detalle, /^tema sin subcarpetas y con solo 1 nota \(💡 ECG\)/);

  // Con 2 notas → ya no es tema_casi_vacio.
  escribir(v.vault, `${MEDICINA}/🫀 Cardiología/💡 Eco.md`, '---\ntipo: nota\n---\n\n# 💡 Eco\n');
  assert.equal(detectar(v.vault).some((c) => c.tipo === 'tema_casi_vacio'), false);

  // Rama cuyas notas están en subcarpetas (1 nota directa pero con subcarpeta) → no da tema_casi_vacio.
  v.okt(['tema', 'nuevo', 'Personal/📚 Lecturas']);
  escribir(v.vault, `${PERSONAL}/📚 Lecturas/💡 Pendiente.md`, '---\ntipo: nota\n---\n\n# 💡 Pendiente\n');
  v.okt(['tema', 'nuevo', 'Personal/Lecturas/📂 Novelas']);
  escribir(v.vault, `${PERSONAL}/📚 Lecturas/📂 Novelas/💡 Rayuela.md`, '---\ntipo: nota\n---\n\n# 💡 Rayuela\n');
  escribir(v.vault, `${PERSONAL}/📚 Lecturas/📂 Novelas/💡 Pedro Páramo.md`, '---\ntipo: nota\n---\n\n# 💡 Pedro Páramo\n');
  assert.equal(
    detectar(v.vault).some((c) => c.tipo === 'tema_casi_vacio' && c.carpeta === `${PERSONAL}/📚 Lecturas`),
    false,
    'una rama con subcarpetas no es tema_casi_vacio',
  );
  v.borrar();
});

test('umbrales en config, descartar, { todos: true }, --carpeta, jerarquia y avisosLint', () => {
  const v = vaultNuevo();
  guardarConfigVault(v.vault, { jerarquia: { notas_sueltas: 2 } });
  escribir(v.vault, `${MEDICINA}/💡 Uno.md`, '---\ntipo: nota\n---\n\n# 💡 Uno\n');
  escribir(v.vault, `${MEDICINA}/💡 Dos.md`, '---\ntipo: nota\n---\n\n# 💡 Dos\n');
  v.okt(['tema', 'nuevo', 'Personal/📂 Solitario']);
  escribir(v.vault, `${PERSONAL}/📂 Solitario/💡 Única.md`, '---\ntipo: nota\n---\n\n# 💡 Única\n');

  assert.equal(detectar(v.vault, { carpeta: 'Medicina' }).length, 1);
  assert.equal(detectar(v.vault, { carpeta: 'Medicina' })[0].tipo, 'notas_sueltas');
  assert.equal(detectar(v.vault, { carpeta: 'Personal' }).length, 1);
  assert.equal(detectar(v.vault, { carpeta: 'Personal' })[0].tipo, 'tema_casi_vacio');

  const todosAntes = detectar(v.vault);
  assert.equal(todosAntes.length, 2);
  assert.equal(avisosLint(v.vault).length, 2);
  assert.equal(avisosLint(v.vault)[0].nivel, 'aviso');

  const idMed = todosAntes.find((c) => c.carpeta === MEDICINA).id;
  assert.throws(() => descartar(v.vault, 'inexistente'), { codigo: 2 });
  descartar(v.vault, idMed);

  const sinDescartados = detectar(v.vault);
  assert.equal(sinDescartados.length, 1);
  assert.equal(sinDescartados[0].carpeta, `${PERSONAL}/📂 Solitario`);
  assert.equal(detectar(v.vault, { todos: true }).length, 2, 'todos: true vuelve a mostrar el descartado');

  const j = jerarquia(v.vault, { carpeta: 'Medicina' });
  assert.equal(j.texto, 'La jerarquía está al día.');

  const jTotal = jerarquia(v.vault);
  assert.match(jTotal.texto, /Siguiente paso: para cada carpeta, okt reorganizar preparar --carpeta "<carpeta>"/);
  v.borrar();
});

test('avisoInicio: no repite el mismo día ni al día siguiente con los mismos ids; sí avisa con candidato nuevo o a los 7 días', () => {
  const v = vaultNuevo();
  const prevFecha = process.env.OKT_FECHA;
  try {
    process.env.OKT_FECHA = '2026-10-22T10:00';
    assert.equal(avisoInicio(v.vault), '');

    v.okt(['tema', 'nuevo', 'Medicina/📂 Casi vacío']);
    escribir(v.vault, `${MEDICINA}/📂 Casi vacío/💡 Solitaria.md`, '---\ntipo: nota\n---\n\n# 💡 Solitaria\n');
    const primero = avisoInicio(v.vault);
    assert.match(primero, /^Jerarquía: 1 carpetas podrían ordenarse de lo general a lo específico \(okt jerarquia\)\./);

    // El mismo día con los mismos ids no repite.
    assert.equal(avisoInicio(v.vault), '');

    // Al día siguiente con los mismos ids tampoco repite.
    process.env.OKT_FECHA = '2026-10-23T10:00';
    assert.equal(avisoInicio(v.vault), '');

    // A los 7 días (2026-10-29) con los mismos ids sí vuelve a avisar y actualiza el sello.
    process.env.OKT_FECHA = '2026-10-29T10:00';
    const semanal = avisoInicio(v.vault);
    assert.match(semanal, /^Jerarquía: 1 carpetas podrían ordenarse de lo general a lo específico \(okt jerarquia\)\./);

    // Con un candidato nuevo el mismo día sí vuelve a avisar.
    v.okt(['tema', 'nuevo', 'Personal/📂 Otro casi vacío']);
    escribir(v.vault, `${PERSONAL}/📂 Otro casi vacío/💡 Otra.md`, '---\ntipo: nota\n---\n\n# 💡 Otra\n');
    const segundo = avisoInicio(v.vault);
    assert.match(segundo, /^Jerarquía: 2 carpetas podrían ordenarse de lo general a lo específico \(okt jerarquia\)\./);
    const sello = JSON.parse(readFileSync(join(v.vault, '.cerebro', 'cache', 'jerarquia-hoy.json'), 'utf8'));
    assert.equal(sello.fecha, '2026-10-29');
    assert.equal(sello.ids.length, 2);
  } finally {
    if (prevFecha === undefined) delete process.env.OKT_FECHA;
    else process.env.OKT_FECHA = prevFecha;
    v.borrar();
  }
});

test('vault numerado con ñ, tildes y emojis, y validarPlan con nota que crece', () => {
  const v = vaultNuevo({ numerar: 'si' });
  v.okt(['tema', 'nuevo', 'Medicina/🧒 Niñez y nutrición pediátrica']);
  escribir(
    v.vault,
    '02 │ 🧭 Areas/01 │ 🧭 Medicina/01 │ 🧒 Niñez y nutrición pediátrica/💡 Lactancia.md',
    '---\ntipo: nota\n---\n\n# 💡 Lactancia\n',
  );
  const cands = detectar(v.vault, { carpeta: 'Medicina/Niñez y nutrición pediátrica' });
  assert.equal(cands.length, 1);
  assert.equal(cands[0].tipo, 'tema_casi_vacio');
  assert.match(cands[0].carpeta, /01 │ 🧭 Medicina\/01 │ 🧒 Niñez y nutrición pediátrica$/);

  escribir(v.vault, '02 │ 🧭 Areas/01 │ 🧭 Medicina/🧬 Cigüeña clínica.md', '---\ntipo: nota\n---\n\n# 🧬 Cigüeña clínica\n');
  assert.throws(
    () => validarPlan(v.vault, { operaciones: [{ tema: 'Personal/🧬 Cigüeña clínica' }] }),
    /ya existe una nota llamada «Cigüeña clínica» en 02 │ 🧭 Areas\/01 │ 🧭 Medicina\/🧬 Cigüeña clínica\.md: elige otro nombre/,
  );
  const ops = validarPlan(v.vault, { operaciones: [{ tema: 'Medicina/🧬 Cigüeña clínica' }] });
  assert.equal(ops.length, 1);
  v.borrar();
});
