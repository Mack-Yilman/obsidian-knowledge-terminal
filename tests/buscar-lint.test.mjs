import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultNuevo, escribir } from './ayuda.mjs';

const nota = (datos, cuerpo) => `---\n${Object.entries(datos).map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - "${x}"`).join('\n')}` : `${k}: ${v}`)).join('\n')}\n---\n${cuerpo}\n`;

function vaultConNotas() {
  const v = vaultNuevo();
  escribir(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/Anemia ferropénica.md', nota(
    { tipo: 'concepto', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Anemia por déficit de hierro; ferritina baja.', fuentes: ['[[Guía MINSA anemia]]'] },
    '# Anemia ferropénica\n\n## Lo esencial\n\nLa ferritina sérica es el mejor marcador.\nTratamiento con sulfato ferroso.\n\nVer [[Hierro]].',
  ));
  escribir(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/Hierro.md', nota(
    { tipo: 'concepto', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'Mineral esencial.', fuentes: ['[[Guía MINSA anemia]]'] },
    '# Hierro\n\nSe absorbe mejor con vitamina C. Ver [[Anemia ferropénica]].',
  ));
  escribir(v.vault, '40 │ 📚 Fuentes/Guía MINSA anemia.md', nota(
    { tipo: 'fuente', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Norma técnica de anemia.', origen: 'pdf' },
    '# Guía MINSA anemia\n\nUsa [[Anemia ferropénica]] y [[Hierro]].',
  ));
  return v;
}

test('buscar ordena por relevancia: título > resumen > cuerpo, sin importar tildes', () => {
  const v = vaultConNotas();
  const r = v.okt(['buscar', 'anemia ferropenica', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const res = JSON.parse(r.salida);
  assert.equal(res[0].nombre, 'Anemia ferropénica');
  assert.ok(res.some((x) => x.nombre === 'Guía MINSA anemia'));
  assert.equal(res[0].resumen, 'Anemia por déficit de hierro; ferritina baja.');
  v.borrar();
});

test('buscar muestra el fragmento con la coincidencia y filtra por carpeta', () => {
  const v = vaultConNotas();
  let r = v.okt(['buscar', 'vitamina C']);
  assert.match(r.salida, /\[\[Hierro\]\]/);
  assert.match(r.salida, /> .*vitamina C/);
  r = v.okt(['buscar', 'anemia', '--carpeta', '40 │ 📚 Fuentes', '--json']);
  assert.deepEqual(JSON.parse(r.salida).map((x) => x.nombre), ['Guía MINSA anemia']);
  r = v.okt(['buscar', 'zzzinexistente']);
  assert.match(r.salida, /Sin resultados/);
  v.borrar();
});

test('lint en un vault sano no da errores', () => {
  const v = vaultConNotas();
  v.okt(['indice']);
  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const res = JSON.parse(r.salida);
  assert.deepEqual(res.hallazgos.filter((h) => h.nivel === 'error'), []);
  v.borrar();
});

test('lint detecta enlaces rotos, frontmatter incompleto, resumen largo, huérfanas y nombres inválidos', () => {
  const v = vaultConNotas();
  escribir(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/Sepsis.md', nota(
    { tipo: 'concepto', creado: '2026-10-01', resumen: 'x'.repeat(230) },
    '# Sepsis\n\nVer [[Shock séptico]] y [[Hierro#Absorción]].\n\n```\n[[NoEsEnlace]]\n```',
  ));
  escribir(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/Mal nombre #1.md', nota({ tipo: 'concepto', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'r', fuentes: [] }, '# x'));
  const r = v.okt(['lint', '--json']);
  const h = JSON.parse(r.salida).hallazgos;
  const de = (regla, archivo) => h.filter((x) => x.regla === regla && (!archivo || x.archivo.includes(archivo)));
  assert.equal(de('enlace_roto', 'Sepsis').length, 1);
  assert.match(de('enlace_roto', 'Sepsis')[0].detalle, /Shock séptico/);
  assert.ok(de('frontmatter', 'Sepsis').some((x) => /actualizado/.test(x.detalle)));
  assert.ok(de('frontmatter', 'Sepsis').some((x) => /estado/.test(x.detalle)));
  assert.equal(de('resumen_largo', 'Sepsis').length, 1);
  assert.equal(de('huerfana', 'Sepsis').length, 1);
  assert.equal(de('nombre_invalido', 'Mal nombre').length, 1);
  assert.equal(de('sin_fuentes', 'Mal nombre').length, 1);
  v.borrar();
});

test('lint avisa de sellos de frescura vencidos', () => {
  const v = vaultConNotas();
  escribir(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/Dosis.md', nota(
    { tipo: 'concepto', creado: '2026-01-01', actualizado: '2026-01-01', estado: 'revisado', resumen: 'Dosis vigente.', fuentes: ['[[Guía MINSA anemia]]'], frescura_dias: 30 },
    '# Dosis\n\nDosis de 3 mg/kg/día (al 2026-08-01). Otra (al 2026-10-15). [[Hierro]]',
  ));
  const h = JSON.parse(v.okt(['lint', '--json']).salida).hallazgos.filter((x) => x.regla === 'sello_vencido');
  assert.equal(h.length, 1);
  assert.match(h[0].detalle, /2026-08-01.*82 días/);
  v.borrar();
});

test('lint detecta posibles datos de pacientes sin repetir el dato', () => {
  const v = vaultConNotas();
  escribir(v.vault, '00 │ 📥 Bandeja/📝 notas/Caso.md', 'Paciente con DNI 45879632, HC 123456, cel 987654321.\n');
  const r = v.okt(['lint', '--json']);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'datos_sensibles');
  assert.equal(h.length, 3);
  assert.ok(h.every((x) => x.nivel === 'error' && x.linea === 1));
  assert.doesNotMatch(r.salida, /45879632|987654321/);
  v.borrar();
});

test('lint avisa si el índice está desactualizado', () => {
  const v = vaultConNotas();
  const h = JSON.parse(v.okt(['lint', '--json']).salida).hallazgos;
  assert.ok(h.some((x) => x.regla === 'indice_desactualizado'));
  v.borrar();
});
