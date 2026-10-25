import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

const memoriaDe = (dir, texto) => escribir(dir, 'CLAUDE.md', texto);
const capturas = (v, prefijo) => {
  const d = join(v.vault, '00 │ 📥 Bandeja');
  return existsSync(d) ? readdirSync(d).filter((n) => n.startsWith(prefijo)) : [];
};
const fin = (v, cwd) => v.okt(['hook', 'fin'], { cwd, input: JSON.stringify({ cwd, session_id: 's' }) });

test('memoria de agentes: una carpeta con CLAUDE.md pregunta una sola vez dónde va; sin memoria, excluida o el vault, nada', () => {
  const v = vaultNuevo();
  const proyecto = proyectoGit(v.dir, 'mi-plugin');
  memoriaDe(proyecto, '# Mi plugin\n\n## Qué es\n\nUn plugin de prueba.\n');
  let r = v.okt(['hook', 'inicio'], { cwd: proyecto, input: JSON.stringify({ cwd: proyecto, session_id: 'a' }) });
  assert.equal(r.codigo, 0, r.error);
  assert.equal(r.salida, '', 'fuera del vault no inyecta contexto');
  fin(v, proyecto);
  const nuevas = capturas(v, '🛠️');
  assert.deepEqual(nuevas, ['🛠️ Carpeta nueva - mi-plugin.md'], 'una sola captura, aunque corran inicio y fin');
  const texto = readFileSync(join(v.vault, '00 │ 📥 Bandeja', nuevas[0]), 'utf8');
  assert.match(texto, /okt agentes vincular "[^"]*mi-plugin" "<área o proyecto>/);
  assert.match(texto, /> Un plugin de prueba\./);
  assert.match(v.okt(['agentes']).salida, /mi-plugin: detectada/);
  // Sin memoria, excluida o el propio vault: nada.
  const vacio = join(v.dir, 'vacio');
  mkdirSync(vacio);
  fin(v, vacio);
  const secreto = proyectoGit(v.dir, 'secreto');
  memoriaDe(secreto, '# Secreto\n');
  v.okt(['config', 'excluir', 'secreto']);
  fin(v, secreto);
  fin(v, v.vault);
  assert.equal(capturas(v, '🛠️').length, 1);
  assert.equal(capturas(v, '💻').length, 0);
  v.borrar();
});

