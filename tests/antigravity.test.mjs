// Hook de inicio para Antigravity (SessionStart en <vault>/.agents/hooks.json) y su instalación.
// Formato verificado en agy 1.4.5 (2026-10-22): la salida es {"injectSteps":[{"systemMessage":{"systemMessage":"…"}}]}
// y el comando no admite comillas (las pasa literales).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { vaultNuevo, escribir, okt } from './ayuda.mjs';

const entradaAgy = (vault, extra = {}) => JSON.stringify({ conversationId: 'c1', workspacePaths: [vault.replace(/\\/g, '/')], transcriptPath: 'x', modelName: 'm', ...extra });

test('hook inicio --formato antigravity: JSON con injectSteps y el contexto del vault', () => {
  const v = vaultNuevo();
  try {
    const r = v.okt(['hook', 'inicio', '--formato', 'antigravity'], { input: entradaAgy(v.vault) });
    assert.equal(r.codigo, 0, r.error);
    const datos = JSON.parse(r.salida);
    const texto = datos.injectSteps[0].systemMessage.systemMessage;
    assert.match(texto, /Segundo cerebro OKT/);
    assert.match(texto, /Vault recién creado/);
  } finally {
    v.borrar();
  }
});

test('hook antigravity: el global y el del vault de la misma conversación no repiten; cualquier carpeta abierta dentro del vault cuenta', () => {
  const v = vaultNuevo();
  try {
    const correr = (extra) => JSON.parse(v.okt(['hook', 'inicio', '--formato', 'antigravity'], { input: entradaAgy(v.vault, extra) }).salida);
    // La App entrega la ruta con la unidad en minúscula y puede abrir varias carpetas.
    const otra = join(v.dir, 'otra');
    mkdirSync(otra);
    const primero = correr({ conversationId: 'conv-1', workspacePaths: [otra, v.vault.replace(/\\/g, '/').replace(/^C:/, 'c:')] });
    assert.ok(primero.injectSteps, 'el primero inyecta el contexto');
    assert.deepEqual(correr({ conversationId: 'conv-1' }), {}, 'el segundo hook de la misma conversación no repite');
    assert.ok(correr({ conversationId: 'conv-2' }).injectSteps, 'una conversación nueva vuelve a inyectar');
  } finally {
    v.borrar();
  }
});

test('hook antigravity: fuera del vault, con entrada rota o en un turno posterior responde {}', () => {
  const v = vaultNuevo();
  try {
    const fuera = join(v.dir, 'otro');
    mkdirSync(fuera);
    for (const input of [entradaAgy(fuera), 'no es json', entradaAgy(v.vault, { invocationNum: 3 })]) {
      const r = v.okt(['hook', 'inicio', '--formato', 'antigravity'], { input });
      assert.equal(r.codigo, 0, r.error);
      assert.deepEqual(JSON.parse(r.salida), {});
    }
  } finally {
    v.borrar();
  }
});

test('hook antigravity no reescribe la ruta del CLI de AGENTS.md (es la de Claude Code)', () => {
  const v = vaultNuevo();
  try {
    escribir(v.configDir, 'config.json', JSON.stringify({ vault: v.vault, cli: 'C:/otra/ruta/okt.mjs' }));
    const antes = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
    v.okt(['hook', 'inicio', '--formato', 'antigravity'], { input: entradaAgy(v.vault) });
    assert.equal(readFileSync(join(v.vault, 'AGENTS.md'), 'utf8'), antes);
    assert.equal(JSON.parse(readFileSync(join(v.configDir, 'config.json'), 'utf8')).cli, 'C:/otra/ruta/okt.mjs');
  } finally {
    v.borrar();
  }
});

