import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { colaFalsa, elemento, TOKEN } from './fakes/cola-telegram.mjs';
import { configurar, bajar, descartar, leerConfigTelegram } from '../scripts/lib/telegram.mjs';
import { agregarTarea } from '../scripts/lib/notas.mjs';
import { hookInicio } from '../scripts/lib/sesiones.mjs';

// bajar() se importa directamente: el entorno aislado se fija en process.env de esta prueba.
const ENTORNO = ['OKT_CONFIG_DIR', 'OKT_FECHA', 'OKT_SIN_GIT'];
let previo;
before(() => {
  previo = Object.fromEntries(ENTORNO.map((k) => [k, process.env[k]]));
  process.env.OKT_FECHA = '2026-10-22T10:30';
  process.env.OKT_SIN_GIT = '1';
});
after(() => {
  for (const k of ENTORNO) previo[k] === undefined ? delete process.env[k] : (process.env[k] = previo[k]);
});

async function preparar(opciones = {}) {
  const v = vaultNuevo();
  process.env.OKT_CONFIG_DIR = v.configDir;
  const cola = await colaFalsa(opciones);
  configurar({ url: cola.url, token: TOKEN });
  return {
    ...v,
    cola,
    leer: (rel) => readFileSync(join(v.vault, rel), 'utf8'),
    bandeja: () => readdirSync(join(v.vault, '00-Bandeja', 'telegram')).sort(),
    async fin() {
      await cola.cerrar();
      v.borrar();
    },
  };
}

test('configurar guarda url y token fuera del vault y no muestra el token', async () => {
  const v = vaultNuevo();
  process.env.OKT_CONFIG_DIR = v.configDir;
  try {
    const r = configurar({ url: 'https://okt-telegram.ejemplo.workers.dev/', token: 'secreto-largo' });
    assert.doesNotMatch(r.texto, /secreto-largo/);
    assert.deepEqual(leerConfigTelegram(), { url: 'https://okt-telegram.ejemplo.workers.dev', token: 'secreto-largo' });
    assert.ok(existsSync(join(v.configDir, 'telegram.json')));
    assert.throws(() => configurar({ url: 'http://ejemplo.com', token: 'x' }), /https/);
    assert.throws(() => configurar({ url: 'https://ejemplo.com' }), /--token/);
  } finally {
    v.borrar();
  }
});

test('bajar sin configuración da un error de uso', async () => {
  const v = vaultNuevo();
  process.env.OKT_CONFIG_DIR = v.configDir;
  try {
    await assert.rejects(bajar(v.vault), (e) => e.codigo === 2 && /okt telegram config/.test(e.message));
  } finally {
    v.borrar();
  }
});

