import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { extraerEnlaces, extraerAnclas } from '../scripts/lib/vault.mjs';

const nota = (datos, cuerpo) => `---\n${Object.entries(datos).map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - "${x}"`).join('\n')}` : `${k}: ${v}`)).join('\n')}\n---\n${cuerpo}\n`;
const notaCRLF = (datos, cuerpo) => `---\r\n${Object.entries(datos).map(([k, v]) => (Array.isArray(v) ? `${k}:\r\n${v.map((x) => `  - "${x}"`).join('\r\n')}` : `${k}: ${v}`)).join('\r\n')}\r\n---\r\n${cuerpo}\r\n`;
const MEDICINA = '02 │ 🧭 Areas/🧭 Medicina';

test('extraerEnlaces y extraerAnclas: contrato y desglose de anclas', () => {
  const texto = [
    'Enlace simple: [[Nota A]]',
    'Enlace con sección: [[Nota A#Diagnóstico clínico]]',
    'Enlace múltiple hash: [[Nota A#H1#H2|Alias]]',
    'Enlace a bloque: [[Nota A#^id-123]]',
    'Enlace misma nota: [[#Conclusión]] y [[#^bloque-local]]',
    'Enlace con imagen anidada: [[Nota A#Cap 1 ![[foto.png]]|Capítulo 1]]',
    '```',
    '[[NotaIgnorada#NoExiste]]',
    '```',
    'En línea: `[[OtraIgnorada#NoExiste]]`',
  ].join('\n');

  const enlaces = extraerEnlaces(texto);
  // Mantener contrato: solo enlaces con destino no vacío
  assert.ok(enlaces.every((e) => e.destino && typeof e.incrustado === 'boolean'));
  assert.ok(!enlaces.some((e) => e.destino === ''));
  assert.ok(!enlaces.some((e) => e.destino === 'NotaIgnorada'));
  assert.ok(enlaces.some((e) => e.destino === 'Nota A' && e.ancla.includes('![[foto.png]]')));

  const anclas = extraerAnclas(texto);
  // Todos los enlaces con # (incluyendo destino vacío) fuera de bloques de código
  assert.ok(!anclas.some((a) => a.destino === 'NotaIgnorada' || a.destino === 'OtraIgnorada'));
  const h2 = anclas.find((a) => a.etiqueta === 'Alias');
  assert.ok(h2);
  assert.equal(h2.destino, 'Nota A');
  assert.equal(h2.ancla, 'H2'); // último tramo tras #
  assert.equal(h2.bloque, false);

  const bloque = anclas.find((a) => a.ancla === '^id-123');
  assert.ok(bloque);
  assert.equal(bloque.bloque, true);

  const local = anclas.find((a) => a.ancla === 'Conclusión');
  assert.ok(local);
  assert.equal(local.destino, '');
  assert.equal(local.bloque, false);

  const imagen = anclas.find((a) => a.ancla.includes('foto.png'));
  assert.ok(imagen);
  assert.equal(imagen.destino, 'Nota A');
  assert.equal(imagen.etiqueta, 'Capítulo 1');
});

test('ancla existente pasa (con distinto uso de mayúsculas)', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Guía clínica.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Guía con encabezados.' },
    '# Guía clínica\n\n## Tratamiento farmacológico\n\nTexto de tratamiento.',
  ));
  escribir(v.vault, `${MEDICINA}/Receta.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Receta médica.' },
    '# Receta\n\nVer [[Guía clínica#tratamiento farmacológico]] y [[Guía clínica#TRATAMIENTO FARMACOLÓGICO]].',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'ancla_rota');
  assert.equal(h.length, 0);
  v.borrar();
});

test('ancla inexistente da ancla_rota con sugerencia', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Cardiología.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Especialidad médica.' },
    '# Cardiología\n\n## Diagnóstico precoz\n\nDetalle de diagnóstico.',
  ));
  escribir(v.vault, `${MEDICINA}/Consulta.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Consulta clínica.' },
    '# Consulta\n\nVer [[Cardiología#Diagnostico tardio]].',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'ancla_rota');
  assert.equal(h.length, 1);
  assert.equal(h[0].nivel, 'error');
  assert.match(h[0].archivo, /Consulta\.md/);
  assert.match(h[0].detalle, /¿quisiste decir #Diagnóstico precoz\?/);
  v.borrar();
});