test('memoria de agentes: vincular crea el espejo en su carpeta; cada sesión deja solo lo que cambió y los commits nuevos', () => {
  const v = vaultNuevo();
  const proyecto = proyectoGit(v.dir, 'mi-plugin');
  memoriaDe(proyecto, '# Mi plugin\n\n## Insights\n\n- 2026-10-20 — Usar Edit con CRLF.\n- 2026-10-21 — Pendiente: probar en Drive.\n');
  fin(v, proyecto);
  v.okt(['nota', 'nueva', 'proyecto', '🧩 Plugins', '--area', 'Medicina']);
  let r = v.okt(['agentes', 'vincular', proyecto, 'Plugins']);
  assert.equal(r.codigo, 0, r.error);
  const espejo = '10 │ 🎯 Proyectos/🧩 Plugins/🛠️ mi-plugin - memoria del agente.md';
  const textoEspejo = readFileSync(join(v.vault, espejo), 'utf8');
  assert.match(textoEspejo, /tipo: fuente/);
  assert.match(textoEspejo, /Usar Edit con CRLF/);
  assert.equal(capturas(v, '🛠️').length, 0, 'la captura que preguntaba se archiva');
  assert.equal(capturas(v, '💻').length, 0, 'vincular no deja ficha');
  // Sesión sin cambios: nada.
  fin(v, proyecto);
  assert.equal(capturas(v, '💻').length, 0);
  // Sesión con cambios en la memoria y un commit.
  memoriaDe(proyecto, '# Mi plugin\n\n## Insights\n\n- 2026-10-20 — Usar Edit con CRLF.\n- 2026-10-24 — yt-dlp necesita Node para YouTube.\n');
  spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', 'add', '-A'], { cwd: proyecto });
  spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-qm', 'importa enlaces sin el modelo'], { cwd: proyecto });
  fin(v, proyecto);
  const avances = capturas(v, '💻');
  assert.deepEqual(avances, ['💻 2026-10-22 1030 mi-plugin.md']);
  const ficha = readFileSync(join(v.vault, '00 │ 📥 Bandeja', avances[0]), 'utf8');
  assert.match(ficha, /origen: sesion/);
  assert.match(ficha, /memoria: "\[\[🛠️ mi-plugin - memoria del agente\]\]"/);
  assert.match(ficha, /\*\*Nuevo:\*\*\n\n> - 2026-10-24 — yt-dlp necesita Node para YouTube\./);
  assert.match(ficha, /\*\*Ya no está:\*\*\n\n> - 2026-10-21 — Pendiente: probar en Drive\./);
  assert.doesNotMatch(ficha, /Usar Edit con CRLF/, 'solo lo que cambió');
  assert.match(ficha, /## Avances \(commits\)\n\n- importa enlaces sin el modelo/);
  assert.doesNotMatch(ficha, /Archivos tocados/);
  assert.match(readFileSync(join(v.vault, espejo), 'utf8'), /yt-dlp necesita Node/, 'el espejo se actualiza');
  v.borrar();
});

test('memoria de agentes: las carpetas superiores con memoria también cuentan; ignorar no vuelve a preguntar', () => {
  const v = vaultNuevo();
  const padre = join(v.dir, 'Plugins');
  memoriaDe(padre, '# Reglas de todos los plugins\n');
  const hijo = proyectoGit(padre, 'okt-telegram');
  writeFileSync(join(hijo, 'AGENTS.md'), '# Bot\n\nAGENTS sin CLAUDE.\n');
  fin(v, hijo);
  assert.deepEqual(capturas(v, '🛠️').sort(), ['🛠️ Carpeta nueva - Plugins.md', '🛠️ Carpeta nueva - okt-telegram.md']);
  v.okt(['tema', 'nuevo', 'Medicina/💻 Desarrollo']);
  assert.equal(v.okt(['agentes', 'vincular', padre, 'Medicina/Desarrollo']).codigo, 0);
  let r = v.okt(['agentes', 'ignorar', hijo]);
  assert.equal(r.codigo, 0, r.error);
  assert.equal(capturas(v, '🛠️').length, 0);
  fin(v, hijo);
  assert.equal(capturas(v, '🛠️').length, 0, 'una carpeta ignorada no vuelve a preguntar');
  assert.match(v.okt(['agentes']).salida, /okt-telegram: ignorada[\s\S]*Plugins: vinculada → 20 │ 🧭 Areas\/🧭 Medicina\/💻 Desarrollo/);
  r = v.okt(['agentes', 'vincular', join(v.dir, 'no-existe'), 'Medicina']);
  assert.equal(r.codigo, 2);
  v.borrar();
});

test('memoria de agentes: el hook de Antigravity detecta las carpetas abiertas fuera del vault', () => {
  const v = vaultNuevo();
  const proyecto = proyectoGit(v.dir, 'tesis');
  memoriaDe(proyecto, '# Tesis\n');
  const r = v.okt(['hook', 'inicio', '--formato', 'antigravity'], { input: JSON.stringify({ workspacePaths: [proyecto], conversationId: 'c1' }) });
  assert.equal(r.salida, '{}');
  assert.deepEqual(capturas(v, '🛠️'), ['🛠️ Carpeta nueva - tesis.md']);
  v.borrar();
});

test('memoria de agentes: el diff es por líneas y un CLAUDE.md con marcas okt no rompe el espejo', async () => {
  const { diferencia } = await import('../scripts/lib/agentes.mjs');
  assert.deepEqual(diferencia('a\nb\n\nc', 'a\nc\nd\nd'), { agregadas: ['d', 'd'], quitadas: ['b'] });
  const v = vaultNuevo();
  const proyecto = proyectoGit(v.dir, 'raro');
  memoriaDe(proyecto, '# Raro\n\n<!-- okt:inicio -->\nmedio\n<!-- okt:fin -->\nfinal\n');
  fin(v, proyecto);
  assert.equal(v.okt(['agentes', 'vincular', proyecto, 'Medicina']).codigo, 0);
  memoriaDe(proyecto, '# Raro\n\nfinal 2\n');
  assert.equal(v.okt(['agentes', 'sincronizar']).codigo, 0);
  const espejo = readFileSync(join(v.vault, '20 │ 🧭 Areas/🧭 Medicina/🛠️ raro - memoria del agente.md'), 'utf8');
  assert.match(espejo, /final 2/);
  assert.doesNotMatch(espejo, /medio/, 'la copia anterior se reemplazó entera');
  v.borrar();
});

test('hook fin nunca falla aunque la entrada sea basura', () => {
  const v = vaultNuevo();
  const r = v.okt(['hook', 'fin'], { input: 'no es json' });
  assert.equal(r.codigo, 0);
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
