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
  assert.equal(traducir('99-Sistema/hot.md'), '05 │ ⚙️ Sistema/🔥 hot.md');
  assert.equal(traducir('90-Archivo/10-Proyectos/Curso'), '04 │ 🗄️ Archivo/01 │ 🎯 Proyectos/Curso');
  assert.equal(traducir('40-Fuentes/adjuntos/pdf/a.pdf'), '40 │ 📚 Fuentes/📎 adjuntos/📕 pdf/a.pdf');
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'proyecto', '🐍 Curso de Python']);
  for (const pedido of ['proyectos/Curso de Python', '10-Proyectos/Curso de Python', '01 │ 🎯 Proyectos/🐍 Curso de Python', '10 │ 🎯 Proyectos/🐍 Curso de Python']) {
    assert.equal(resolverCarpeta(v.vault, pedido), '01 │ 🎯 Proyectos/🐍 Curso de Python', pedido);
  }
  assert.equal(resolverCarpeta(v.vault, 'importados'), '00 │ 📥 Bandeja', 'las subcarpetas de la bandeja de la 0.3 ya no existen');
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  assert.equal(resolverCarpeta(v.vault, 'Medicina/Cardiología'), '02 │ 🧭 Areas/🧭 Medicina/🫀 Cardiología');
  assert.equal(resolverCarpeta(v.vault, 'Curso de Python'), '01 │ 🎯 Proyectos/🐍 Curso de Python');
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

