import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, vaultNuevo, escribir, temporal, okt } from './ayuda.mjs';
import { COMANDOS } from '../scripts/lib/comandos.mjs';
import { FRASE_RAIZ } from '../scripts/lib/instalar.mjs';
import { leerFrontmatter } from '../scripts/lib/frontmatter.mjs';

const SKILLS = ['cerebro', 'capturar', 'consultar', 'mantener', 'notebooklm', 'redactar'];
const leerSkill = (s) => readFileSync(join(RAIZ, 'skills', s, 'SKILL.md'), 'utf8');
const bloque = (t) => t.match(/<!-- okt:contrato -->[\s\S]*?<!-- \/okt:contrato -->/)?.[0];

test('las 6 skills existen con name igual a su carpeta y una description útil', () => {
  assert.deepEqual(readdirSync(join(RAIZ, 'skills')).sort(), [...SKILLS].sort());
  for (const s of SKILLS) {
    const { datos } = leerFrontmatter(leerSkill(s));
    assert.equal(datos.name, s);
    assert.ok(datos.description.length > 150 && datos.description.length <= 1024, `${s}: description de ${datos.description.length}`);
  }
});

test('el bloque del contrato es idéntico en las 6 skills y define <raíz> con la frase que adapta el instalador', () => {
  const primero = bloque(leerSkill(SKILLS[0]));
  assert.ok(primero, 'falta el bloque en cerebro');
  assert.ok(primero.includes(FRASE_RAIZ));
  for (const s of SKILLS) assert.equal(bloque(leerSkill(s)), primero, `el bloque de ${s} se desvió`);
});

test('las rutas que citan las skills existen', () => {
  for (const s of SKILLS) {
    const t = leerSkill(s);
    for (const m of t.matchAll(/`(references\/[^`]+\.md)`/g)) assert.ok(existsSync(join(RAIZ, 'skills', s, m[1])), `${s}: falta ${m[1]}`);
    for (const m of t.matchAll(/`<raíz>\/([^`<]+?\.md)`/g)) assert.ok(existsSync(join(RAIZ, m[1])), `${s}: falta <raíz>/${m[1]}`);
  }
});

