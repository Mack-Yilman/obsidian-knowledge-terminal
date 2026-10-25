import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { vaultNuevo, escribir } from './ayuda.mjs';

const leer = (v, rel) => readFileSync(join(v.vault, rel), 'utf8');

test('bitacora agrega la línea nueva primero, con enlaces a las notas', () => {
  const v = vaultNuevo();
  const r = v.okt(['bitacora', 'capturar', 'guardó un PDF', '--notas', 'Sepsis,Guía A']);
  assert.equal(r.codigo, 0, r.error);
  const lineas = leer(v, '99 │ ⚙️ Sistema/📜 bitacora.md').split('\n').filter((l) => l.startsWith('- '));
  assert.equal(lineas[0], '- 2026-10-22 10:30 · capturar · guardó un PDF · [[Sepsis]], [[Guía A]]');
  assert.match(lineas[1], /init/);
  v.borrar();
});

test('pendiente agregar y cerrar por número', () => {
  const v = vaultNuevo();
  v.okt(['pendiente', 'agregar', 'compilar el PDF de anemia', '--de', 'capturar', '--para', 'mantener', '--nota', 'Guía anemia']);
  v.okt(['pendiente', 'agregar', 'revisar contradicción']);
  let r = v.okt(['pendiente', 'listar']);
  assert.match(r.salida, /1\. .*capturar → mantener · compilar el PDF de anemia · \[\[Guía anemia\]\]/);
  assert.match(r.salida, /2\. .*revisar contradicción/);
  r = v.okt(['pendiente', 'cerrar', '1']);
  assert.equal(r.codigo, 0, r.error);
  const texto = leer(v, '99 │ ⚙️ Sistema/✅ pendientes.md');
  assert.match(texto, /- \[x\] 2026-10-22 · capturar → mantener/);
  r = v.okt(['pendiente', 'listar']);
  assert.doesNotMatch(r.salida, /compilar/);
  v.borrar();
});

test('nota nueva crea la nota con las propiedades del contrato dentro de su área', () => {
  const v = vaultNuevo();
  let r = v.okt(['nota', 'nueva', 'nota', '🦠 Sepsis: definición', '--resumen', 'Disfunción orgánica por infección.', '--carpeta', 'Medicina']);
  assert.equal(r.codigo, 0, r.error);
  const rel = '20 │ 🧭 Areas/🧭 Medicina/🦠 Sepsis - definición.md';
  assert.ok(existsSync(join(v.vault, rel)), r.salida);
  const texto = leer(v, rel);
  assert.match(texto, /^---\ntipo: nota\ncreado: 2026-10-22\nactualizado: 2026-10-22\nestado: borrador\nresumen: Disfunción orgánica por infección\.\naliases:\n  - Sepsis - definición\n---\n/);
  assert.match(texto, /# 🦠 Sepsis - definición\n\n\n## Relacionado/);
  assert.doesNotMatch(texto, /Historial|area:/, 'sin relleno: el historial lo guarda git y la carpeta dice el área');
  // La misma nota aunque cambie el emoji: no se duplica (los tipos de la 0.3 se aceptan como nota).
  for (const titulo of ['Sepsis - definición', '💡 Sepsis - definición']) {
    r = v.okt(['nota', 'nueva', 'concepto', titulo, '--carpeta', 'Medicina']);
    assert.notEqual(r.codigo, 0);
    assert.match(r.error, /ya existe/i);
  }
  // Una carpeta que no existe, o la raíz de las áreas, se rechaza.
  assert.equal(v.okt(['nota', 'nueva', 'nota', 'X', '--carpeta', 'Medicina/Neurología']).codigo, 2);
  assert.equal(v.okt(['nota', 'nueva', 'nota', 'X', '--carpeta', 'areas']).codigo, 2);
  v.borrar();
});

test('sin --carpeta, una nota o una fuente entra a la Bandeja para ubicarla después', () => {
  const v = vaultNuevo();
  let r = v.okt(['nota', 'nueva', 'nota', 'idea suelta']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Bandeja/);
  assert.match(leer(v, '00 │ 📥 Bandeja/📝 idea suelta.md'), /tipo: captura\ncreado: 2026-10-22\norigen: nota/);
  r = v.okt(['nota', 'nueva', 'fuente', '🩸 Guía de anemia', '--origen', 'pdf']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, '00 │ 📥 Bandeja/📄 Guía de anemia.md'), /tipo: fuente/, 'en las fuentes el emoji es el del tipo');
  v.borrar();
});

