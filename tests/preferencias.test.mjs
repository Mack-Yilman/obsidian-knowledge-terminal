import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';
import {
  agregar,
  listar,
  quitar,
  reemplazar,
  MARCA_INICIO,
  MARCA_FIN,
} from '../scripts/lib/preferencias.mjs';

test('agregar crea la sección y el bloque de preferencias', () => {
  const v = vaultNuevo();
  const r = agregar(v.vault, 'Escribir siempre en español', { sobre: 'flujo' });

  assert.equal(r.datos.agregada, true);
  const contenido = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');

  assert.match(contenido, /## Cómo trabaja el usuario/);
  assert.match(
    contenido,
    /Lo anota OKT con el sí del usuario \(okt preferencia\)\. Síguelo en cada sesión; si algo choca con esto, pregunta\./
  );
  assert.match(contenido, /<!-- okt:preferencias -->\n- \d{4}-\d{2}-\d{2} · flujo · Escribir siempre en español\n<!-- \/okt:preferencias -->/);

  const l = listar(v.vault);
  assert.equal(l.datos.preferencias.length, 1);
  assert.equal(l.datos.preferencias[0].sobre, 'flujo');
  assert.equal(l.datos.preferencias[0].texto, 'Escribir siempre en español');

  v.borrar();
});

test('repetir no duplica (comparando sin tildes ni mayúsculas)', () => {
  const v = vaultNuevo();
  const r1 = agregar(v.vault, 'Escribir siempre en español', { sobre: 'flujo' });
  assert.equal(r1.datos.agregada, true);

  const r2 = agregar(v.vault, 'escribir  siempre en espanol', { sobre: 'otro' });
  assert.equal(r2.datos.agregada, false);
  assert.match(r2.texto, /ya está registrada/i);

  const l = listar(v.vault);
  assert.equal(l.datos.preferencias.length, 1);

  const contenido = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
  const lineasPref = contenido
    .split(MARCA_INICIO)[1]
    .split(MARCA_FIN)[0]
    .trim()
    .split('\n');
  assert.equal(lineasPref.length, 1);

  v.borrar();
});

test('quitar y reemplazar por número', () => {
  const v = vaultNuevo();
  agregar(v.vault, 'Primera preferencia', { sobre: 'flujo' });
  agregar(v.vault, 'Segunda preferencia', { sobre: 'formato' });
  agregar(v.vault, 'Tercera preferencia', { sobre: 'fuentes' });

  // Reemplazar la número 2
  const rReemplazo = reemplazar(v.vault, 2, 'Segunda preferencia corregida');
  assert.equal(rReemplazo.datos.preferencia.n, 2);
  assert.equal(rReemplazo.datos.preferencia.sobre, 'formato');
  assert.equal(rReemplazo.datos.preferencia.texto, 'Segunda preferencia corregida');

  let l = listar(v.vault);
  assert.equal(l.datos.preferencias[1].texto, 'Segunda preferencia corregida');
  assert.equal(l.datos.preferencias[1].sobre, 'formato');

  // Quitar la número 1
  const rQuitar = quitar(v.vault, 1);
  assert.equal(rQuitar.datos.eliminada.texto, 'Primera preferencia');

  l = listar(v.vault);
  assert.equal(l.datos.preferencias.length, 2);
  assert.equal(l.datos.preferencias[0].texto, 'Segunda preferencia corregida');
  assert.equal(l.datos.preferencias[1].texto, 'Tercera preferencia');

  v.borrar();
});

test('el tope da codigo: 3', () => {
  const v = vaultNuevo();

  // Agregar 40 preferencias válidas
  for (let i = 1; i <= 40; i++) {
    const res = agregar(v.vault, `Regla específica número ${i}`, { sobre: 'otro' });
    assert.equal(res.datos.agregada, true);
  }

  // La número 41 debe fallar con codigo 3
  assert.throws(
    () => {
      agregar(v.vault, 'Regla número 41 que supera el tope', { sobre: 'otro' });
    },
    (err) => err.codigo === 3
  );

  // También si una preferencia supera el tope de caracteres (4 000)
  const v2 = vaultNuevo();
  const textoEnorme = 'x'.repeat(4005);
  assert.throws(
    () => {
      agregar(v2.vault, textoEnorme, { sobre: 'otro' });
    },
    (err) => err.codigo === 3
  );
  v2.borrar();

  v.borrar();
});

test('después de v.okt(["init", "--aplicar"]) el bloque de preferencias sigue intacto', () => {
  const v = vaultNuevo();
  agregar(v.vault, 'Preferencia crítica que debe sobrevivir a init', { sobre: 'herramientas' });

  const rInit = v.okt(['init', '--aplicar']);
  assert.equal(rInit.codigo, 0, rInit.error);

  const contenido = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
  assert.match(
    contenido,
    /<!-- okt:preferencias -->[\s\S]*- \d{4}-\d{2}-\d{2} · herramientas · Preferencia crítica que debe sobrevivir a init[\s\S]*<!-- \/okt:preferencias -->/
  );

  const l = listar(v.vault);
  assert.equal(l.datos.preferencias.length, 1);
  assert.equal(l.datos.preferencias[0].texto, 'Preferencia crítica que debe sobrevivir a init');

  v.borrar();
});

test('un AGENTS.md con CRLF conserva CRLF', () => {
  const v = vaultNuevo();
  // Sobrescribimos AGENTS.md forzando CRLF
  const textoCRLF = '# AGENTS\r\n\r\n<!-- okt:inicio -->\r\nBloque okt\r\n<!-- okt:fin -->\r\n';
  escribir(v.vault, 'AGENTS.md', textoCRLF);

  agregar(v.vault, 'Preferencia con CRLF', { sobre: 'flujo' });
  let contenido = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');

  assert.ok(contenido.includes('\r\n'), 'debe contener saltos CRLF');
  assert.equal(contenido.replace(/\r\n/g, '').includes('\n'), false, 'no debe haber saltos LF sueltos');

  reemplazar(v.vault, 1, 'Preferencia con CRLF actualizada');
  contenido = readFileSync(join(v.vault, 'AGENTS.md'), 'utf8');
  assert.ok(contenido.includes('\r\n'), 'reemplazar debe mantener CRLF');
  assert.equal(contenido.replace(/\r\n/g, '').includes('\n'), false, 'no debe haber saltos LF sueltos tras reemplazar');

  v.borrar();
});

test('prueba con ruta con ñ, tildes y emojis', () => {
  const v = vaultNuevo();
  const prefTexto = 'Atención a niños con déficit de atención 🧠 y años 2026';
  const r = agregar(v.vault, prefTexto, { sobre: 'fuentes' });
  assert.equal(r.datos.agregada, true);

  const l = listar(v.vault);
  assert.equal(l.datos.preferencias.length, 1);
  assert.equal(l.datos.preferencias[0].texto, prefTexto);

  const r2 = reemplazar(v.vault, 1, 'Modificación con más tildes: información clínica 🫀');
  assert.equal(r2.datos.preferencia.texto, 'Modificación con más tildes: información clínica 🫀');

  v.borrar();
});
