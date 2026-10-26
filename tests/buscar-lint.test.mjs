import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultNuevo, escribir } from './ayuda.mjs';

const nota = (datos, cuerpo) => `---\n${Object.entries(datos).map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - "${x}"`).join('\n')}` : `${k}: ${v}`)).join('\n')}\n---\n${cuerpo}\n`;
const MEDICINA = '02 │ 🧭 Areas/🧭 Medicina';

function vaultConNotas() {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Anemia ferropénica.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Anemia por déficit de hierro; ferritina baja.', fuentes: ['[[Guía MINSA anemia]]'] },
    '# Anemia ferropénica\n\nLa ferritina sérica es el mejor marcador.\nTratamiento con sulfato ferroso.\n\nVer [[Hierro]].',
  ));
  escribir(v.vault, `${MEDICINA}/Hierro.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'Mineral esencial.', fuentes: ['[[Guía MINSA anemia]]'] },
    '# Hierro\n\nSe absorbe mejor con vitamina C. Ver [[Anemia ferropénica]].',
  ));
  escribir(v.vault, `${MEDICINA}/Guía MINSA anemia.md`, nota(
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

test('buscar muestra el fragmento, filtra por carpeta sin escribir la raíz y no mira el Archivo', () => {
  const v = vaultConNotas();
  let r = v.okt(['buscar', 'vitamina C']);
  assert.match(r.salida, /\[\[Hierro\]\]/);
  assert.match(r.salida, /> .*vitamina C/);
  v.okt(['nota', 'nueva', 'nota', '💰 Presupuesto con anemia de ahorro', '--carpeta', 'Personal']);
  r = v.okt(['buscar', 'anemia', '--carpeta', 'Medicina', '--tipo', 'fuente', '--json']);
  assert.deepEqual(JSON.parse(r.salida).map((x) => x.nombre), ['Guía MINSA anemia']);
  escribir(v.vault, '04 │ 🗄️ Archivo/📥 Bruto/2026-10/📥 vitamina vieja.md', nota({ tipo: 'captura', creado: '2026-10-01' }, 'vitamina C del original'));
  r = v.okt(['buscar', 'vitamina', '--json']);
  assert.ok(!JSON.parse(r.salida).some((x) => x.ruta.startsWith('90 │')), 'lo archivado no aparece si no se pide');
  r = v.okt(['buscar', 'vitamina', '--carpeta', 'bruto', '--json']);
  assert.equal(JSON.parse(r.salida).length, 1);
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
  assert.ok(!res.hallazgos.some((h) => h.regla === 'indice_desactualizado'));
  v.borrar();
});

test('lint detecta enlaces rotos, frontmatter incompleto, resumen largo, notas sin enlaces y nombres inválidos', () => {
  const v = vaultConNotas();
  escribir(v.vault, `${MEDICINA}/Sepsis.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', resumen: 'x'.repeat(230) },
    '# Sepsis\n\nVer [[Shock séptico]] y [[Hierro#Absorción]].\n\n```\n[[NoEsEnlace]]\n```',
  ));
  escribir(v.vault, `${MEDICINA}/Mal nombre #1.md`, nota({ tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'r' }, '# x\n\nSin enlaces.'));
  const r = v.okt(['lint', '--json']);
  const h = JSON.parse(r.salida).hallazgos;
  const de = (regla, archivo) => h.filter((x) => x.regla === regla && (!archivo || x.archivo.includes(archivo)));
  assert.equal(de('enlace_roto', 'Sepsis').length, 1);
  assert.match(de('enlace_roto', 'Sepsis')[0].detalle, /Shock séptico/);
  assert.ok(de('frontmatter', 'Sepsis').some((x) => /actualizado/.test(x.detalle)));
  assert.ok(de('frontmatter', 'Sepsis').some((x) => /estado/.test(x.detalle)));
  assert.equal(de('resumen_largo', 'Sepsis').length, 1);
  assert.equal(de('nombre_invalido', 'Mal nombre').length, 1);
  assert.equal(de('sin_enlaces', 'Mal nombre').length, 1);
  assert.equal(de('sin_enlaces', 'Sepsis').length, 0);
  v.borrar();
});

test('lint: notas fuera de lugar y tipos de la 0.3; los temas profundos ya no son un hallazgo', () => {
  const v = vaultConNotas();
  escribir(v.vault, '02 │ 🧭 Areas/Suelta.md', nota({ tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'r' }, '[[Hierro]]'));
  escribir(v.vault, `${MEDICINA}/Viejo.md`, nota({ tipo: 'concepto', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'r' }, '[[Hierro]]'));
  escribir(v.vault, `${MEDICINA}/a/b/c/d/Hondo.md`, nota({ tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'r' }, '[[Hierro]]'));
  const h = JSON.parse(v.okt(['lint', '--json']).salida).hallazgos;
  assert.ok(h.some((x) => x.regla === 'fuera_de_lugar' && x.archivo.endsWith('Areas/Suelta.md')));
  assert.ok(h.some((x) => x.regla === 'tipo_antiguo' && x.archivo.endsWith('Viejo.md')));
  assert.ok(!h.some((x) => x.regla === 'muy_profunda'), 'sin límite de niveles desde la 0.5.0');
  v.borrar();
});

test('lint avisa de sellos de frescura vencidos', () => {
  const v = vaultConNotas();
  escribir(v.vault, `${MEDICINA}/Dosis.md`, nota(
    { tipo: 'nota', creado: '2026-01-01', actualizado: '2026-01-01', estado: 'revisado', resumen: 'Dosis vigente.', fuentes: ['[[Guía MINSA anemia]]'], frescura_dias: 30 },
    '# Dosis\n\nDosis de 3 mg/kg/día (al 2026-08-01). Otra (al 2026-10-15). [[Hierro]]',
  ));
  const h = JSON.parse(v.okt(['lint', '--json']).salida).hallazgos.filter((x) => x.regla === 'sello_vencido');
  assert.equal(h.length, 1);
  assert.match(h[0].detalle, /2026-08-01.*82 días/);
  v.borrar();
});

test('lint no filtra el contenido: un DNI o un nombre en una nota no es un hallazgo', () => {
  const v = vaultConNotas();
  escribir(v.vault, '00 │ 📥 Bandeja/Caso.md', 'Paciente Juan Pérez con DNI 45879632, HC 123456, cel 987654321.\n');
  const r = v.okt(['lint', '--json']);
  assert.ok(!JSON.parse(r.salida).hallazgos.some((x) => /sensible/.test(x.regla)));
  v.borrar();
});

test('lint avisa si los índices están desactualizados', () => {
  const v = vaultConNotas();
  const h = JSON.parse(v.okt(['lint', '--json']).salida).hallazgos;
  assert.ok(h.some((x) => x.regla === 'indice_desactualizado'));
  v.borrar();
});