test('nota nueva proyecto y área crean su carpeta con su emoji temático; diario usa la fecha', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'proyecto', '🐍 Curso de Python', '--area', 'Personal']);
  const curso = leer(v, '10 │ 🎯 Proyectos/🐍 Curso de Python/🐍 Curso de Python.md');
  assert.match(curso, /area: "\[\[🧭 Personal\]\]"/, 'el área se enlaza con su nombre exacto, con emoji');
  assert.match(curso, /## Objetivo\n\n## Próximos pasos\n\n## Decisiones/);
  // Sin emoji temático, el del tipo.
  v.okt(['nota', 'nueva', 'proyecto', 'Tesis']);
  assert.ok(existsSync(join(v.vault, '10 │ 🎯 Proyectos/🎯 Tesis/🎯 Tesis.md')));
  // Un área nueva entra a la configuración y al bloque de AGENTS.md.
  const r = v.okt(['nota', 'nueva', 'area', '💰 Finanzas']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, '20 │ 🧭 Areas/💰 Finanzas/💰 Finanzas.md')));
  assert.ok(JSON.parse(leer(v, '.cerebro/config.json')).areas.includes('💰 Finanzas'));
  assert.match(leer(v, 'AGENTS.md'), /\[\[💰 Finanzas\]\]/);
  v.okt(['nota', 'nueva', 'diario']);
  assert.match(leer(v, '50 │ 📅 Diario/📅 2026-10-22.md'), /## Tareas\n\n## Notas\n\n## Aprendí/);
  v.okt(['nota', 'nueva', 'semanal']);
  assert.ok(existsSync(join(v.vault, '50 │ 📅 Diario/🗓️ 2026-W43.md')));
  v.borrar();
});

test('tema nuevo: carpetas anidadas sin límite, con su nota principal; una nota que crece pasa a ser tema', () => {
  const v = vaultNuevo();
  let r = v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  assert.equal(r.codigo, 0, r.error);
  r = v.okt(['tema', 'nuevo', 'Medicina/Cardiología/💔 Síndrome coronario agudo']);
  assert.equal(r.codigo, 0, r.error);
  const sca = '20 │ 🧭 Areas/🧭 Medicina/🫀 Cardiología/💔 Síndrome coronario agudo';
  assert.match(leer(v, `${sca}/💔 Síndrome coronario agudo.md`), /tipo: tema/);
  // Una nota que se parte en varias pasa a ser la nota principal de su propio tema (tercer nivel).
  v.okt(['nota', 'nueva', 'nota', '🫀 Infarto agudo de miocardio', '--carpeta', 'Medicina/Cardiología/Síndrome coronario agudo', '--resumen', 'Necrosis.']);
  escribir(v.vault, `${sca}/🫀 Infarto agudo de miocardio.md`, `${leer(v, `${sca}/🫀 Infarto agudo de miocardio.md`)}\nMi texto.\n`);
  r = v.okt(['tema', 'nuevo', 'Medicina/Cardiología/Síndrome coronario agudo/Infarto agudo de miocardio']);
  assert.equal(r.codigo, 0, r.error);
  const ima = leer(v, `${sca}/🫀 Infarto agudo de miocardio/🫀 Infarto agudo de miocardio.md`);
  assert.match(ima, /tipo: tema/);
  assert.match(ima, /Mi texto\./, 'conserva su contenido');
  // Sin límite de niveles (0.5.0): un cuarto y un quinto nivel, como Curso → Módulo → Clase → …
  r = v.okt(['tema', 'nuevo', 'Medicina/Cardiología/Síndrome coronario agudo/Infarto agudo de miocardio/🔎 Diagnóstico']);
  assert.equal(r.codigo, 0, r.error);
  r = v.okt(['tema', 'nuevo', 'Medicina/Cardiología/Síndrome coronario agudo/Infarto agudo de miocardio/Diagnóstico/🧪 Troponina']);
  assert.equal(r.codigo, 0, r.error);
  r = v.okt(['nota', 'nueva', 'nota', '📈 Curva de troponina', '--carpeta', 'Medicina/Cardiología/Síndrome coronario agudo/Infarto agudo de miocardio/Diagnóstico/Troponina']);
  assert.equal(r.codigo, 0, r.error);
  assert.ok(existsSync(join(v.vault, `${sca}/🫀 Infarto agudo de miocardio/🔎 Diagnóstico/🧪 Troponina/📈 Curva de troponina.md`)));
  v.borrar();
});

