import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { temporal, okt, vaultNuevo, escribir, CLI } from './ayuda.mjs';

test('init sin --aplicar solo muestra la vista previa', () => {
  const t = temporal();
  const configDir = join(t.dir, 'config');
  const r = okt(['init'], { cwd: t.dir, configDir });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Vista previa/);
  assert.match(r.salida, /00 │ 📥 Bandeja/);
  assert.equal(existsSync(join(t.dir, '00 │ 📥 Bandeja')), false);
  t.borrar();
});

test('init --aplicar crea carpetas, sistema, AGENTS.md y configuración', () => {
  const v = vaultNuevo({ areas: 'Medicina,Cursos' });
  for (const c of ['00 │ 📥 Bandeja', '10 │ 🎯 Proyectos', '20 │ 🧭 Areas', '50 │ 📅 Diario', '90 │ 🗄️ Archivo', '99 │ ⚙️ Sistema/📎 adjuntos', '99 │ ⚙️ Sistema/🧱 plantillas']) {
    assert.ok(existsSync(join(v.vault, c)), `falta ${c}`);
  }
  // Sin las carpetas de la 0.3: el conocimiento vive en las áreas y los proyectos.
  for (const c of ['30 │ 🧠 Conocimiento', '40 │ 📚 Fuentes', '00 │ 📥 Bandeja/📝 notas']) assert.ok(!existsSync(join(v.vault, c)), `sobra ${c}`);
  const agents = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\[\[🧭 Medicina\]\], \[\[🧭 Cursos\]\]/);
  assert.doesNotMatch(agents, /pacientes/i);
  assert.ok(agents.includes(CLI.replace(/\\/g, '/')), 'AGENTS.md debe traer la ruta del CLI');
  assert.equal(readFileSync(join(v.vault, 'CLAUDE.md'), 'utf8').trim(), '@AGENTS.md');
  assert.ok(existsSync(join(v.vault, '.gitignore')));
  // Cada área es una carpeta con su nota principal.
  assert.match(readFileSync(join(v.vault, '20 │ 🧭 Areas', '🧭 Medicina', '🧭 Medicina.md'), 'utf8'), /tipo: area/);
  for (const p of ['💡 Nota', '📂 Tema', '🧭 Area', '🗓️ Semanal']) assert.ok(existsSync(join(v.vault, '99 │ ⚙️ Sistema/🧱 plantillas', `${p}.md`)), p);
  assert.match(readFileSync(join(v.vault, '99 │ ⚙️ Sistema', '🔥 hot.md'), 'utf8'), /Vault recién creado/);
  const cfg = JSON.parse(readFileSync(join(v.vault, '.cerebro', 'config.json'), 'utf8'));
  assert.deepEqual(cfg.areas, ['🧭 Medicina', '🧭 Cursos']);
  assert.equal(cfg.version, 3);
  const global = JSON.parse(readFileSync(join(v.configDir, 'config.json'), 'utf8'));
  assert.equal(global.vault, v.vault.replace(/\\/g, '/'));
  v.borrar();
});

test('init crea lo que sale de la entrevista: áreas, proyectos con su área, temas y perfil; sin --areas, ninguna', () => {
  const t = temporal();
  const configDir = join(t.dir, 'cfg');
  let r = okt(['init', '--aplicar'], { cwd: t.dir, configDir });
  assert.equal(r.codigo, 0, r.error);
  assert.deepEqual(JSON.parse(readFileSync(join(t.dir, '.cerebro', 'config.json'), 'utf8')).areas, [], 'el plugin no inventa áreas');
  assert.match(readFileSync(join(t.dir, 'AGENTS.md'), 'utf8'), /aún ninguna/);

  r = okt(['init', '--aplicar', '--areas', '🎨 Diseño,💰 Finanzas', '--proyectos', '🖌️ Portafolio 2026@Diseño,📈 Plan de ahorro@Finanzas', '--temas', 'Diseño/🔤 Tipografía/🅰️ Serifas', '--perfil', 'Diseñadora gráfica freelance'], { cwd: t.dir, configDir });
  assert.equal(r.codigo, 0, r.error);
  const leer = (rel) => readFileSync(join(t.dir, rel), 'utf8');
  assert.match(leer('20 │ 🧭 Areas/🎨 Diseño/🎨 Diseño.md'), /tipo: area/);
  const portafolio = leer('10 │ 🎯 Proyectos/🖌️ Portafolio 2026/🖌️ Portafolio 2026.md');
  assert.match(portafolio, /tipo: proyecto/);
  assert.match(portafolio, /area: "\[\[🎨 Diseño\]\]"/);
  assert.match(leer('20 │ 🧭 Areas/🎨 Diseño/🔤 Tipografía/🅰️ Serifas/🅰️ Serifas.md'), /tipo: tema/);
  assert.match(leer('20 │ 🧭 Areas/🎨 Diseño/🔤 Tipografía/🔤 Tipografía.md'), /tipo: tema/);
  assert.match(leer('AGENTS.md'), /Diseñadora gráfica freelance/);
  // Un tema que no empieza por un área o un proyecto se rechaza sin crear nada.
  r = okt(['init', '--temas', 'Cocina/Postres'], { cwd: t.dir, configDir });
  assert.equal(r.codigo, 2);
  t.borrar();
});