test('el hook de Claude Code hace commit de AGENTS.md cuando renueva la ruta del CLI', () => {
  const v = vaultNuevo();
  try {
    const g = (...a) => spawnSync('git', a, { cwd: v.vault, encoding: 'utf8' });
    // AGENTS.md con la ruta de una versión anterior del plugin, como tras una actualización.
    const agents = join(v.vault, 'AGENTS.md');
    writeFileSync(agents, readFileSync(agents, 'utf8').replace(/node "[^"]+okt\.mjs"/, 'node "C:/version/vieja/okt.mjs"'));
    assert.match(readFileSync(agents, 'utf8'), /version\/vieja/);
    g('init', '-q', '-b', 'main');
    g('config', 'user.name', 'T');
    g('config', 'user.email', 't@t');
    g('add', '-A');
    g('commit', '-q', '-m', 'inicio');
    escribir(v.configDir, 'config.json', JSON.stringify({ vault: v.vault, cli: 'C:/version/vieja/okt.mjs' }));
    const r = v.okt(['hook', 'inicio'], { input: JSON.stringify({ cwd: v.vault }), env: { OKT_SIN_GIT: '' } });
    assert.equal(r.codigo, 0, r.error);
    const estado = spawnSync('git', ['status', '--porcelain'], { cwd: v.vault, encoding: 'utf8' }).stdout;
    assert.doesNotMatch(estado, /AGENTS\.md/);
    const log = spawnSync('git', ['log', '--oneline', '-1'], { cwd: v.vault, encoding: 'utf8' }).stdout;
    assert.match(log, /ruta del CLI/);
  } finally {
    v.borrar();
  }
});

function instalar(v, extra = {}) {
  const env = { OKT_HOME: join(v.dir, 'okt'), OKT_AGY_SKILLS: join(v.dir, 'skills'), OKT_AGY_CLI_DIR: join(v.dir, 'agy'), ...extra };
  return okt(['instalar', 'antigravity', '--aplicar'], { cwd: v.dir, configDir: v.configDir, env });
}

test('instalar antigravity pone el hook global sin pisar otros, y la tarea del IDE que baja Telegram al abrir la carpeta', () => {
  const v = vaultNuevo();
  try {
    escribir(v.configDir, 'config.json', JSON.stringify({ vault: v.vault }));
    const agyConfig = join(v.dir, 'agy-config');
    escribir(agyConfig, 'hooks.json', JSON.stringify({ otro: { Stop: [{ type: 'command', command: 'echo x' }] } }));
    escribir(v.vault, '.vscode/tasks.json', JSON.stringify({ version: '2.0.0', tasks: [{ label: 'mía', type: 'shell', command: 'echo' }] }));
    let r = instalar(v, { OKT_AGY_CONFIG_DIR: agyConfig });
    assert.equal(r.codigo, 0, r.error);
    const global = JSON.parse(readFileSync(join(agyConfig, 'hooks.json'), 'utf8'));
    assert.ok(global.otro, 'conserva los hooks globales del usuario');
    assert.match(global.okt.SessionStart[0].command, /^node \S+okt\.mjs hook inicio --formato antigravity$/);
    const tareas = JSON.parse(readFileSync(join(v.vault, '.vscode', 'tasks.json'), 'utf8')).tasks;
    assert.ok(tareas.some((t) => t.label === 'mía'), 'conserva las tareas del usuario');
    const okt = tareas.find((t) => t.label === 'OKT: bajar Telegram');
    assert.deepEqual(okt.runOptions, { runOn: 'folderOpen' });
    assert.deepEqual(okt.args.slice(1, 4), ['telegram', 'bajar', '--silencioso']);
    assert.match(r.salida, /Permitir/);
    // Repetirlo no duplica.
    r = instalar(v, { OKT_AGY_CONFIG_DIR: agyConfig });
    assert.equal(JSON.parse(readFileSync(join(v.vault, '.vscode', 'tasks.json'), 'utf8')).tasks.filter((t) => t.label === 'OKT: bajar Telegram').length, 1);
  } finally {
    v.borrar();
  }
});

test('instalar antigravity agrega el hook SessionStart al vault sin pisar otros hooks', () => {
  const v = vaultNuevo();
  try {
    escribir(v.configDir, 'config.json', JSON.stringify({ vault: v.vault }));
    escribir(v.vault, '.agents/hooks.json', JSON.stringify({ 'mi-hook': { Stop: [{ type: 'command', command: 'echo hola' }] } }));
    const r = instalar(v);
    assert.equal(r.codigo, 0, r.error);
    const hooks = JSON.parse(readFileSync(join(v.vault, '.agents', 'hooks.json'), 'utf8'));
    assert.ok(hooks['mi-hook'], 'conserva los hooks del usuario');
    const h = hooks.okt.SessionStart[0];
    assert.equal(h.type, 'command');
    assert.match(h.command, /^node \S+\/okt\/plugin\/scripts\/okt\.mjs hook inicio --formato antigravity$/);
    assert.doesNotMatch(h.command, /"/);
    // Repetirlo no duplica.
    instalar(v);
    assert.equal(JSON.parse(readFileSync(join(v.vault, '.agents', 'hooks.json'), 'utf8')).okt.SessionStart.length, 1);
  } finally {
    v.borrar();
  }
});

test('instalar avisa si el vault no es de confianza en agy, y no si lo es', () => {
  const v = vaultNuevo();
  try {
    escribir(v.configDir, 'config.json', JSON.stringify({ vault: v.vault }));
    let r = instalar(v);
    assert.match(r.salida, /confia/i);
    escribir(v.dir, 'agy/settings.json', JSON.stringify({ trustedWorkspaces: [v.vault] }));
    r = instalar(v);
    assert.doesNotMatch(r.salida, /confia/i);
  } finally {
    v.borrar();
  }
});

test('instalar no pone el hook si la ruta del plugin tiene espacios (agy no admite comillas)', () => {
  const v = vaultNuevo();
  try {
    escribir(v.configDir, 'config.json', JSON.stringify({ vault: v.vault }));
    const r = instalar(v, { OKT_HOME: join(v.dir, 'con espacio') });
    assert.equal(r.codigo, 0, r.error);
    assert.equal(existsSync(join(v.vault, '.agents', 'hooks.json')), false);
    assert.match(r.salida, /espacio/i);
  } finally {
    v.borrar();
  }
});