test('indice: bloque «Contenido» en cada área, proyecto y tema, y el árbol del vault en indice.md', () => {
  const v = vaultNuevo();
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  v.okt(['nota', 'nueva', 'nota', '🩸 Anemia', '--carpeta', 'Medicina', '--resumen', 'Hb baja para edad y sexo.']);
  v.okt(['nota', 'nueva', 'nota', '💓 Arritmias', '--carpeta', 'Medicina/Cardiología', '--resumen', 'Ritmo anormal.']);
  v.okt(['nota', 'nueva', 'proyecto', '🎓 Tesis', '--area', '🧭 Medicina']);
  v.okt(['nota', 'nueva', 'captura', 'algo']);
  const r = v.okt(['indice']);
  assert.equal(r.codigo, 0, r.error);
  const medicina = leer(v, '20 │ 🧭 Areas/🧭 Medicina/🧭 Medicina.md');
  assert.match(medicina, /## Proyectos\n\n- \[\[🎓 Tesis\]\] · activo/);
  assert.match(medicina, /\*\*Temas\*\*\n\n- \[\[🫀 Cardiología\]\] \(1 nota\)/);
  assert.match(medicina, /\*\*Notas\*\*\n\n- \[\[🩸 Anemia\]\]: Hb baja para edad y sexo\./);
  assert.match(leer(v, '20 │ 🧭 Areas/🧭 Medicina/🫀 Cardiología/🫀 Cardiología.md'), /## Contenido\n\n- \[\[💓 Arritmias\]\]: Ritmo anormal\./);
  const indice = leer(v, '99 │ ⚙️ Sistema/🗂️ indice.md');
  assert.match(indice, /## 📥 Bandeja\n\n- 1 captura sin procesar/);
  assert.match(indice, /- \[\[🧭 Medicina\]\] · 2 notas\n {2}- \[\[🫀 Cardiología\]\] · 1 nota/);
  assert.match(indice, /- \[\[🎓 Tesis\]\] · 0 notas · activo · área \[\[🧭 Medicina\]\]/);
  assert.doesNotMatch(indice, /🩸 Anemia/, 'el árbol no repite cada nota: eso va en el índice de su carpeta');
  // Sin cambios no reescribe nada (no deja git con cambios en cada cierre).
  assert.match(v.okt(['indice']).salida, /^Índice actualizado: 2 notas en áreas y proyectos\.$/m);
  v.borrar();
});

test('pendientes en dos secciones: «Para ti» y «Para la IA»', () => {
  const v = vaultNuevo();
  v.okt(['pendiente', 'agregar', '¿Anemia va en Medicina o en Tesis?', '--para', 'usuario']);
  v.okt(['pendiente', 'agregar', 'compilar la guía', '--de', 'capturar', '--para', 'mantener']);
  const texto = leer(v, '99 │ ⚙️ Sistema/✅ pendientes.md');
  assert.match(texto, /## Para ti\n\n- \[ \] 2026-10-22 · ¿Anemia va en Medicina o en Tesis\?\n\n## Para la IA\n\n- \[ \] 2026-10-22 · capturar → mantener · compilar la guía/);
  const r = v.okt(['pendiente', 'listar']);
  assert.match(r.salida, /1\. \[para ti\] .*Anemia.*\n2\. \[para la IA\] .*compilar/);
  v.borrar();
});

test('hot: proyectos en foco, actividad, pendientes y aprendizajes, con el tope de palabras', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'proyecto', '🎓 Tesis']);
  const tesis = '10 │ 🎯 Proyectos/🎓 Tesis/🎓 Tesis.md';
  escribir(v.vault, tesis, leer(v, tesis).replace('## Próximos pasos\n', '## Próximos pasos\n\n- [x] Elegir tema\n- [ ] Escribir el planteamiento\n'));
  for (let i = 0; i < 80; i++) v.okt(['bitacora', 'capturar', `operación número ${i} con varias palabras de relleno para crecer`]);
  v.okt(['pendiente', 'agregar', 'procesar la bandeja']);
  let r = v.okt(['hot', '--aprendizaje', 'La ferritina baja confirma ferropenia.']);
  assert.equal(r.codigo, 0, r.error);
  r = v.okt(['hot', '--aprendizaje', 'Segundo aprendizaje.']);
  const texto = leer(v, '99 │ ⚙️ Sistema/🔥 hot.md');
  assert.match(texto, /## En foco\n\n- \[\[🎓 Tesis\]\]: Escribir el planteamiento/);
  assert.match(texto, /## Pendientes\n\n- \[ \] 2026-10-22 · procesar la bandeja/);
  assert.match(texto, /## Aprendizajes\n\n- 2026-10-22: Segundo aprendizaje\.\n- 2026-10-22: La ferritina/);
  assert.match(texto, /operación número 79/);
  assert.doesNotMatch(texto, /## En disputa/, 'las secciones vacías no aparecen');
  const palabras = texto.split('<!-- okt:inicio -->')[1].split(/\s+/).filter(Boolean).length;
  assert.ok(palabras <= 520, `hot tiene ${palabras} palabras`);
  v.borrar();
});

test('cerrar hace bitácora + índices + hot en un paso', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'nota', '🧲 Hierro', '--carpeta', 'Medicina', '--resumen', 'Mineral esencial.']);
  const r = v.okt(['cerrar', 'capturar', 'creó la nota de hierro', '--notas', '🧲 Hierro']);
  assert.equal(r.codigo, 0, r.error);
  assert.match(leer(v, '99 │ ⚙️ Sistema/📜 bitacora.md'), /capturar · creó la nota de hierro · \[\[🧲 Hierro\]\]/);
  assert.match(leer(v, '20 │ 🧭 Areas/🧭 Medicina/🧭 Medicina.md'), /\[\[🧲 Hierro\]\]: Mineral esencial\./);
  assert.match(leer(v, '99 │ ⚙️ Sistema/🔥 hot.md'), /creó la nota de hierro/);
  v.borrar();
});

test('el texto del usuario fuera de las marcas se conserva', () => {
  const v = vaultNuevo();
  const ruta = '99 │ ⚙️ Sistema/🗂️ indice.md';
  escribir(v.vault, ruta, `${leer(v, ruta)}\nMi comentario al final.\n`);
  v.okt(['indice']);
  assert.match(leer(v, ruta), /Mi comentario al final\./);
  v.borrar();
});