test('migrar desde la 0.2: vista previa sin cambios; con --aplicar llega a la 0.4 con enlaces y registros al día', () => {
  const v = vaultAntiguo();
  // Mientras no se migre, lo que escribe se detiene y estado avisa.
  let r = v.okt(['nota', 'nueva', 'nota', 'x']);
  assert.equal(r.codigo, 2);
  assert.match(r.error, /okt migrar/);
  assert.match(v.okt(['estado']).salida, /AVISO: .*okt migrar/);

  r = v.okt(['migrar']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Paso 1 de 2/);
  assert.match(r.salida, /Anemia → 💡 Anemia/);
  assert.match(r.salida, /Guía MINSA → 🔬 Guía MINSA/, 'una ficha con ## Método es un artículo');
  assert.ok(existsSync(join(v.vault, '30-Conocimiento/conceptos/Anemia.md')), 'la vista previa no mueve nada');

  r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  // Anemia decía su área: queda dentro de la carpeta del área, como nota.
  const medicina = '02 │ 🧭 Areas/🧭 Medicina';
  const anemia = leer(v.vault, `${medicina}/💡 Anemia.md`);
  assert.match(anemia, /^---\ntipo: nota\n/);
  assert.match(anemia, / {2}- "\[\[🔬 Guía MINSA\]\]"/);
  assert.match(anemia, /\[\[🔬 Guía MINSA#Tabla 2\|la tabla\]\] y \[\[🎯 Tesis\]\]/);
  assert.match(anemia, /^# 💡 Anemia$/m);
  assert.match(anemia, /aliases:\n {2}- Anemia/);
  // El área pasa a ser carpeta con su nota principal, sin las secciones vacías de la 0.3.
  const area = leer(v.vault, `${medicina}/🧭 Medicina.md`);
  assert.match(area, /## De qué trata/);
  assert.match(area, /\[\[💡 Anemia\]\]/, 'el índice automático ya enlaza sus notas');
  // La guía no decía área ni proyecto: va a la Bandeja y queda un pendiente para ubicarla.
  assert.ok(existsSync(join(v.vault, '00 │ 📥 Bandeja/🔬 Guía MINSA.md')));
  assert.match(leer(v.vault, '05 │ ⚙️ Sistema/✅ pendientes.md'), /## Para ti\n\n- \[ \] .*ubicar 1 notas/);
  assert.ok(existsSync(join(v.vault, '01 │ 🎯 Proyectos/🎯 Tesis/🎯 Tesis.md')), 'la carpeta del proyecto cambia con su nota');
  assert.ok(existsSync(join(v.vault, '01 │ 🎯 Proyectos/🎯 Tesis/Borrador.md')));
  assert.ok(existsSync(join(v.vault, '05 │ ⚙️ Sistema/📎 adjuntos/📕 pdf/Guía.pdf')));
  // La bandeja se aplana y lo que había es captura.
  assert.match(leer(v.vault, '00 │ 📥 Bandeja/🗒️ Apuntes.md'), /tipo: captura[\s\S]*origen: notion/);
  assert.ok(existsSync(join(v.vault, '00 │ 📥 Bandeja/📲 2026-10-21 1805 idea.md')));
  assert.ok(existsSync(join(v.vault, '03 │ 📅 Diario/📅 2026-10-22.md')));
  assert.match(leer(v.vault, '05 │ ⚙️ Sistema/🔥 hot.md'), /^# 🔥 Contexto reciente$/m);
  assert.match(leer(v.vault, '05 │ ⚙️ Sistema/📜 bitacora.md'), /\[\[💡 Anemia\]\]/);
  assert.match(leer(v.vault, '05 │ ⚙️ Sistema/🧱 plantillas/📅 Diario.md'), /^# 📅 \{\{date:YYYY-MM-DD\}\}$/m);
  // Nada viejo queda; nada se borró.
  for (const viejo of ['00-Bandeja', '10-Proyectos', '20-Areas', '30-Conocimiento', '40-Fuentes', '50-Diario', '99-Sistema', '30 │ 🧠 Conocimiento', '40 │ 📚 Fuentes', '00 │ 📥 Bandeja/📦 importados']) assert.ok(!existsSync(join(v.vault, viejo)), viejo);

  const cfg = JSON.parse(leer(v.vault, '.cerebro/config.json'));
  assert.equal(cfg.version, 4);
  assert.deepEqual(cfg.areas, ['🧭 Medicina']);
  assert.deepEqual(Object.keys(cfg.cuadernos), ['01 │ 🎯 Proyectos/🎯 Tesis']);
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/importaciones.json'))['notion:p1'].ruta, '00 │ 📥 Bandeja/🗒️ Apuntes.md');
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/fuentes.json')).abc, '05 │ ⚙️ Sistema/📎 adjuntos/📕 pdf/Guía.pdf');
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/telegram.json')).escritos.t1.ruta, '00 │ 📥 Bandeja/📲 2026-10-21 1805 idea.md');
  const app = JSON.parse(leer(v.vault, '.obsidian/app.json'));
  assert.equal(app.newFileFolderPath, '00 │ 📥 Bandeja');
  assert.equal(app.attachmentFolderPath, '05 │ ⚙️ Sistema/📎 adjuntos');
  assert.deepEqual(JSON.parse(leer(v.vault, '.obsidian/daily-notes.json')), { folder: '03 │ 📅 Diario', format: '[📅] YYYY-MM-DD', template: '05 │ ⚙️ Sistema/🧱 plantillas/📅 Diario' });
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

// Un vault como lo dejaba OKT 0.3.x (como el de Mack el 2026-10-23: áreas como notas sueltas, bandeja con subcarpetas).
function vault03() {
  const t = temporal();
  const vault = join(t.dir, 'cerebro');
  const configDir = join(t.dir, 'config');
  const e = (rel, texto) => escribir(vault, rel, texto);
  e('.cerebro/config.json', JSON.stringify({ version: 2, areas: ['🩺 Medicina', '🌱 Personal'], formato_diario: 'DD/MM/YY' }));
  e('.obsidian/app.json', JSON.stringify({ attachmentFolderPath: '40 │ 📚 Fuentes/📎 adjuntos', newFileFolderPath: '00 │ 📥 Bandeja/📝 notas' }));
  e('AGENTS.md', '<!-- okt:inicio -->\nviejo\n<!-- okt:fin -->\n');
  e('20 │ 🧭 Areas/🩺 Medicina.md', `${fm({ tipo: 'area', creado: '2026-10-22', actualizado: '2026-10-22', resumen: 'Área.' })}\n# 🩺 Medicina\n\n## Proyectos\n\n## Conocimiento\n\n## Notas\n`);
  e('20 │ 🧭 Areas/🌱 Personal.md', `${fm({ tipo: 'area', creado: '2026-10-22', actualizado: '2026-10-22', resumen: 'Área.' })}\n# 🌱 Personal\n\n## Proyectos\n\n## Conocimiento\n\n## Notas\n\nMis cosas.\n`);
  e('30 │ 🧠 Conocimiento/🧩 sintesis/🩸 Anemia.md', `${fm({ tipo: 'sintesis', creado: '2026-10-22', actualizado: '2026-10-22', estado: 'borrador', resumen: 'r', area: '"[[🩺 Medicina]]"' })}\n# 🩸 Anemia\n\nVer [[📝 idea]].\n`);
  e('00 │ 📥 Bandeja/📝 notas/📝 idea.md', `${fm({ tipo: 'nota', creado: '2026-10-22' })}\n# 📝 idea\n`);
  e('00 │ 📥 Bandeja/💻 sesiones/💻 2026-10-22 1030 app.md', `${fm({ tipo: 'sesion', creado: '2026-10-22', agente: 'claude' })}\n# Sesión\n`);
  e('50 │ 📅 Diario/📅 22∕10∕26.md', `${fm({ tipo: 'diario', creado: '2026-10-22' })}\n# 📅 22∕10∕26\n`);
  e('99 │ ⚙️ Sistema/🧱 plantillas/💡 Concepto.md', '---\ntipo: concepto\n---\n');
  return { ...t, vault, configDir, okt: (args, o = {}) => okt(args, { cwd: vault, configDir, ...o }) };
}

test('migrar desde la 0.3: áreas como carpetas, conocimiento a su área, bandeja plana y tipos nuevos', () => {
  const v = vault03();
  let r = v.okt(['migrar']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Áreas que pasan a ser carpetas \(2\)/);
  assert.match(r.salida, /20 │ 🧭 Areas → 02 │ 🧭 Areas/, 'primero las raíces nuevas');
  assert.ok(existsSync(join(v.vault, '20 │ 🧭 Areas/🩺 Medicina.md')), 'la vista previa no mueve nada');
  r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  const personal = leer(v.vault, '02 │ 🧭 Areas/🌱 Personal/🌱 Personal.md');
  assert.match(personal, /## De qué trata/);
  assert.match(personal, /## Notas\n\nMis cosas\./, 'lo que el usuario escribió se conserva');
  assert.doesNotMatch(personal, /## Conocimiento/);
  assert.match(leer(v.vault, '02 │ 🧭 Areas/🩺 Medicina/🩸 Anemia.md'), /^---\ntipo: nota\n/);
  assert.match(leer(v.vault, '00 │ 📥 Bandeja/📝 idea.md'), /tipo: captura[\s\S]*origen: nota/);
  assert.match(leer(v.vault, '00 │ 📥 Bandeja/💻 2026-10-22 1030 app.md'), /tipo: captura[\s\S]*origen: sesion/);
  assert.ok(existsSync(join(v.vault, '05 │ ⚙️ Sistema/🧱 plantillas/💡 Nota.md')));
  assert.ok(existsSync(join(v.vault, '04 │ 🗄️ Archivo/💤 Inactivos/⚙️ Sistema/🧱 plantillas/💡 Concepto.md')), 'la plantilla vieja se archiva, no se borra');
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/config.json')).version, 4);
  assert.equal(JSON.parse(leer(v.vault, '.obsidian/app.json')).attachmentFolderPath, '05 │ ⚙️ Sistema/📎 adjuntos');
  assert.equal(JSON.parse(leer(v.vault, '.cerebro/config.json')).formato_diario, 'DD/MM/YY');
  assert.ok(existsSync(join(v.vault, '03 │ 📅 Diario/📅 22∕10∕26.md')));
  for (const viejo of ['30 │ 🧠 Conocimiento', '00 │ 📥 Bandeja/📝 notas', '00 │ 📥 Bandeja/💻 sesiones', '20 │ 🧭 Areas', '50 │ 📅 Diario', '99 │ ⚙️ Sistema']) assert.ok(!existsSync(join(v.vault, viejo)), viejo);
  const lint = JSON.parse(v.okt(['lint', '--json']).salida);
  assert.equal(lint.errores, 0, JSON.stringify(lint.hallazgos));
  v.borrar();
});

test('migrar desde la 0.3: si una nota choca con la del área, cambia de nombre sin desviar los enlaces del área', () => {
  const v = vault03();
  escribir(v.vault, '30 │ 🧠 Conocimiento/💡 conceptos/🩺 Medicina.md', `${fm({ tipo: 'concepto', creado: '2026-10-22', actualizado: '2026-10-22', estado: 'borrador', resumen: 'r', area: '"[[🩺 Medicina]]"' })}\n# 🩺 Medicina\n`);
  escribir(v.vault, '50 │ 📅 Diario/📅 23∕10∕26.md', `${fm({ tipo: 'diario', creado: '2026-10-23' })}\nHoy estudié [[🩺 Medicina]].\n`);
  let r = v.okt(['migrar']);
  assert.match(r.salida, /cambian de nombre para no pisar otro/);
  r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '02 │ 🧭 Areas/🩺 Medicina/🩺 Medicina 2.md')));
  assert.match(leer(v.vault, '03 │ 📅 Diario/📅 23∕10∕26.md'), /\[\[🩺 Medicina\]\]/, 'el enlace sigue apuntando al área');
  assert.deepEqual(JSON.parse(leer(v.vault, '.cerebro/config.json')).areas, ['🩺 Medicina', '🌱 Personal']);
  v.borrar();
});

// Un vault como lo dejaba OKT 0.4 a 0.6 (como el de Mack el 2026-10-25), con lo archivado con su ruta completa.
function vault06() {
  const t = temporal();
  const vault = join(t.dir, 'cerebro');
  const configDir = join(t.dir, 'config');
  const e = (rel, texto) => escribir(vault, rel, texto);
  e('.cerebro/config.json', JSON.stringify({ version: 3, areas: ['🩺 Medicina'], cuadernos: { '10 │ 🎯 Proyectos/🎓 Tesis': { id: 'n1' } } }));
  e('.cerebro/importaciones.json', JSON.stringify({ 'notion:p1': { ruta: '20 │ 🧭 Areas/🩺 Medicina/🗒️ Apuntes.md' }, 'agente:x': { ruta: '90 │ 🗄️ Archivo/00 │ 📥 Bandeja/🛠️ Carpeta nueva - app.md' } }));
  e('.cerebro/agentes.json', JSON.stringify({ carpetas: { x: { ruta: 'C:/app', estado: 'vinculada', destino: '20 │ 🧭 Areas/🩺 Medicina', captura: '90 │ 🗄️ Archivo/00 │ 📥 Bandeja/🛠️ Carpeta nueva - app.md' } } }));
  e('.obsidian/app.json', JSON.stringify({ attachmentFolderPath: '99 │ ⚙️ Sistema/📎 adjuntos', newFileFolderPath: '00 │ 📥 Bandeja' }));
  e('.obsidian/daily-notes.json', JSON.stringify({ folder: '50 │ 📅 Diario', format: '[📅] DD∕MM∕YY', template: '99 │ ⚙️ Sistema/🧱 plantillas/📅 Diario' }));
  e('.obsidian/bookmarks.json', JSON.stringify({ items: [{ type: 'file', path: '20 │ 🧭 Areas/🩺 Medicina/🩺 Medicina.md' }] }));
  e('AGENTS.md', 'Ver 20 │ 🧭 Areas.\n\n<!-- okt:inicio -->\nviejo\n<!-- okt:fin -->\n');
  e('20 │ 🧭 Areas/🩺 Medicina/🩺 Medicina.md', `${fm({ tipo: 'area', creado: '2026-10-22' })}\n# 🩺 Medicina\n`);
  e('20 │ 🧭 Areas/🩺 Medicina/🗒️ Apuntes.md', `${fm({ tipo: 'nota', creado: '2026-10-22' })}\n# 🗒️ Apuntes\n`);
  e('10 │ 🎯 Proyectos/🎓 Tesis/🎓 Tesis.md', `${fm({ tipo: 'proyecto', creado: '2026-10-22' })}\n# 🎓 Tesis\n\nSobre [[🗒️ Apuntes]].\n`);
  e('50 │ 📅 Diario/📅 25∕10∕26.md', `${fm({ tipo: 'diario', creado: '2026-10-25' })}\n# 📅 25∕10∕26\n`);
  e('90 │ 🗄️ Archivo/00 │ 📥 Bandeja/🛠️ Carpeta nueva - app.md', `${fm({ tipo: 'captura', creado: '2026-10-24' })}\n# x\n`);
  e('90 │ 🗄️ Archivo/00 │ 📥 Bandeja/📝 repetida.md', `${fm({ tipo: 'captura', creado: '2026-10-24' })}\n# vieja\n`);
  e('90 │ 🗄️ Archivo/🗑️ Descartes/📝 repetida.md', `${fm({ tipo: 'captura', creado: '2026-10-25' })}\n# ya estaba\n`);
  e('90 │ 🗄️ Archivo/10 │ 🎯 Proyectos/🎯 Viejo/🎯 Viejo.md', `${fm({ tipo: 'proyecto', creado: '2026-10-01', estado: 'archivado' })}\n# 🎯 Viejo\n`);
  e('90 │ 🗄️ Archivo/20 │ 🧭 Areas/🩺 Medicina/🫀 Cardiología/🫀 Cardiología.md', `${fm({ tipo: 'tema', creado: '2026-10-01' })}\n# 🫀 Cardiología\n`);
  e('90 │ 🗄️ Archivo/📥 Bruto/2026-10/📥 original.md', `${fm({ tipo: 'bruto', creado: '2026-10-01' })}\n# original\n`);
  e('99 │ ⚙️ Sistema/🔥 hot.md', `${fm({ tipo: 'sistema', creado: '2026-10-01' })}\n# 🔥 Contexto reciente\n\n<!-- okt:inicio -->\n- En foco: 10 │ 🎯 Proyectos/🎓 Tesis\n<!-- okt:fin -->\n`);
  e('99 │ ⚙️ Sistema/🧱 plantillas/📅 Diario.md', `${fm({ tipo: 'diario', creado: '{{date:YYYY-MM-DD}}' })}\n# 📅 {{date:YYYY-MM-DD}}\n`);
  return { ...t, vault, configDir, okt: (args, o = {}) => okt(args, { cwd: vault, configDir, ...o }) };
}

test('migrar desde la 0.6: raíces 00 a 05, lo archivado por motivo y las rutas de registros, Obsidian y notas', () => {
  const v = vault06();
  let r = v.okt(['migrar']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /90 │ 🗄️ Archivo → 04 │ 🗄️ Archivo/);
  assert.match(r.salida, /Archivados con su ruta completa .*: 4\./);
  assert.ok(existsSync(join(v.vault, '20 │ 🧭 Areas')), 'la vista previa no mueve nada');
  r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  for (const viejo of ['10 │ 🎯 Proyectos', '20 │ 🧭 Areas', '50 │ 📅 Diario', '90 │ 🗄️ Archivo', '99 │ ⚙️ Sistema', '04 │ 🗄️ Archivo/00 │ 📥 Bandeja', '04 │ 🗄️ Archivo/10 │ 🎯 Proyectos']) assert.ok(!existsSync(join(v.vault, viejo)), viejo);
  const a = '04 │ 🗄️ Archivo';
  for (const nuevo of [
    '01 │ 🎯 Proyectos/🎓 Tesis/🎓 Tesis.md',
    '02 │ 🧭 Areas/🩺 Medicina/🗒️ Apuntes.md',
    '03 │ 📅 Diario/📅 25∕10∕26.md',
    `${a}/🗑️ Descartes/🛠️ Carpeta nueva - app.md`,
    `${a}/🗑️ Descartes/📝 repetida 2.md`,
    `${a}/✅ Terminados/🎯 Viejo/🎯 Viejo.md`,
    `${a}/💤 Inactivos/🩺 Medicina/🫀 Cardiología/🫀 Cardiología.md`,
    `${a}/📥 Bruto/2026-10/📥 original.md`,
  ]) assert.ok(existsSync(join(v.vault, nuevo)), nuevo);
  assert.match(leer(v.vault, `${a}/🗑️ Descartes/📝 repetida.md`), /ya estaba/, 'no pisa lo que ya estaba en Descartes');
  const cfg = JSON.parse(leer(v.vault, '.cerebro/config.json'));
  assert.equal(cfg.version, 4);
  assert.deepEqual(Object.keys(cfg.cuadernos), ['01 │ 🎯 Proyectos/🎓 Tesis']);
  const imp = JSON.parse(leer(v.vault, '.cerebro/importaciones.json'));
  assert.equal(imp['notion:p1'].ruta, '02 │ 🧭 Areas/🩺 Medicina/🗒️ Apuntes.md');
  assert.equal(imp['agente:x'].ruta, `${a}/🗑️ Descartes/🛠️ Carpeta nueva - app.md`);
  const ag = JSON.parse(leer(v.vault, '.cerebro/agentes.json')).carpetas.x;
  assert.equal(ag.destino, '02 │ 🧭 Areas/🩺 Medicina');
  assert.equal(ag.captura, `${a}/🗑️ Descartes/🛠️ Carpeta nueva - app.md`);
  assert.equal(JSON.parse(leer(v.vault, '.obsidian/app.json')).attachmentFolderPath, '05 │ ⚙️ Sistema/📎 adjuntos');
  assert.deepEqual(JSON.parse(leer(v.vault, '.obsidian/daily-notes.json')), { folder: '03 │ 📅 Diario', format: '[📅] DD∕MM∕YY', template: '05 │ ⚙️ Sistema/🧱 plantillas/📅 Diario' });
  assert.equal(JSON.parse(leer(v.vault, '.obsidian/bookmarks.json')).items[0].path, '02 │ 🧭 Areas/🩺 Medicina/🩺 Medicina.md');
  assert.match(leer(v.vault, 'AGENTS.md'), /^Ver 02 │ 🧭 Areas\./);
  assert.doesNotMatch(leer(v.vault, 'AGENTS.md'), /viejo/, 'el bloque de AGENTS.md se regenera');
  assert.ok(!existsSync(join(v.vault, '.cerebro/migracion.json')));
  assert.equal(v.okt(['nota', 'nueva', 'nota', 'después']).codigo, 0, 'lo que escribe vuelve a funcionar');
  const lint = JSON.parse(v.okt(['lint', '--json']).salida);
  assert.equal(lint.hallazgos.filter((h) => h.regla === 'enlace_roto').length, 0, JSON.stringify(lint.hallazgos));
  v.borrar();
});

test('migrar desde la 0.6: si Obsidian ya creó una raíz nueva, junta las dos sin perder nada', () => {
  const v = vault06();
  escribir(v.vault, '03 │ 📅 Diario/📅 26∕10∕26.md', `${fm({ tipo: 'diario', creado: '2026-10-26' })}\n# 📅 26∕10∕26\n`);
  const r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  for (const n of ['📅 25∕10∕26.md', '📅 26∕10∕26.md']) assert.ok(existsSync(join(v.vault, '03 │ 📅 Diario', n)), n);
  assert.ok(!existsSync(join(v.vault, '50 │ 📅 Diario')));
  v.borrar();
});

test('migrar desde la 0.6: si el Archivo nuevo ya existe, lo archivado no pisa lo que ya estaba ahí', () => {
  const v = vault06();
  escribir(v.vault, '04 │ 🗄️ Archivo/🗑️ Descartes/🛠️ Carpeta nueva - app.md', 'ya estaba en el Archivo nuevo');
  const r = v.okt(['migrar', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  const d = join(v.vault, '04 │ 🗄️ Archivo/🗑️ Descartes');
  assert.equal(readFileSync(join(d, '🛠️ Carpeta nueva - app.md'), 'utf8'), 'ya estaba en el Archivo nuevo');
  assert.match(readFileSync(join(d, '🛠️ Carpeta nueva - app 2.md'), 'utf8'), /# x/);
  assert.ok(!existsSync(join(v.vault, '90 │ 🗄️ Archivo')));
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

test('renombrar cambia el emoji, actualiza enlaces, título y alias, y mueve la carpeta del proyecto o del área', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'nota', 'Anemia', '--carpeta', 'Medicina']);
  v.okt(['nota', 'nueva', 'proyecto', 'Tesis']);
  escribir(v.vault, '00 │ 📥 Bandeja/📝 idea.md', 'Ver [[💡 Anemia]] y [[🎯 Tesis#Objetivo]].\n');
  let r = v.okt(['renombrar', 'Anemia', '🩸 Anemia']);
  assert.equal(r.codigo, 0, r.error);
  const nota = leer(v.vault, '02 │ 🧭 Areas/🧭 Medicina/🩸 Anemia.md');
  assert.match(nota, /^# 🩸 Anemia$/m);
  assert.match(nota, /aliases:\n {2}- Anemia\n/);
  r = v.okt(['renombrar', '🎯 Tesis', '🎓 Tesis']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '01 │ 🎯 Proyectos/🎓 Tesis/🎓 Tesis.md')));
  assert.equal(leer(v.vault, '00 │ 📥 Bandeja/📝 idea.md'), 'Ver [[🩸 Anemia]] y [[🎓 Tesis#Objetivo]].\n');
  // El área se renombra con su carpeta, lo que contiene y la configuración.
  r = v.okt(['renombrar', '🧭 Medicina', '🩺 Medicina']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '02 │ 🧭 Areas/🩺 Medicina/🩸 Anemia.md')));
  assert.ok(JSON.parse(leer(v.vault, '.cerebro/config.json')).areas.includes('🩺 Medicina'));
  // No pisa otra nota ni toca el sistema.
  v.okt(['nota', 'nueva', 'nota', 'Hierro', '--carpeta', 'Medicina']);
  assert.equal(v.okt(['renombrar', 'Hierro', '🧲 Anemia']).codigo, 3);
  assert.notEqual(v.okt(['renombrar', '🔥 hot', '🔥 caliente']).codigo, 0);
  v.borrar();
});

test('lint: sugiere el nombre con emoji para un enlace que lo omite y avisa de notas sin emoji', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'nota', '🩸 Anemia', '--resumen', 'Hb baja.', '--carpeta', 'Medicina']);
  escribir(v.vault, '02 │ 🧭 Areas/🧭 Medicina/Hierro.md', `${fm({ tipo: 'nota', creado: '2026-10-01', actualizado: '2026-10-01', estado: 'borrador', resumen: 'Mineral.' })}\nVer [[Anemia]].\n`);
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

test('la bitácora se puede escribir aunque el archivo esté oculto (Windows)', { skip: process.platform !== 'win32' }, () => {
  const v = vaultNuevo();
  const ruta = join(v.vault, '05 │ ⚙️ Sistema', '📜 bitacora.md');
  assert.equal(spawnSync('attrib', ['+H', ruta]).status, 0);
  const r = v.okt(['bitacora', 'capturar', 'con el archivo oculto']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(readFileSync(ruta, 'utf8'), /con el archivo oculto/);
  assert.ok(readdirSync(join(v.vault, '05 │ ⚙️ Sistema')).includes('📜 bitacora.md'));
  v.borrar();
});
