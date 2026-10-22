// Estructura con emojis (0.3.0): nombres, migración de un vault 0.2.x, renombrar y las correcciones de la
// auditoría del 2026-10-22 (CSV de NotebookLM, archivos ocultos, git con nombres no ASCII).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { temporal, escribir, okt, vaultNuevo } from './ayuda.mjs';
import { conEmoji, traducir, resolverCarpeta } from '../scripts/lib/estructura.mjs';
import { sinEmoji, empiezaConEmoji, recortar, limpiarNombre } from '../scripts/lib/nombres.mjs';
import { leerCsv } from '../scripts/lib/notebooklm.mjs';
import { reescribirEnlaces } from '../scripts/lib/migrar.mjs';
import { cambiosDesde } from '../scripts/lib/git.mjs';

const leer = (vault, rel) => readFileSync(join(vault, rel), 'utf8');
const fm = (datos, extra = '') => `---\n${Object.entries(datos).map(([k, v]) => `${k}: ${v}`).join('\n')}\n${extra}---\n`;

test('emojis: temático en conocimiento, proyectos y áreas; fijo en lo demás', () => {
  assert.equal(conEmoji('concepto', '🩸 Anemia'), '🩸 Anemia');
  assert.equal(conEmoji('concepto', 'Anemia'), '💡 Anemia');
  assert.equal(conEmoji('area', '🩺 Medicina'), '🩺 Medicina');
  assert.equal(conEmoji('fuente', '🩸 Guía'), '📄 Guía');
  assert.equal(conEmoji('diario', '2026-10-22'), '📅 2026-10-22');
  assert.equal(conEmoji('telegram', '2026-10-22 1805 idea'), '📲 2026-10-22 1805 idea');
  for (const [con, sin] of [['🩸 Anemia', 'Anemia'], ['⚙️ Sistema', 'Sistema'], ['👩🏽‍⚕️ Médica', 'Médica'], ['🇵🇪 Perú', 'Perú'], ['©2024 Guía', '©2024 Guía'], ['2026-10-22', '2026-10-22']]) {
    assert.equal(sinEmoji(con), sin, con);
  }
  assert.equal(empiezaConEmoji('©2024'), false);
  // Un corte nunca parte un emoji en dos.
  assert.equal(recortar('a😀b', 2), 'a😀');
  assert.ok(!/[\uD800-\uDBFF]$/.test(limpiarNombre(`${'x'.repeat(119)}😀😀`)));
});

test('rutas: la estructura anterior se traduce y --carpeta acepta nombres cortos y sin emoji', () => {
  assert.equal(traducir('00-Bandeja/telegram/x.md'), '00 │ 📥 Bandeja/📲 telegram/x.md');
  assert.equal(traducir('99-Sistema/hot.md'), '99 │ ⚙️ Sistema/🔥 hot.md');
  assert.equal(traducir('90-Archivo/10-Proyectos/Curso'), '90 │ 🗄️ Archivo/10 │ 🎯 Proyectos/Curso');
  assert.equal(traducir('40-Fuentes/adjuntos/pdf/a.pdf'), '40 │ 📚 Fuentes/📎 adjuntos/📕 pdf/a.pdf');
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'proyecto', '🐍 Curso de Python']);
  for (const pedido of ['proyectos/Curso de Python', '10-Proyectos/Curso de Python', '10 │ 🎯 Proyectos/🐍 Curso de Python']) {
    assert.equal(resolverCarpeta(v.vault, pedido), '10 │ 🎯 Proyectos/🐍 Curso de Python', pedido);
  }
  assert.equal(resolverCarpeta(v.vault, 'importados'), '00 │ 📥 Bandeja/📦 importados');
  v.borrar();
});

test('reescribirEnlaces cambia destinos, conserva sección y alias, y no toca el código', () => {
  const nombres = new Map([['anemia', '🩸 Anemia']]);
  const texto = 'Ver [[Anemia]], [[anemia#Causas|causas]] y ![[Anemia]].\n```\n[[Anemia]]\n```\n[[Otra]]';
  assert.equal(reescribirEnlaces(texto, nombres), 'Ver [[🩸 Anemia]], [[🩸 Anemia#Causas|causas]] y ![[🩸 Anemia]].\n```\n[[Anemia]]\n```\n[[Otra]]');
});

