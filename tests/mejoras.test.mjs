import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';
import { R } from '../scripts/lib/estructura.mjs';
import {
  registrar,
  registrarFalloCli,
  listar,
  cerrar,
  exportar,
  calcularHuella,
} from '../scripts/lib/mejoras.mjs';

test('registrar un error dos veces con rutas distintas genera una sola entrada con veces: 2', () => {
  const v = vaultNuevo();
  const r1 = registrar(v.vault, {
    tipo: 'error',
    texto: 'Fallo al leer C:\\Users\\Yilman\\vault\\nota.md línea 12 «archivo dañado»',
    skill: 'capturar',
  });
  assert.equal(r1.datos.nueva, true);
  assert.equal(r1.datos.entrada.veces, 1);

  const r2 = registrar(v.vault, {
    tipo: 'error',
    texto: 'Fallo al leer /tmp/otro/directorio/nota.md línea 99 «archivo dañado»',
    skill: 'capturar',
  });
  assert.equal(r2.datos.nueva, false);
  assert.equal(r2.datos.entrada.veces, 2);

  const l = listar(v.vault);
  assert.equal(l.datos.mejoras.length, 1);
  assert.equal(l.datos.mejoras[0].veces, 2);
  v.borrar();
});

test('un script se copia a .cerebro/improvisados/ y aparece en la nota', () => {
  const v = vaultNuevo();
  const rutaScript = escribir(v.vault, 'scripts-tmp/procesar.js', 'console.log("script improvisado");');
  const r = registrar(v.vault, {
    tipo: 'script',
    texto: 'Script para procesar notas',
    archivo: rutaScript,
  });

  assert.equal(r.datos.nueva, true);
  assert.match(r.datos.entrada.script, /^\.cerebro\/improvisados\/\d{4}-\d{2}-\d{2}-procesar\.js$/);
  assert.ok(existsSync(join(v.vault, r.datos.entrada.script)));

  const contenidoNota = readFileSync(join(v.vault, R.mejoras), 'utf8');
  assert.match(contenidoNota, /`\.cerebro\/improvisados\/\d{4}-\d{2}-\d{2}-procesar\.js`/);
  assert.match(contenidoNota, /Script para procesar notas/);
  v.borrar();
});

test('un script inexistente da codigo: 2', () => {
  const v = vaultNuevo();
  assert.throws(
    () => {
      registrar(v.vault, {
        tipo: 'script',
        texto: 'Script que no existe',
        archivo: join(v.vault, 'no-existe-jamás.js'),
      });
    },
    (err) => err.codigo === 2
  );
  v.borrar();
});

test('cerrar lo saca de las abiertas', () => {
  const v = vaultNuevo();
  const r = registrar(v.vault, { tipo: 'idea', texto: 'Idea para reorganizar etiquetas' });
  const n = r.datos.entrada.n;

  assert.equal(listar(v.vault).datos.mejoras.length, 1);

  const rCerrar = cerrar(v.vault, n, 'Implementado en la versión 0.9.0');
  assert.equal(rCerrar.datos.entrada.estado, 'cerrada');

  // En abiertas ya no está
  const abiertas = listar(v.vault);
  assert.equal(abiertas.datos.mejoras.length, 0);

  // En todas sí está
  const todas = listar(v.vault, { todas: true });
  assert.equal(todas.datos.mejoras.length, 1);
  assert.equal(todas.datos.mejoras[0].estado, 'cerrada');

  // En la nota R.mejoras aparece en Últimas cerradas y no en la tabla de abiertas
  const nota = readFileSync(join(v.vault, R.mejoras), 'utf8');
  assert.match(nota, /No hay mejoras abiertas\./);
  assert.match(nota, /### Últimas cerradas/);
  assert.match(nota, /Implementado en la versión 0\.9\.0/);

  v.borrar();
});

test('exportar incluye el contenido del script', () => {
  const v = vaultNuevo();
  const scriptContenido = 'function improvisada() {\n  return 42;\n}\n';
  const rutaScript = escribir(v.vault, 'helper.js', scriptContenido);

  registrar(v.vault, {
    tipo: 'script',
    texto: 'Función helper improvisada',
    archivo: rutaScript,
  });

  const res = exportar(v.vault);
  assert.ok(res.datos?.ruta);
  const contenidoExport = readFileSync(join(v.vault, res.datos.ruta), 'utf8');

  assert.match(contenidoExport, /Función helper improvisada/);
  assert.match(contenidoExport, /return 42;/);
  v.borrar();
});

test('registrarFalloCli con vault nulo no lanza', () => {
  assert.doesNotThrow(() => {
    registrarFalloCli(null, { comando: 'nota nueva', mensaje: 'falló algo' });
  });

  assert.doesNotThrow(() => {
    registrarFalloCli('/carpeta/inexistente/no/vault', { comando: 'nota nueva', mensaje: 'falló' });
  });
});

test('la nota se regenera sin duplicar el bloque', () => {
  const v = vaultNuevo();
  registrar(v.vault, { tipo: 'idea', texto: 'Primera idea' });
  registrar(v.vault, { tipo: 'idea', texto: 'Segunda idea' });
  registrar(v.vault, { tipo: 'idea', texto: 'Tercera idea' });

  const textoNota = readFileSync(join(v.vault, R.mejoras), 'utf8');
  const inicioOcurrencias = textoNota.split('<!-- okt:inicio -->').length - 1;
  const finOcurrencias = textoNota.split('<!-- okt:fin -->').length - 1;

  assert.equal(inicioOcurrencias, 1, 'solo debe haber una marca de inicio');
  assert.equal(finOcurrencias, 1, 'solo debe haber una marca de fin');
  assert.match(textoNota, /Lo escribe OKT: errores del plugin/);
  v.borrar();
});

test('una línea dañada en el jsonl no rompe listar', () => {
  const v = vaultNuevo();
  registrar(v.vault, { tipo: 'idea', texto: 'Idea previa intacta' });

  // Inyectar línea corrupta
  const rutaJsonl = join(v.vault, '.cerebro', 'mejoras.jsonl');
  const previo = readFileSync(rutaJsonl, 'utf8');
  escribir(v.vault, '.cerebro/mejoras.jsonl', `${previo}{ JSON ROTO INCOMPLETO\n`);

  const l = listar(v.vault);
  assert.equal(l.datos.mejoras.length, 1);
  assert.equal(l.datos.mejoras[0].texto, 'Idea previa intacta');
  v.borrar();
});

test('prueba con ruta con ñ, tildes y emojis', () => {
  const v = vaultNuevo();
  const relScript = '02 │ 🧭 Areas/🧭 Medicina/guía-anemia-niños.js';
  const rutaScript = escribir(v.vault, relScript, 'console.log("diagnóstico de anemia");');

  const r = registrar(v.vault, {
    tipo: 'script',
    texto: 'Evaluación de anemia en niños con deficiencia de hierro',
    archivo: rutaScript,
  });

  assert.equal(r.datos.nueva, true);
  const l = listar(v.vault);
  assert.match(l.texto, /Evaluación de anemia en niños/);

  const res = exportar(v.vault);
  const exportado = readFileSync(join(v.vault, res.datos.ruta), 'utf8');
  assert.match(exportado, /diagnóstico de anemia/);
  v.borrar();
});