test('los comandos okt que citan las skills existen en el CLI', () => {
  for (const s of SKILLS) {
    for (const m of leerSkill(s).matchAll(/`okt ([a-z]+)/g)) assert.ok(COMANDOS[m[1]], `${s} cita «okt ${m[1]}», que no existe`);
  }
  for (const m of readFileSync(join(RAIZ, 'references', 'contrato-vault.md'), 'utf8').matchAll(/`okt ([a-z]+)/g)) {
    assert.ok(COMANDOS[m[1]], `el contrato cita «okt ${m[1]}», que no existe`);
  }
});

test('ninguna skill, el contrato ni las plantillas del vault conservan la estructura de la 0.3 ni filtros de contenido', () => {
  const archivos = [
    ...SKILLS.map((s) => join('skills', s, 'SKILL.md')),
    ...SKILLS.flatMap((s) => (existsSync(join(RAIZ, 'skills', s, 'references')) ? readdirSync(join(RAIZ, 'skills', s, 'references')).map((f) => join('skills', s, 'references', f)) : [])),
    join('references', 'contrato-vault.md'),
    join('plantillas', 'vault', 'AGENTS.md.tmpl'),
  ];
  const prohibidos = [/📚 Fuentes\/📎/, /Bandeja\/(📝 notas|📦 importados|📲 telegram|💻 sesiones)/, /💡 conceptos|🏷️ entidades|🧩 sintesis/, /nota nueva (concepto|entidad|sintesis)/, /pacientes?/i, /\bDNI\b/, /--forzar/, /datos_sensibles/, /\b(10|20|50|90|99) │/];
  for (const f of archivos) {
    const texto = readFileSync(join(RAIZ, f), 'utf8');
    for (const p of prohibidos) assert.doesNotMatch(texto, p, `${f} todavía menciona ${p}`);
  }
});

test('adjuntar copia sin tocar el original y no duplica el mismo contenido', () => {
  const v = vaultNuevo();
  const pdf = escribir(v.dir, 'Guía – anemia.pdf', '%PDF-1');
  let r = v.okt(['adjuntar', pdf, '--json']);
  assert.equal(r.codigo, 0, r.error);
  const d = JSON.parse(r.salida);
  assert.equal(d.ruta, '05 │ ⚙️ Sistema/📎 adjuntos/📕 pdf/Guía - anemia.pdf');
  assert.ok(existsSync(pdf));
  const copia = escribir(v.dir, 'otra copia.pdf', '%PDF-1');
  r = v.okt(['adjuntar', copia]);
  assert.match(r.salida, /Ya estaba: 05 │ ⚙️ Sistema\/📎 adjuntos\/📕 pdf\/Guía - anemia\.pdf/);
  r = v.okt(['adjuntar', escribir(v.dir, 'Foto.PNG', 'img'), '--json']);
  assert.equal(JSON.parse(r.salida).ruta, '05 │ ⚙️ Sistema/📎 adjuntos/🖼️ imagenes/Foto.png');
  v.borrar();
});

test('archivar ordena por motivo (Descartes, Terminados, Inactivos), marca estado archivado y protege la raíz y el sistema', () => {
  const v = vaultNuevo();
  v.okt(['nota', 'nueva', 'proyecto', 'Curso viejo']);
  // Acepta el nombre sin emoji y la ruta de las estructuras anteriores.
  let r = v.okt(['archivar', '10-Proyectos/Curso viejo']);
  assert.equal(r.codigo, 0, r.error);
  const movida = join(v.vault, '04 │ 🗄️ Archivo/✅ Terminados/🎯 Curso viejo/🎯 Curso viejo.md');
  assert.ok(existsSync(movida));
  assert.match(readFileSync(movida, 'utf8'), /estado: archivado/);
  v.okt(['tema', 'nuevo', 'Medicina/🫀 Cardiología']);
  assert.equal(v.okt(['archivar', '20 │ 🧭 Areas/Medicina/Cardiología']).codigo, 0);
  assert.ok(existsSync(join(v.vault, '04 │ 🗄️ Archivo/💤 Inactivos/🧭 Medicina/🫀 Cardiología/🫀 Cardiología.md')));
  // Lo de la Bandeja va a Descartes, sin pisar lo que ya estaba.
  for (const t of ['uno', 'dos']) {
    escribir(v.vault, '00 │ 📥 Bandeja/📝 idea.md', t);
    assert.equal(v.okt(['archivar', '00 │ 📥 Bandeja/📝 idea.md']).codigo, 0);
  }
  assert.equal(readFileSync(join(v.vault, '04 │ 🗄️ Archivo/🗑️ Descartes/📝 idea 2.md'), 'utf8'), 'dos');
  for (const prohibido of ['05 │ ⚙️ Sistema/🔥 hot.md', 'AGENTS.md', '01 │ 🎯 Proyectos', '../x']) {
    r = v.okt(['archivar', prohibido]);
    assert.notEqual(r.codigo, 0, `debió rechazar ${prohibido}`);
  }
  v.borrar();
});

test('instalar antigravity: vista previa, y con --aplicar instala OKT como plugin de agy y quita las skills sueltas', () => {
  const t = temporal();
  const agy = join(t.dir, 'agy-config');
  const env = { OKT_HOME: join(t.dir, 'okt'), OKT_AGY_SKILLS: join(t.dir, 'skills'), OKT_AGY_CONFIG_DIR: agy };
  // Lo que dejaba la instalación anterior (0.6.0 y antes).
  escribir(t.dir, 'skills/okt-cerebro/SKILL.md', 'vieja');
  escribir(t.dir, 'skills/otra-skill/SKILL.md', 'del usuario');
  escribir(t.dir, 'okt/plugin/package.json', '{}');
  let r = okt(['instalar', 'antigravity'], { cwd: t.dir, configDir: join(t.dir, 'cfg'), env });
  assert.match(r.salida, /Vista previa/);
  assert.match(r.salida, /Quitar la instalación anterior/);
  assert.equal(existsSync(join(agy, 'plugins')), false);
  r = okt(['instalar', 'antigravity', '--aplicar'], { cwd: t.dir, configDir: join(t.dir, 'cfg'), env });
  assert.equal(r.codigo, 0, r.error);
  const plugin = join(agy, 'plugins', 'obsidian-knowledge-terminal');
  const manifiesto = JSON.parse(readFileSync(join(plugin, 'plugin.json'), 'utf8'));
  assert.equal(manifiesto.name, 'obsidian-knowledge-terminal');
  assert.equal(manifiesto.version, JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version);
  assert.ok(existsSync(join(plugin, 'scripts', 'okt.mjs')));
  for (const s of SKILLS) {
    // Dentro del plugin, «dos niveles arriba» de la skill es la raíz: el SKILL.md va tal cual.
    assert.equal(readFileSync(join(plugin, 'skills', s, 'SKILL.md'), 'utf8'), readFileSync(join(RAIZ, 'skills', s, 'SKILL.md'), 'utf8'));
  }
  assert.ok(readFileSync(join(plugin, 'skills', 'cerebro', 'SKILL.md'), 'utf8').includes(FRASE_RAIZ));
  assert.ok(!existsSync(join(t.dir, 'skills', 'okt-cerebro')), 'quita las skills sueltas de antes');
  assert.ok(existsSync(join(t.dir, 'skills', 'otra-skill')), 'no toca las skills del usuario');
  assert.ok(!existsSync(join(t.dir, 'okt', 'plugin')), 'quita la copia vieja');
  t.borrar();
});