// Un vault como lo dejaba OKT 0.2.x, con sus registros.
function vaultAntiguo() {
  const t = temporal();
  const vault = join(t.dir, 'cerebro');
  const configDir = join(t.dir, 'config');
  const e = (rel, texto) => escribir(vault, rel, texto);
  e('.cerebro/config.json', JSON.stringify({ version: 1, areas: ['Medicina'], cuadernos: { '10-Proyectos/Tesis': { id: 'n1', titulo: 'Tesis' } } }));
  e('.cerebro/importaciones.json', JSON.stringify({ 'notion:p1': { ruta: '00-Bandeja/importados/Apuntes.md', importado: '2026-10-20' } }));
  e('.cerebro/fuentes.json', JSON.stringify({ abc: '40-Fuentes/adjuntos/pdf/Guía.pdf' }));
  e('.cerebro/telegram.json', JSON.stringify({ escritos: { t1: { ruta: '00-Bandeja/telegram/2026-10-21 1805 idea.md', fecha: new Date().toISOString() } } }));
  e('.obsidian/app.json', JSON.stringify({ attachmentFolderPath: '40-Fuentes/adjuntos', newFileFolderPath: '00-Bandeja/notas' }));
  e('.obsidian/daily-notes.json', JSON.stringify({ folder: '50-Diario', format: 'YYYY-MM-DD', template: '99-Sistema/plantillas/Diario' }));
  e('.obsidian/templates.json', JSON.stringify({ folder: '99-Sistema/plantillas' }));
  e('.gitignore', '.cerebro/cache/\n.tmp.driveupload/\n');
  e('AGENTS.md', 'Mío arriba.\n\n<!-- okt:inicio -->\nviejo\n<!-- okt:fin -->\n');
  e('20-Areas/Medicina.md', `${fm({ tipo: 'area', creado: '2026-10-01', actualizado: '2026-10-01', resumen: 'Área.' })}\n# Medicina\n\n## Notas\n`);
  e('30-Conocimiento/conceptos/Anemia.md', `${fm({ tipo: 'concepto', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'Hb baja.', area: '"[[Medicina]]"' }, 'fuentes:\n  - "[[Guía MINSA]]"\n')}\n# Anemia\n\nVer [[Guía MINSA#Tabla 2|la tabla]] y [[Tesis]].\n`);
  e('40-Fuentes/Guía MINSA.md', `${fm({ tipo: 'fuente', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'Norma.', origen: 'pdf' })}\n# Guía MINSA\n\n## Método\n\n![[Guía.pdf]]\n`);
  e('40-Fuentes/adjuntos/pdf/Guía.pdf', '%PDF');
  e('10-Proyectos/Tesis/Tesis.md', `${fm({ tipo: 'proyecto', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'activo', resumen: 'Tesis.' })}\n# Tesis\n\nSobre [[Anemia]].\n`);
  e('10-Proyectos/Tesis/Borrador.md', 'Sin frontmatter: se mueve con su carpeta, sin emoji.\n');
  e('00-Bandeja/importados/Apuntes.md', `${fm({ tipo: 'nota', creado: '2026-10-20', origen: 'notion' })}\n# Apuntes\n`);
  e('00-Bandeja/telegram/2026-10-21 1805 idea.md', `${fm({ tipo: 'nota', creado: '2026-10-21', origen: 'telegram' })}\n# idea\n`);
  e('50-Diario/2026-10-22.md', `${fm({ tipo: 'diario', creado: '2026-10-22' })}\n# 2026-10-22\n`);
  e('99-Sistema/hot.md', `${fm({ tipo: 'sistema', creado: '2026-10-01' })}\n# Contexto reciente\n\n<!-- okt:inicio -->\n- nada\n<!-- okt:fin -->\n`);
  e('99-Sistema/bitacora.md', `${fm({ tipo: 'sistema', creado: '2026-10-01' })}\n# Bitácora\n\n<!-- okt:inicio -->\n- 2026-10-01 10:00 · capturar · creó · [[Anemia]]\n<!-- okt:fin -->\n`);
  e('99-Sistema/plantillas/Diario.md', `${fm({ tipo: 'diario', creado: '{{date:YYYY-MM-DD}}' })}\n# {{date:YYYY-MM-DD}}\n`);
  return { ...t, vault, configDir, okt: (args, o = {}) => okt(args, { cwd: vault, configDir, ...o }) };
}

