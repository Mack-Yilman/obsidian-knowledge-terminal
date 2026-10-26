// 0.3.1: formato configurable de la nota diaria y las skills de formato de Obsidian (kepano/obsidian-skills).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { temporal, escribir, okt, vaultNuevo } from './ayuda.mjs';

test('formato_diario DD/MM/YY: la nota diaria se llama «📅 22∕10∕26» y Obsidian usa el mismo nombre', () => {
  const v = vaultNuevo();
  let r = v.okt(['config', 'poner', 'formato_diario', 'DD/MM/YY']);
  assert.equal(r.codigo, 0, r.error);
  assert.equal(JSON.parse(readFileSync(join(v.vault, '.obsidian', 'daily-notes.json'), 'utf8')).format, '[📅] DD∕MM∕YY');
  r = v.okt(['nota', 'nueva', 'diario']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '03 │ 📅 Diario', '📅 22∕10∕26.md')), r.salida);
  // La segunda vez reconoce la misma nota (las tareas de Telegram van ahí).
  assert.match(v.okt(['nota', 'nueva', 'diario']).salida, /Ya existía/);
  assert.notEqual(v.okt(['config', 'poner', 'formato_diario', 'MM/DD']).codigo, 0);
  v.borrar();
});

test('instalar obsidian-skills: vista previa sin cambios; con --aplicar copia las skills a Antigravity', () => {
  const t = temporal();
  // Repositorio falso, local, con la estructura de kepano/obsidian-skills.
  const repo = join(t.dir, 'repo');
  escribir(repo, 'skills/obsidian-markdown/SKILL.md', '---\nname: obsidian-markdown\n---\n');
  escribir(repo, 'skills/json-canvas/SKILL.md', '---\nname: json-canvas\n---\n');
  mkdirSync(join(repo, 'skills', 'sin-skill'));
  const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.name=x', '-c', 'user.email=x@x', 'add', '-A');
  git('-c', 'user.name=x', '-c', 'user.email=x@x', 'commit', '-q', '-m', 'inicio');
  const env = { OKT_HOME: join(t.dir, 'okt'), OKT_AGY_SKILLS: join(t.dir, 'skills'), OKT_OBSIDIAN_SKILLS_REPO: repo };
  let r = okt(['instalar', 'obsidian-skills'], { cwd: t.dir, configDir: join(t.dir, 'cfg'), env });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /claude plugin install obsidian@obsidian-skills/);
  assert.ok(!existsSync(join(t.dir, 'skills')));
  r = okt(['instalar', 'obsidian-skills', '--aplicar'], { cwd: t.dir, configDir: join(t.dir, 'cfg'), env });
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(t.dir, 'skills', 'obsidian-markdown', 'SKILL.md')));
  assert.ok(existsSync(join(t.dir, 'skills', 'json-canvas', 'SKILL.md')));
  assert.ok(!existsSync(join(t.dir, 'skills', 'sin-skill')));
  // Repetirlo actualiza (git pull) en vez de clonar de nuevo.
  assert.equal(okt(['instalar', 'obsidian-skills', '--aplicar'], { cwd: t.dir, configDir: join(t.dir, 'cfg'), env }).codigo, 0);
  t.borrar();
});

test('doctor muestra si obsidian-skills está en Claude Code', () => {
  const v = vaultNuevo();
  const lista = join(v.dir, 'installed_plugins.json');
  writeFileSync(lista, JSON.stringify({ version: 2, plugins: { 'obsidian@obsidian-skills': [{}] } }));
  const datos = JSON.parse(v.okt(['doctor', '--json'], { env: { OKT_CLAUDE_PLUGINS: lista } }).salida);
  assert.equal(datos.find((x) => x.nombre === 'Formato de Obsidian en Claude Code (obsidian-skills)').estado, 'ok');
  v.borrar();
});
