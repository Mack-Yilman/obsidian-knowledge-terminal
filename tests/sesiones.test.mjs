import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { vaultNuevo, escribir } from './ayuda.mjs';

function proyectoGit(base, nombre) {
  const dir = join(base, nombre);
  mkdirSync(dir, { recursive: true });
  const g = (...a) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  escribir(dir, 'app.js', 'x');
  g('add', '-A');
  g('commit', '-q', '-m', 'agrega app');
  escribir(dir, 'nuevo.js', 'y');
  return dir;
}

const fichas = (v) => {
  const d = join(v.vault, '00 │ 📥 Bandeja');
  return existsSync(d) ? readdirSync(d).filter((n) => n.startsWith('💻')) : [];
};

test('hook inicio dentro del vault inyecta hot.md; fuera no dice nada', () => {
  const v = vaultNuevo();
  let r = v.okt(['hook', 'inicio'], { input: JSON.stringify({ cwd: v.vault, session_id: 's1' }) });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Segundo cerebro OKT/);
  assert.match(r.salida, /Vault recién creado/);
  const fuera = join(v.dir, 'otro');
  mkdirSync(fuera);
  r = v.okt(['hook', 'inicio'], { cwd: fuera, input: JSON.stringify({ cwd: fuera, session_id: 's2' }) });
  assert.equal(r.codigo, 0);
  assert.equal(r.salida, '');
  v.borrar();
});

test('hook fin en un proyecto con cambios escribe una ficha sin usar el modelo', () => {
  const v = vaultNuevo();
  const proyecto = proyectoGit(v.dir, 'mi-plugin');
  const transcript = escribir(v.dir, 't.jsonl', [
    JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: join(proyecto, 'app.js') } }] } }),
    JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: join(proyecto, 'Paciente Juan Perez.md') } }] } }),
    JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: join(proyecto, 'leido.js') } }] } }),
  ].join('\n'));
  v.okt(['hook', 'inicio'], { cwd: proyecto, input: JSON.stringify({ cwd: proyecto, session_id: 'abc' }) });
  const r = v.okt(['hook', 'fin'], { cwd: proyecto, input: JSON.stringify({ cwd: proyecto, session_id: 'abc', transcript_path: transcript }) });
  assert.equal(r.codigo, 0, r.error);
  const lista = fichas(v);
  assert.equal(lista.length, 1);
  assert.match(lista[0], /^💻 2026-10-22 1030 mi-plugin\.md$/);
  const texto = readFileSync(join(v.vault, '00 │ 📥 Bandeja', lista[0]), 'utf8');
  assert.match(texto, /tipo: captura\ncreado: 2026-10-22\norigen: sesion/);
  assert.match(texto, /agente: claude/);
  assert.match(texto, /agrega app/);
  assert.match(texto, /app\.js/);
  assert.match(texto, /nuevo\.js/);
  assert.doesNotMatch(texto, /leido\.js/);
  assert.match(texto, /Juan Perez/, 'no filtra nombres: el vault es del usuario');
  v.borrar();
});

test('hook fin no escribe nada si no hubo cambios, si el proyecto está excluido o si es el vault', () => {
  const v = vaultNuevo();
  const vacio = join(v.dir, 'vacio');
  mkdirSync(vacio);
  v.okt(['hook', 'fin'], { cwd: vacio, input: JSON.stringify({ cwd: vacio, session_id: 'x' }) });
  const proyecto = proyectoGit(v.dir, 'secreto');
  v.okt(['config', 'excluir', 'secreto']);
  v.okt(['hook', 'fin'], { cwd: proyecto, input: JSON.stringify({ cwd: proyecto, session_id: 'y' }) });
  v.okt(['hook', 'fin'], { input: JSON.stringify({ cwd: v.vault, session_id: 'z' }) });
  assert.deepEqual(fichas(v), []);
  v.borrar();
});

test('hook fin nunca falla aunque la entrada sea basura', () => {
  const v = vaultNuevo();
  const r = v.okt(['hook', 'fin'], { input: 'no es json' });
  assert.equal(r.codigo, 0);
  v.borrar();
});

test('sesiones agy agrupa por carpeta y día, sin copiar el texto de los pedidos', () => {
  const v = vaultNuevo();
  const proyecto = proyectoGit(v.dir, 'tesis');
  const ts = new Date(2026, 9, 22, 9, 0).getTime();
  const hist = escribir(v.dir, 'history.jsonl', [
    JSON.stringify({ display: 'pedido secreto uno', timestamp: ts, workspace: proyecto, conversationId: 'c1' }),
    JSON.stringify({ display: 'pedido secreto dos', timestamp: ts + 60000, workspace: proyecto, conversationId: 'c1' }),
    JSON.stringify({ display: 'en el vault', timestamp: ts, workspace: v.vault }),
  ].join('\n'));
  let r = v.okt(['sesiones', 'agy'], { env: { OKT_AGY_HISTORIAL: hist } });
  assert.equal(r.codigo, 0, r.error);
  const lista = fichas(v);
  assert.equal(lista.length, 1);
  const texto = readFileSync(join(v.vault, '00 │ 📥 Bandeja', lista[0]), 'utf8');
  assert.match(texto, /agente: antigravity/);
  assert.match(texto, /pedidos: 2/);
  assert.doesNotMatch(texto, /secreto/);
  r = v.okt(['sesiones', 'agy'], { env: { OKT_AGY_HISTORIAL: hist } });
  assert.match(r.salida, /0 fichas/);
  v.borrar();
});

test('bandeja preparar junta lo pendiente en un paquete; archivar lo mueve a 90 │ 🗄️ Archivo', () => {
  const v = vaultNuevo();
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  v.okt(['indice']);
  escribir(v.vault, '00 │ 📥 Bandeja/Idea.md', '---\ntipo: captura\ncreado: 2026-10-20\norigen: nota\n---\nUna idea sobre hierro.\n');
  escribir(v.vault, '00 │ 📥 Bandeja/Apuntes.md', 'Apuntes importados.\n');
  let r = v.okt(['bandeja', 'preparar', '--json']);
  assert.equal(r.codigo, 0, r.error);
  const d = JSON.parse(r.salida);
  assert.equal(d.elementos.length, 2);
  const paquete = readFileSync(join(v.vault, d.paquete), 'utf8');
  assert.match(paquete, /## Árbol del vault[\s\S]*\[\[🫀 Cardiología\]\]/, 'el paquete trae el árbol para decidir dónde va cada cosa');
  assert.match(paquete, /## 00 │ 📥 Bandeja\/Idea\.md/);
  assert.match(paquete, /Una idea sobre hierro/);
  r = v.okt(['bandeja', 'archivar', '00 │ 📥 Bandeja/Idea.md']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '90 │ 🗄️ Archivo/00 │ 📥 Bandeja/Idea.md')));
  assert.ok(!existsSync(join(v.vault, '00 │ 📥 Bandeja/Idea.md')));
  r = v.okt(['bandeja', 'archivar', '../fuera.md']);
  assert.notEqual(r.codigo, 0);
  v.borrar();
});