test('migrar: vista previa sin cambios; con --aplicar mueve, renombra y actualiza enlaces y registros', () => {
  const v = vaultAntiguo();
  // Mientras no se migre, lo que escribe se detiene y estado avisa.
  let r = v.okt(['nota', 'nueva', 'nota', 'x']);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /okt migrar/);
  assert.match(v.okt(['estado']).salida, /AVISO: .*okt migrar/);

  r = v.okt(['migrar']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Anemia → 💡 Anemia/);
  assert.match(r.salida, /Guía MINSA → 🔬 Guía MINSA/, 'una ficha con ## Método es un artículo');
  assert.ok(existsSync(join(v.vault, '30-Conocimiento/conceptos/Anemia.md')), 'la vista previa no mueve nada');

  r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  const anemia = leer(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/💡 Anemia.md');
  assert.match(anemia, /area: "\[\[🧭 Medicina\]\]"/);
  assert.match(anemia, / {2}- "\[\[🔬 Guía MINSA\]\]"/);
  assert.match(anemia, /\[\[🔬 Guía MINSA#Tabla 2\|la tabla\]\] y \[\[🎯 Tesis\]\]/);
  assert.match(anemia, /^# 💡 Anemia$/m);
  assert.match(anemia, /aliases:\n {2}- Anemia/);
  assert.ok(existsSync(join(v.vault, '10 │ 🎯 Proyectos/🎯 Tesis/🎯 Tesis.md')), 'la carpeta del proyecto cambia con su nota');
  assert.ok(existsSync(join(v.vault, '10 │ 🎯 Proyectos/🎯 Tesis/Borrador.md')));
  assert.ok(existsSync(join(v.vault, '40 │ 📚 Fuentes/📎 adjuntos/📕 pdf/Guía.pdf')));
  assert.ok(existsSync(join(v.vault, '00 │ 📥 Bandeja/📦 importados/🗒️ Apuntes.md')));
  assert.ok(existsSync(join(v.vault, '00 │ 📥 Bandeja/📲 telegram/📲 2026-10-21 1805 idea.md')));
  assert.ok(existsSync(join(v.vault, '50 │ 📅 Diario/📅 2026-10-22.md')));
  assert.match(leer(v.vault, '99 │ ⚙️ Sistema/🔥 hot.md'), /^# 🔥 Contexto reciente$/m);
  assert.match(leer(v.vault, '99 │ ⚙️ Sistema/📜 bitacora.md'), /\[\[💡 Anemia\]\]/);
  assert.match(leer(v.vault, '99 │ ⚙️ Sistema/🧱 plantillas/📅 Diario.md'), /^# 📅 \{\{date:YYYY-MM-DD\}\}$/m);
  // Nada viejo queda; nada se borró.
  for (const viejo of ['00-Bandeja', '10-Proyectos', '20-Areas', '30-Conocimiento', '40-Fuentes', '50-Diario', '99-Sistema']) assert.ok(!existsSync(join(v.vault, viejo)), viejo);

  const cfg = JSON.parse(leer(v.vault, '.cerebro/config.json'));
  assert.equal(cfg.version, 2);
  assert.deepEqual(cfg.areas, ['🧭 Medicina']);
  assert.deepEqual(Object.keys(cfg.cuadernos), ['10 │ 🎯 Proyectos/🎯 Tesis']);
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/importaciones.json'))['notion:p1'].ruta, '00 │ 📥 Bandeja/📦 importados/🗒️ Apuntes.md');
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/fuentes.json')).abc, '40 │ 📚 Fuentes/📎 adjuntos/📕 pdf/Guía.pdf');
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/telegram.json')).escritos.t1.ruta, '00 │ 📥 Bandeja/📲 telegram/📲 2026-10-21 1805 idea.md');
  assert.equal(JSON.parse(leer(v.vault, '.obsidian/app.json')).newFileFolderPath, '00 │ 📥 Bandeja/📝 notas');
  assert.deepEqual(JSON.parse(leer(v.vault, '.obsidian/daily-notes.json')), { folder: '50 │ 📅 Diario', format: '[📅] YYYY-MM-DD', template: '99 │ ⚙️ Sistema/🧱 plantillas/📅 Diario' });
  assert.match(leer(v.vault, '.gitignore'), /^\.tmp\.drivedownload\/$/m);
  const agents = leer(v.vault, 'AGENTS.md');
  assert.match(agents, /^Mío arriba\./);
  assert.match(agents, /\[\[🧭 Medicina\]\]/);
  assert.ok(!existsSync(join(v.vault, '.cerebro/migracion.json')));

  // Ya migrado: no hay nada que hacer, y lo que escribe vuelve a funcionar.
  assert.match(v.okt(['migrar', '--aplicar']).salida, /no hay nada que migrar/);
  assert.equal(v.okt(['nota', 'nueva', 'nota', 'después']).codigo, 0);
  const lint = JSON.parse(v.okt(['lint', '--json']).salida);
  assert.equal(lint.hallazgos.filter((h) => h.regla === 'enlace_roto').length, 0, JSON.stringify(lint.hallazgos));
  v.borrar();
});

test('migrar: si dos nombres chocarían, no toca nada', () => {
  const v = vaultAntiguo();
  escribir(v.vault, '30-Conocimiento/conceptos/💡 Anemia.md', `${fm({ tipo: 'concepto', creado: '2026-10-01' })}\n# 💡 Anemia\n`);
  const r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 3);
  assert.match(r.error, /chocarían/);
  assert.ok(existsSync(join(v.vault, '30-Conocimiento/conceptos/Anemia.md')));
  assert.ok(!existsSync(join(v.vault, '30 │ 🧠 Conocimiento')));
  v.borrar();
});

test('renombrar cambia el emoji, actualiza enlaces, título y alias, y mueve la carpeta del proyecto', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'concepto', 'Anemia']);
  v.okt(['nota', 'nueva', 'proyecto', 'Tesis']);
  escribir(v.vault, '00 │ 📥 Bandeja/📝 notas/📝 idea.md', 'Ver [[💡 Anemia]] y [[🎯 Tesis#Objetivo]].\n');
  let r = v.okt(['renombrar', 'Anemia', '🩸 Anemia']);
  assert.equal(r.codigo, 0, r.error);
  const nota = leer(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/🩸 Anemia.md');
  assert.match(nota, /^# 🩸 Anemia$/m);
  assert.match(nota, /aliases:\n {2}- Anemia\n/);
  r = v.okt(['renombrar', '🎯 Tesis', '🎓 Tesis']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '10 │ 🎯 Proyectos/🎓 Tesis/🎓 Tesis.md')));
  assert.equal(leer(v.vault, '00 │ 📥 Bandeja/📝 notas/📝 idea.md'), 'Ver [[🩸 Anemia]] y [[🎓 Tesis#Objetivo]].\n');
  // No pisa otra nota ni toca el sistema.
  v.okt(['nota', 'nueva', 'concepto', 'Hierro']);
  assert.equal(v.okt(['renombrar', 'Hierro', '🧲 Anemia']).codigo, 3);
  assert.notEqual(v.okt(['renombrar', '🔥 hot', '🔥 caliente']).codigo, 0);
  v.borrar();
});

test('lint: sugiere el nombre con emoji para un enlace que lo omite y avisa de notas sin emoji', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'concepto', '🩸 Anemia', '--resumen', 'Hb baja.']);
  escribir(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/Hierro.md', `${fm({ tipo: 'concepto', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'Mineral.' })}\nVer [[Anemia]].\n`);
  const { hallazgos } = JSON.parse(v.okt(['lint', '--json']).salida);
  assert.ok(hallazgos.some((h) => h.regla === 'enlace_roto' && /¿quisiste decir \[\[🩸 Anemia\]\]\?/.test(h.detalle)));
  assert.ok(hallazgos.some((h) => h.regla === 'sin_emoji' && h.archivo.endsWith('/Hierro.md')));
  v.borrar();
});