test('bajar escribe cada tipo en su lugar y confirma todo', async () => {
  const t = await preparar({
    elementos: [
      elemento('a1', 'nota', 'Idea para el repaso de anemia ferropénica en niños'),
      elemento('a2', 'voz', 'Recordar revisar la guía de hipertensión', { fecha: '2026-10-21T18:06:00-05:00' }),
      elemento('a3', 'enlace', 'https://www.youtube.com/watch?v=abc mirar luego', { url: 'https://www.youtube.com/watch?v=abc' }),
      elemento('a4', 'archivo', 'Pizarra de la clase', { archivo_key: 'FILE-1', nombre: 'foto.jpg', mime: 'image/jpeg' }),
      elemento('a5', 'tarea', 'Comprar el libro de fisiología'),
    ],
    archivos: { 'FILE-1': { bytes: 'JPEGDATA', mime: 'image/jpeg' } },
  });
  try {
    const r = await bajar(t.vault);
    assert.equal(r.datos.escritos.length, 5);
    assert.deepEqual(t.cola.estado.confirmados.sort(), ['a1', 'a2', 'a3', 'a4', 'a5']);

    const notas = t.bandeja();
    assert.ok(notas.includes('2026-10-21 1805 Idea para el repaso de anemia ferropénica.md'), notas.join(' | '));
    const nota = t.leer('00-Bandeja/telegram/2026-10-21 1805 Idea para el repaso de anemia ferropénica.md');
    assert.match(nota, /^---\ntipo: nota\ncreado: 2026-10-21\norigen: telegram\n/);
    assert.match(nota, /Idea para el repaso de anemia ferropénica en niños/);

    const voz = notas.find((n) => n.startsWith('2026-10-21 1806'));
    assert.match(t.leer(`00-Bandeja/telegram/${voz}`), /Transcripción automática/);

    const enlace = t.leer(`00-Bandeja/telegram/${notas.find((n) => /youtube/i.test(n))}`);
    assert.match(enlace, /url: https:\/\/www.youtube.com\/watch\?v=abc/);
    assert.match(enlace, /capturar/);

    assert.equal(readFileSync(join(t.vault, '40-Fuentes/adjuntos/telegram/foto.jpg'), 'utf8'), 'JPEGDATA');
    const archivo = t.leer(`00-Bandeja/telegram/${notas.find((n) => /Pizarra/.test(n))}`);
    assert.match(archivo, /adjunto: "\[\[foto.jpg\]\]"/);
    assert.match(archivo, /!\[\[foto.jpg\]\]/);

    assert.match(t.leer('50-Diario/2026-10-22.md'), /## Tareas\n\n- \[ \] Comprar el libro de fisiología/);
    assert.equal(notas.length, 4);
  } finally {
    await t.fin();
  }
});

test('si falla la confirmación, la siguiente bajada no duplica y confirma', async () => {
  const t = await preparar({ elementos: [elemento('b1', 'nota', 'Una sola vez')], fallarConfirmar: true });
  try {
    const r1 = await bajar(t.vault);
    assert.equal(r1.datos.escritos.length, 1);
    assert.match(r1.texto, /confirm/i);
    t.cola.estado.fallarConfirmar = false;
    const r2 = await bajar(t.vault);
    assert.equal(r2.datos.escritos.length, 0);
    assert.deepEqual(t.cola.estado.confirmados, ['b1']);
    assert.equal(t.bandeja().length, 1);
  } finally {
    await t.fin();
  }
});

test('un elemento sensible se retiene sin --forzar y se escribe con él', async () => {
  const t = await preparar({ elementos: [elemento('c1', 'nota', 'Control del DNI 45879632 mañana', { sensible: true })] });
  try {
    const r = await bajar(t.vault);
    assert.equal(r.datos.escritos.length, 0);
    assert.deepEqual(r.datos.retenidos.map((x) => x.id), ['c1']);
    assert.match(r.texto, /okt telegram descartar c1/);
    assert.deepEqual(t.cola.estado.confirmados, []);
    const r2 = await bajar(t.vault, { forzar: true });
    assert.equal(r2.datos.escritos.length, 1);
    assert.deepEqual(t.cola.estado.confirmados, ['c1']);
  } finally {
    await t.fin();
  }
});

test('también retiene lo que parece sensible aunque el Worker no lo marcara', async () => {
  const t = await preparar({ elementos: [elemento('c2', 'nota', 'Paciente Juan Pérez con fiebre')] });
  try {
    const r = await bajar(t.vault);
    assert.deepEqual(r.datos.retenidos.map((x) => x.id), ['c2']);
  } finally {
    await t.fin();
  }
});

test('retiene por el nombre del archivo y por nombres en mayúsculas', async () => {
  const t = await preparar({
    elementos: [
      elemento('c3', 'archivo', '', { archivo_key: 'F', nombre: 'Paciente Juan Perez - HC 45892.pdf', mime: 'application/pdf' }),
      elemento('c4', 'nota', 'Paciente JUAN PÉREZ con resultado crítico'),
    ],
    archivos: { F: { bytes: '%PDF', mime: 'application/pdf' } },
  });
  try {
    const r = await bajar(t.vault);
    assert.deepEqual(r.datos.retenidos.map((x) => x.id), ['c3', 'c4']);
    assert.ok(!existsSync(join(t.vault, '40-Fuentes/adjuntos/telegram')) || readdirSync(join(t.vault, '40-Fuentes/adjuntos/telegram')).length === 0);
  } finally {
    await t.fin();
  }
});

test('confirma lo ya escrito aunque después se acabe el tiempo', async () => {
  const t = await preparar({ elementos: [elemento('i1', 'nota', 'Primera'), elemento('i2', 'archivo', 'Lento', { archivo_key: 'LENTO', nombre: 'l.pdf' })], archivos: { LENTO: { bytes: 'x', mime: 'application/pdf' } } });
  try {
    t.cola.estado.demoraArchivo = 1000;
    await assert.rejects(bajar(t.vault, { tope: 400 }), /tiempo/i);
    assert.equal(t.bandeja().length, 1);
    // La confirmación de lo escrito sale aunque el tope ya pasó: se manda con su propio plazo corto.
    assert.deepEqual(t.cola.estado.confirmados, ['i1']);
  } finally {
    await t.fin();
  }
});

test('dos bajadas a la vez no duplican: la segunda espera su turno', async () => {
  const t = await preparar({ elementos: [elemento('j1', 'nota', 'Solo una vez')], demora: 150 });
  try {
    const [a, b] = await Promise.allSettled([bajar(t.vault), bajar(t.vault)]);
    const textos = [a, b].map((x) => (x.status === 'fulfilled' ? x.value.texto : x.reason.message));
    assert.ok(textos.some((x) => /otra bajada/i.test(x)), textos.join(' | '));
    assert.equal(t.bandeja().length, 1);
    assert.ok(!existsSync(join(t.vault, '.cerebro', 'telegram.lock')));
  } finally {
    await t.fin();
  }
});

test('el hook avisa si algo no se pudo bajar', async () => {
  const t = await preparar({ elementos: [elemento('k1', 'archivo', 'x', { archivo_key: 'NO', nombre: 'x.pdf' })] });
  try {
    escribir(t.configDir, 'config.json', JSON.stringify({ vault: t.vault }));
    assert.match(await hookInicio(JSON.stringify({ cwd: t.vault })), /No pude escribir k1/);
  } finally {
    await t.fin();
  }
});

test('descartar confirma sin escribir nada', async () => {
  const t = await preparar({ elementos: [elemento('d1', 'nota', 'DNI 45879632', { sensible: true })] });
  try {
    const r = await descartar(t.vault, ['d1']);
    assert.match(r.texto, /1/);
    assert.deepEqual(t.cola.estado.confirmados, ['d1']);
    assert.equal(existsSync(join(t.vault, '00-Bandeja/telegram')) ? t.bandeja().length : 0, 0);
  } finally {
    await t.fin();
  }
});

test('recorre todas las páginas de la cola', async () => {
  const elementos = [1, 2, 3, 4, 5].map((n) => elemento(`p${n}`, 'nota', `Nota número ${n}`, { fecha: `2026-10-21T18:0${n}:00-05:00` }));
  const t = await preparar({ elementos, porPagina: 2 });
  try {
    const r = await bajar(t.vault);
    assert.equal(r.datos.escritos.length, 5);
    assert.equal(t.cola.estado.confirmados.length, 5);
  } finally {
    await t.fin();
  }
});

test('si un archivo no se puede bajar, su nota no se escribe ni se confirma', async () => {
  const t = await preparar({ elementos: [elemento('e1', 'archivo', 'Falta', { archivo_key: 'NO-EXISTE', nombre: 'x.pdf', mime: 'application/pdf' }), elemento('e2', 'nota', 'Esta sí')] });
  try {
    const r = await bajar(t.vault);
    assert.equal(r.datos.escritos.length, 1);
    assert.deepEqual(t.cola.estado.confirmados, ['e2']);
    assert.equal(r.datos.errores.length, 1);
  } finally {
    await t.fin();
  }
});

test('token incorrecto: error claro', async () => {
  const t = await preparar({ elementos: [elemento('f1', 'nota', 'x')] });
  try {
    configurar({ url: t.cola.url, token: 'otro' });
    await assert.rejects(bajar(t.vault), /token/i);
  } finally {
    await t.fin();
  }
});

test('respeta el tope de tiempo', async () => {
  const t = await preparar({ elementos: [elemento('g1', 'nota', 'x')], demora: 1000 });
  try {
    const inicio = Date.now();
    await assert.rejects(bajar(t.vault, { tope: 150 }), /tiempo/i);
    assert.ok(Date.now() - inicio < 900);
  } finally {
    await t.fin();
  }
});

test('el hook de inicio baja la cola en el vault y nunca falla', async () => {
  const t = await preparar({ elementos: [elemento('h1', 'nota', 'Desde el hook')] });
  try {
    escribir(t.configDir, 'config.json', JSON.stringify({ vault: t.vault }));
    const texto = await hookInicio(JSON.stringify({ cwd: t.vault }));
    assert.match(texto, /Telegram: 1 elemento/);
    assert.equal(t.bandeja().length, 1);

    // Fuera del vault no baja nada.
    t.cola.estado.elementos.push(elemento('h2', 'nota', 'Otra'));
    await hookInicio(JSON.stringify({ cwd: join(t.dir) }));
    assert.equal(t.bandeja().length, 1);

    // Con el Worker caído, la sesión arranca igual.
    configurar({ url: 'http://127.0.0.1:9', token: TOKEN });
    const caido = await hookInicio(JSON.stringify({ cwd: t.vault }));
    assert.match(caido, /Segundo cerebro OKT/);
  } finally {
    await t.fin();
  }
});

test('agregarTarea usa la línea vacía de la plantilla o crea la sección', () => {
  const v = vaultNuevo();
  process.env.OKT_CONFIG_DIR = v.configDir;
  try {
    escribir(v.vault, '50-Diario/2026-10-22.md', '---\ntipo: diario\ncreado: 2026-10-22\n---\n\n# 2026-10-22\n\n## Tareas\n\n- [ ] \n\n## Lo que aprendí\n');
    agregarTarea(v.vault, 'Primera');
    agregarTarea(v.vault, 'Segunda');
    const diaria = readFileSync(join(v.vault, '50-Diario/2026-10-22.md'), 'utf8');
    assert.match(diaria, /## Tareas\n\n- \[ \] Primera\n- \[ \] Segunda\n\n## Lo que aprendí/);

    writeFileSync(join(v.vault, '50-Diario/2026-10-22.md'), '---\ntipo: diario\ncreado: 2026-10-22\n---\n\n# 2026-10-22\n');
    agregarTarea(v.vault, 'Sin sección');
    assert.match(readFileSync(join(v.vault, '50-Diario/2026-10-22.md'), 'utf8'), /## Tareas\n\n- \[ \] Sin sección\n$/);
  } finally {
    v.borrar();
  }
});
