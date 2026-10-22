import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { temporal, okt, vaultNuevo, escribir, CLI } from './ayuda.mjs';

test('init sin --aplicar solo muestra la vista previa', () => {
  const t = temporal();
  const configDir = join(t.dir, 'config');
  const r = okt(['init'], { cwd: t.dir, configDir });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Vista previa/);
  assert.match(r.salida, /00-Bandeja/);
  assert.equal(existsSync(join(t.dir, '00-Bandeja')), false);
  t.borrar();
});

test('init --aplicar crea carpetas, sistema, AGENTS.md y configuración', () => {
  const v = vaultNuevo({ areas: 'Medicina,Cursos' });
  for (const c of ['00-Bandeja/sesiones', '10-Proyectos', '30-Conocimiento/conceptos', '40-Fuentes/adjuntos', '50-Diario', '90-Archivo', '99-Sistema/plantillas']) {
    assert.ok(existsSync(join(v.vault, c)), `falta ${c}`);
  }
  const agents = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\[\[Medicina\]\], \[\[Cursos\]\]/);
  assert.ok(agents.includes(CLI.replace(/\\/g, '/')), 'AGENTS.md debe traer la ruta del CLI');
  assert.equal(readFileSync(join(v.vault, 'CLAUDE.md'), 'utf8').trim(), '@AGENTS.md');
  assert.ok(existsSync(join(v.vault, '.gitignore')));
  assert.match(readFileSync(join(v.vault, '20-Areas', 'Medicina.md'), 'utf8'), /tipo: area/);
  assert.match(readFileSync(join(v.vault, '99-Sistema', 'hot.md'), 'utf8'), /2026-10-22: vault creado/);
  const cfg = JSON.parse(readFileSync(join(v.vault, '.cerebro', 'config.json'), 'utf8'));
  assert.deepEqual(cfg.areas, ['Medicina', 'Cursos']);
  const global = JSON.parse(readFileSync(join(v.configDir, 'config.json'), 'utf8'));
  assert.equal(global.vault, v.vault.replace(/\\/g, '/'));
  v.borrar();
});

test('init es reanudable: no pisa lo que ya existe', () => {
  const v = vaultNuevo();
  escribir(v.vault, 'AGENTS.md', 'Mis notas propias\n\n<!-- okt:inicio -->\nviejo\n<!-- okt:fin -->\n');
  escribir(v.vault, '99-Sistema/hot.md', 'hot del usuario');
  const r = v.okt(['init', '--aplicar']);
  assert.equal(r.codigo, 0, r.error);
  const agents = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^Mis notas propias/);
  assert.match(agents, /## Reglas/);
  assert.equal(readFileSync(join(v.vault, '99-Sistema', 'hot.md'), 'utf8'), 'hot del usuario');
  v.borrar();
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
  mkdirSync(join(v.vault, '10-Proyectos', 'Tesis'), { recursive: true });
  const r = v.okt(['estado'], { cwd: join(v.vault, '10-Proyectos', 'Tesis') });
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