test('#^id existente y roto', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Fisiología.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Fisiología médica.' },
    '# Fisiología\n\nGasto cardíaco normal de 5 L/min. ^gasto-cardiaco\n',
  ));
  escribir(v.vault, `${MEDICINA}/Examen.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Examen médico.' },
    '# Examen\n\nVer [[Fisiología#^gasto-cardiaco]] y [[Fisiología#^bloque-inexistente]].',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'ancla_rota');
  assert.equal(h.length, 1);
  assert.match(h[0].detalle, /\^bloque-inexistente/);
  v.borrar();
});

test('[[#Sección]] en la misma nota', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Monografía.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Monografía extensa.' },
    '# Monografía\n\nIr a [[#Conclusión]] y a [[#Metodología ausente]].\n\n## Conclusión\n\nFin del texto.',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'ancla_rota');
  assert.equal(h.length, 1);
  assert.match(h[0].detalle, /\[\[#Metodología ausente\]\] no existe en esta nota/);
  v.borrar();
});

test('Nota#H1#H2 funciona con encabezados anidados', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Anatomía.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Anatomía del corazón.' },
    '# Sistema cardiovascular\n\n## Miocardio\n\nTejido muscular cardíaco.',
  ));
  escribir(v.vault, `${MEDICINA}/Patología.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Patologías cardíacas.' },
    '# Patología\n\nVer [[Anatomía#Sistema cardiovascular#Miocardio]].',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'ancla_rota');
  assert.equal(h.length, 0);
  v.borrar();
});

test('un enlace con ![[img.png]] dentro da imagen_en_enlace y no genera un enlace_roto falso', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Libro.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Libro de texto.' },
    '# Libro\n\n## Capítulo 1\n\nTexto introductorio.',
  ));
  escribir(v.vault, `${MEDICINA}/Indice manual.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Índice de capítulos.' },
    '# Índice\n\nVer [[Libro#Capítulo 1 ![[portada.png]]|Capítulo 1]].',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const res = JSON.parse(r.salida);
  const imgErr = res.hallazgos.filter((x) => x.regla === 'imagen_en_enlace');
  const rotos = res.hallazgos.filter((x) => x.regla === 'enlace_roto');

  assert.equal(imgErr.length, 1);
  assert.equal(imgErr[0].nivel, 'error');
  assert.match(imgErr[0].detalle, /portada\.png/);
  // No debe marcar falso enlace_roto para [[Libro]]
  assert.equal(rotos.length, 0);
  v.borrar();
});

test('enlaces dentro de bloques de código se ignoran', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Manual markdown.md`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Manual de sintaxis.' },
    '# Manual\n\n```markdown\n[[Inexistente#NoExiste]]\n[[#LocalInexistente]]\n[[Nota#Cap ![[img.png]]|Cap]]\n```\n\nEn línea: `[[Inexistente#NoExiste]]`.',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => ['ancla_rota', 'imagen_en_enlace', 'enlace_roto'].includes(x.regla));
  assert.equal(h.length, 0);
  v.borrar();
});

test('una nota en una ruta de más de 240 caracteres da ruta_larga (crea carpetas anidadas con nombres largos con ñ y emojis)', () => {
  const v = vaultNuevo();
  const dirLargo = `${MEDICINA}/🔬 Especialidad de Investigación Clínico-Quirúrgica Avanzada y Acompañamiento Diagnóstico/🧬 Análisis Moleculares de Próxima Generación y Secuenciación Masiva de Pacientes Oncológicos Complejos`;
  const nombreLargo = '💡 Estudio Detallado de Variantes Genéticas Estructurales Congénitas con Acompañamiento Familiar Continuo.md';
  escribir(v.vault, `${dirLargo}/${nombreLargo}`, nota(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'Nota en ruta muy profunda.' },
    '# Estudio de variantes\n\nTexto.',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'ruta_larga');
  assert.equal(h.length, 1);
  assert.equal(h[0].nivel, 'aviso');
  assert.match(h[0].detalle, /acorta el nombre de la nota o de una carpeta \(okt renombrar\)/);
  assert.match(h[0].detalle, /\d+ caracteres/);
  v.borrar();
});

test('una nota con CRLF funciona', () => {
  const v = vaultNuevo();
  escribir(v.vault, `${MEDICINA}/Guía CRLF.md`, notaCRLF(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Nota con saltos de línea CRLF.' },
    '# Encabezado CRLF\r\n\r\nTexto con identificador. ^bloque-crlf\r\n\r\n## Sección CRLF\r\n\r\nDetalle.',
  ));
  escribir(v.vault, `${MEDICINA}/Lector CRLF.md`, notaCRLF(
    { tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'revisado', resumen: 'Lector de nota CRLF.' },
    '# Lector\r\n\r\nVer [[Guía CRLF#Sección CRLF]] y [[Guía CRLF#^bloque-crlf]].\r\nVer [[Guía CRLF#^bloque-falso]].\r\n',
  ));

  const r = v.okt(['lint', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const h = JSON.parse(r.salida).hallazgos.filter((x) => x.regla === 'ancla_rota');
  assert.equal(h.length, 1);
  assert.match(h[0].detalle, /\^bloque-falso/);
  v.borrar();
});