test('init es reanudable: no pisa lo que ya existe', () => {
  const v = vaultNuevo();
  escribir(v.vault, 'AGENTS.md', 'Mis notas propias\n\n<!-- okt:inicio -->\nviejo\n<!-- okt:fin -->\n');
  escribir(v.vault, '99 │ ⚙️ Sistema/🔥 hot.md', 'hot del usuario');
  const r = v.okt(['init', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  const agents = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^Mis notas propias/);
  assert.match(agents, /## Reglas/);
  assert.equal(readFileSync(join(v.vault, '99 │ ⚙️ Sistema', '🔥 hot.md'), 'utf8'), 'hot del usuario');
  v.borrar();
});

test('init sobre un vault de Obsidian existente: agrega solo los ajustes que faltan y no cuenta desktop.ini', () => {
  const t = temporal();
  escribir(t.dir, '.obsidian/app.json', '{"attachmentFolderPath": "Adjuntos", "vimMode": true}');
  escribir(t.dir, '.obsidian/core-plugins.json', '["file-explorer"]');
  escribir(t.dir, 'desktop.ini', '[.ShellClassInfo]');
  // Obsidian deja .obsidian/app.json con el atributo Oculto en Windows: writeFileSync fallaría con EPERM.
  if (process.platform === 'win32') spawnSync('attrib', ['+H', join(t.dir, '.obsidian', 'app.json')]);
  const configDir = join(t.dir, 'cfg');
  let r = okt(['init'], { cwd: t.dir, configDir });
  assert.doesNotMatch(r.salida, /ya tiene archivos/);
  assert.match(r.salida, /Agregar ajustes que faltan .* \.obsidian\/app\.json/);
  assert.doesNotMatch(r.salida, /core-plugins\.json/);
  r = okt(['init', '--aplicar'], { cwd: t.dir, configDir });
  assert.equal(r.codigo, 0, r.error);
  const app = JSON.parse(readFileSync(join(t.dir, '.obsidian', 'app.json'), 'utf8'));
  assert.equal(app.attachmentFolderPath, 'Adjuntos', 'no cambia lo que el usuario ya eligió');
  assert.equal(app.vimMode, true);
  assert.equal(app.newFileFolderPath, '00 │ 📥 Bandeja', 'agrega lo que faltaba');
  assert.equal(readFileSync(join(t.dir, '.obsidian', 'core-plugins.json'), 'utf8'), '["file-explorer"]');
  assert.ok(existsSync(join(t.dir, '.obsidian', 'templates.json')));
  t.borrar();
});

test('init avisa si la carpeta tiene archivos y no es un vault de OKT', () => {
  const t = temporal();
  escribir(t.dir, 'algo.txt', 'x');
  const r = okt(['init'], { cwd: t.dir, configDir: join(t.dir, 'cfg') });
  assert.equal(r.codigo, 0);
  assert.match(r.salida, /ya tiene archivos/);
  t.borrar();
});

test('init se niega a crear el vault dentro de la carpeta del plugin', () => {
  const t = temporal();
  const r = okt(['init', '--aplicar', '--vault', join(CLI, '..', '..')], { cwd: t.dir, configDir: join(t.dir, 'cfg') });
  assert.notEqual(r.codigo, 0);
  assert.match(r.error, /plugin/);
  t.borrar();
});

test('los comandos encuentran el vault desde una subcarpeta', () => {
  const v = vaultNuevo();
  mkdirSync(join(v.vault, '10 │ 🎯 Proyectos', 'Tesis'), { recursive: true });
  const r = v.okt(['estado'], { cwd: join(v.vault, '10 │ 🎯 Proyectos', 'Tesis') });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Vault:/);
  v.borrar();
});

test('sin vault, los comandos lo dicen y sugieren init', () => {
  const t = temporal();
  const r = okt(['estado'], { cwd: t.dir, configDir: join(t.dir, 'cfg') });
  assert.equal(r.codigo, 1);
  assert.match(r.error, /okt init/);
  t.borrar();
});
