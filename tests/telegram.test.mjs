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
    bandeja: () => readdirSync(join(v.vault, '00 │ 📥 Bandeja')).filter((n) => n.endsWith('.md')).sort(),
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
    assert.ok(notas.includes('📲 2026-10-21 1805 Idea para el repaso de anemia ferropénica.md'), notas.join(' | '));
    const nota = t.leer('00 │ 📥 Bandeja/📲 2026-10-21 1805 Idea para el repaso de anemia ferropénica.md');
    assert.match(nota, /^---\ntipo: captura\ncreado: 2026-10-21\norigen: telegram\n/);
    assert.match(nota, /Idea para el repaso de anemia ferropénica en niños/);

    const voz = notas.find((n) => n.startsWith('📲 2026-10-21 1806'));
    assert.match(t.leer(`00 │ 📥 Bandeja/${voz}`), /Transcripción automática/);

    const enlace = t.leer(`00 │ 📥 Bandeja/${notas.find((n) => /youtube/i.test(n))}`);
    assert.match(enlace, /url: https:\/\/www.youtube.com\/watch\?v=abc/);
    assert.match(enlace, /okt importar enlaces/);

    assert.equal(readFileSync(join(t.vault, '05 │ ⚙️ Sistema/📎 adjuntos/📲 telegram/foto.jpg'), 'utf8'), 'JPEGDATA');
    const archivo = t.leer(`00 │ 📥 Bandeja/${notas.find((n) => /Pizarra/.test(n))}`);
    assert.match(archivo, /adjunto: "\[\[foto.jpg\]\]"/);
    assert.match(archivo, /!\[\[foto.jpg\]\]/);

    assert.match(t.leer('03 │ 📅 Diario/📅 2026-10-22.md'), /## Tareas\n\n- \[ \] Comprar el libro de fisiología/);
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

test('no filtra el contenido: DNI, nombres y archivos con nombres se escriben (y se ignora el «sensible» de la 0.1)', async () => {
  const t = await preparar({
    elementos: [
      elemento('c1', 'nota', 'Control del DNI 45879632 mañana', { sensible: true }),
      elemento('c2', 'nota', 'Paciente JUAN PÉREZ con resultado crítico'),
      elemento('c3', 'archivo', '', { archivo_key: 'F', nombre: 'Paciente Juan Perez - HC 45892.pdf', mime: 'application/pdf' }),
    ],
    archivos: { F: { bytes: '%PDF', mime: 'application/pdf' } },
  });
  try {
    // Un registro de la 0.3 con retenidos: la primera bajada lo limpia.
    escribir(t.vault, '.cerebro/telegram.json', JSON.stringify({ escritos: {}, retenidos: [{ id: 'viejo', que: 'un DNI' }] }));
    const r = await bajar(t.vault);
    assert.equal(r.datos.escritos.length, 3);
    assert.equal(r.datos.retenidos, undefined);
    assert.deepEqual(t.cola.estado.confirmados.sort(), ['c1', 'c2', 'c3']);
    assert.ok(existsSync(join(t.vault, '05 │ ⚙️ Sistema/📎 adjuntos/📲 telegram/Paciente Juan Perez - HC 45892.pdf')));
    assert.doesNotMatch(readFileSync(join(t.vault, '.cerebro', 'telegram.json'), 'utf8'), /retenidos/);
    assert.ok(t.bandeja().some((n) => /DNI 45879632/.test(n)));
  } finally {
    await t.fin();
  }
});

test('--silencioso (la tarea del IDE) no falla sin configuración', async () => {
  const v = vaultNuevo();
  process.env.OKT_CONFIG_DIR = v.configDir;
  try {
    const r = await bajar(v.vault, { silencioso: true });
    assert.equal(r.texto, '');
  } finally {
    v.borrar();
  }
});

test('confirma lo ya escrito aunque después se acabe el tiempo', async () => {
  const t = await preparar({ elementos: [elemento('i1', 'nota', 'Primera'), elemento('i2', 'archivo', 'Lento', { archivo_key: 'LENTO', nombre: 'l.pdf' })], archivos: { LENTO: { bytes: 'x', mime: 'application/pdf' } } });
  try {
    t.cola.estado.demoraArchivo = 1000;
    await assert.rejects(bajar(t.vault, { tope: 400, reservaArchivo: 0 }), /tiempo/i);
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
    assert.ok(!existsSync(join(t.vault, '.cerebro', 'cache', 'telegram.lock')));
  } finally {
    await t.fin();
  }
});

test('una foto sin leyenda: título sin extensión ni fecha repetida, sin renglones vacíos', async () => {
  const t = await preparar({ elementos: [elemento('m1', 'archivo', '', { archivo_key: 'F', nombre: 'foto 2026-10-21 1805.jpg', mime: 'image/jpeg' })], archivos: { F: { bytes: 'JPG', mime: 'image/jpeg' } } });
  try {
    await bajar(t.vault);
    assert.deepEqual(t.bandeja(), ['📲 2026-10-21 1805 foto.md']);
    const nota = t.leer('00 │ 📥 Bandeja/📲 2026-10-21 1805 foto.md');
    assert.match(nota, /# 📲 foto\n\n!\[\[foto 2026-10-21 1805.jpg\]\]\n\nArchivo en /);
  } finally {
    await t.fin();
  }
});

test('el título no termina en coma ni en otra puntuación', async () => {
  const t = await preparar({ elementos: [elemento('o1', 'voz', 'Hola, ahorita estoy probando el telegram, el audio de telegram')] });
  try {
    await bajar(t.vault);
    assert.deepEqual(t.bandeja(), ['📲 2026-10-21 1805 Hola, ahorita estoy probando el telegram.md']);
  } finally {
    await t.fin();
  }
});

test('con poco tiempo (hook), los archivos esperan y lo demás se baja', async () => {
  const t = await preparar({
    elementos: [elemento('n1', 'archivo', 'Un PDF', { archivo_key: 'F', nombre: 'a.pdf' }), elemento('n2', 'nota', 'Texto rápido')],
    archivos: { F: { bytes: '%PDF', mime: 'application/pdf' } },
  });
  try {
    const r = await bajar(t.vault, { tope: 2000, reservaArchivo: 6000 });
    assert.equal(r.datos.escritos.length, 1);
    assert.deepEqual(r.datos.diferidos, ['n1']);
    assert.match(r.texto, /1 archivo espera en la cola/);
    assert.deepEqual(t.cola.estado.confirmados, ['n2']);
    const r2 = await bajar(t.vault);
    assert.equal(r2.datos.escritos.length, 1);
    assert.deepEqual(t.cola.estado.confirmados, ['n2', 'n1']);
  } finally {
    await t.fin();
  }
});

test('a mano, por defecto deja los archivos para después si no queda tiempo, sin error', async () => {
  const t = await preparar({ elementos: [elemento('q1', 'nota', 'Primero'), elemento('q2', 'archivo', 'PDF', { archivo_key: 'F', nombre: 'q.pdf' })], archivos: { F: { bytes: '%PDF', mime: 'application/pdf' } } });
  try {
    const r = await bajar(t.vault, { tope: 3000 });
    assert.deepEqual(r.datos.diferidos, ['q2']);
    assert.match(r.texto, /vuelve a ejecutar okt telegram bajar|okt telegram bajar/);
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
  const t = await preparar({ elementos: [elemento('d1', 'nota', 'Un mensaje que no quiero guardar')] });
  try {
    const r = await descartar(t.vault, ['d1']);
    assert.match(r.texto, /1/);
    assert.deepEqual(t.cola.estado.confirmados, ['d1']);
    assert.equal(t.bandeja().length, 0);
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
    escribir(v.vault, '03 │ 📅 Diario/📅 2026-10-22.md', '---\ntipo: diario\ncreado: 2026-10-22\n---\n\n# 2026-10-22\n\n## Tareas\n\n- [ ] \n\n## Lo que aprendí\n');
    agregarTarea(v.vault, 'Primera');
    agregarTarea(v.vault, 'Segunda');
    const diaria = readFileSync(join(v.vault, '03 │ 📅 Diario/📅 2026-10-22.md'), 'utf8');
    assert.match(diaria, /## Tareas\n\n- \[ \] Primera\n- \[ \] Segunda\n\n## Lo que aprendí/);

    writeFileSync(join(v.vault, '03 │ 📅 Diario/📅 2026-10-22.md'), '---\ntipo: diario\ncreado: 2026-10-22\n---\n\n# 2026-10-22\n');
    agregarTarea(v.vault, 'Sin sección');
    assert.match(readFileSync(join(v.vault, '03 │ 📅 Diario/📅 2026-10-22.md'), 'utf8'), /## Tareas\n\n- \[ \] Sin sección\n$/);
  } finally {
    v.borrar();
  }
});