test('notebooklm: el CSV respeta comas, saltos de línea y comillas dentro de una celda', () => {
  assert.deepEqual(leerCsv('Fármaco,Dosis\r\n"Hierro, sulfato","3 mg/kg\npor día"\n"Dice ""ok""",x\n'), [
    ['Fármaco', 'Dosis'],
    ['Hierro, sulfato', '3 mg/kg\npor día'],
    ['Dice "ok"', 'x'],
  ]);
});

test('git: los nombres con tildes o emojis no salen escapados en las fichas', () => {
  const t = temporal();
  const dir = join(t.dir, 'repo');
  mkdirSync(dir);
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Prueba');
  git('config', 'user.email', 'prueba@localhost');
  escribir(dir, 'a.md', 'uno');
  git('add', '-A');
  git('commit', '-q', '-m', 'inicio');
  // « M a.md» va primero: antes se perdía el espacio inicial y el nombre salía como «.md».
  escribir(dir, 'a.md', 'dos');
  escribir(dir, '🩺 Guía de anemia.md', 'x');
  const c = cambiosDesde(dir, new Date(Date.now() - 60000).toISOString());
  assert.deepEqual(c.cambiados.sort(), ['a.md', '🩺 Guía de anemia.md']);
  t.borrar();
});

test('la bitácora se puede escribir aunque el archivo esté oculto (Windows)', { skip: process.platform !== 'win32' }, () => {
  const v = vaultNuevo();
  const ruta = join(v.vault, '99 │ ⚙️ Sistema', '📜 bitacora.md');
  assert.equal(spawnSync('attrib', ['+H', ruta]).status, 0);
  const r = v.okt(['bitacora', 'capturar', 'con el archivo oculto']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(readFileSync(ruta, 'utf8'), /con el archivo oculto/);
  assert.ok(readdirSync(join(v.vault, '99 │ ⚙️ Sistema')).includes('📜 bitacora.md'));
  v.borrar();
});
