// 99-Sistema: bitácora, pendientes, índice y hot. Es lo único por lo que se comunican las skills,
// y solo este módulo lo escribe.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { leerBloque, reemplazarBloque } from './bloques.mjs';
import { listarNotas, leerNota, esSistema } from './vault.mjs';
import { fechaISO, horaCorta } from './fechas.mjs';
import { escribirFrontmatter } from './frontmatter.mjs';
import { commit } from './git.mjs';

const MAX_BITACORA = 1000;
const MAX_ACTIVIDAD = 12;
const MAX_PALABRAS_HOT = 500;

function errorUso(mensaje) {
  const e = new Error(mensaje);
  e.codigo = 2;
  return e;
}

function lineasBloque(vault, rel) {
  const ruta = join(vault, rel);
  if (!existsSync(ruta)) return [];
  return (leerBloque(readFileSync(ruta, 'utf8')) || '').split('\n').filter((l) => l.trim());
}

function guardarBloque(vault, rel, lineas, titulo) {
  const ruta = join(vault, rel);
  let texto;
  if (existsSync(ruta)) texto = readFileSync(ruta, 'utf8');
  else {
    mkdirSync(dirname(ruta), { recursive: true });
    texto = escribirFrontmatter({ tipo: 'sistema', creado: fechaISO() }, `\n# ${titulo}\n`);
  }
  writeFileSync(ruta, reemplazarBloque(texto, lineas.join('\n')));
}

const enlaces = (lista) => (lista ? String(lista).split(',').map((s) => s.trim()).filter(Boolean).map((n) => `[[${n.replace(/^\[\[|\]\]$/g, '')}]]`) : []);

// ---------- bitácora ----------

export function bitacora(vault, skill, texto, notas) {
  if (!skill || !texto) throw errorUso('Uso: okt bitacora <skill> "<qué se hizo>" [--notas "A,B"]');
  const partes = [`${fechaISO()} ${horaCorta()}`, skill, texto.replace(/\s+/g, ' ').trim()];
  const e = enlaces(notas);
  if (e.length) partes.push(e.join(', '));
  const linea = `- ${partes.join(' · ')}`;
  const lineas = [linea, ...lineasBloque(vault, '99-Sistema/bitacora.md')].slice(0, MAX_BITACORA);
  guardarBloque(vault, '99-Sistema/bitacora.md', lineas, 'Bitácora');
  return { texto: linea, datos: { linea } };
}

// ---------- pendientes ----------

const abiertos = (lineas) => lineas.map((l, i) => ({ l, i })).filter((x) => x.l.startsWith('- [ ]'));

export function pendiente(vault, accion, pos, op) {
  const rel = '99-Sistema/pendientes.md';
  const lineas = lineasBloque(vault, rel);
  if (accion === 'agregar') {
    const texto = pos.join(' ').trim();
    if (!texto) throw errorUso('Uso: okt pendiente agregar "<qué falta>" [--de <skill>] [--para <skill>] [--nota <nombre>]');
    const partes = [fechaISO()];
    if (op.de || op.para) partes.push(`${op.de || '?'} → ${op.para || '?'}`);
    partes.push(texto);
    const e = enlaces(op.nota);
    if (e.length) partes.push(e.join(', '));
    const linea = `- [ ] ${partes.join(' · ')}`;
    guardarBloque(vault, rel, [...lineas, linea], 'Pendientes');
    return { texto: linea, datos: { linea } };
  }
  if (accion === 'cerrar') {
    const n = Number(pos[0]);
    const lista = abiertos(lineas);
    if (!Number.isInteger(n) || n < 1 || n > lista.length) throw errorUso(`Número fuera de rango: hay ${lista.length} pendientes abiertos.`);
    const { i } = lista[n - 1];
    lineas[i] = `${lineas[i].replace('- [ ]', '- [x]')} · cerrado ${fechaISO()}`;
    guardarBloque(vault, rel, lineas, 'Pendientes');
    return { texto: `Cerrado: ${lineas[i]}`, datos: { linea: lineas[i] } };
  }
  if (accion === 'listar' || !accion) {
    const lista = op.cerrados ? lineas.map((l, i) => ({ l, i })) : abiertos(lineas);
    const texto = lista.length ? lista.map((x, k) => `${k + 1}. ${x.l}`).join('\n') : 'No hay pendientes abiertos.';
    return { texto, datos: lista.map((x) => x.l) };
  }
  throw errorUso('Uso: okt pendiente agregar|cerrar|listar');
}

// ---------- índice ----------

export function indice(vault) {
  const grupos = new Map();
  for (const rel of listarNotas(vault)) {
    if (esSistema(rel)) continue;
    const top = rel.includes('/') ? rel.split('/')[0] : '(raíz)';
    const n = leerNota(vault, rel);
    const resumen = (n.datos.resumen || '').trim();
    if (!grupos.has(top)) grupos.set(top, []);
    grupos.get(top).push(`- [[${n.nombre}]]${resumen ? ` — ${resumen}` : ''}`);
  }
  const partes = [];
  let total = 0;
  for (const top of [...grupos.keys()].sort()) {
    partes.push(`## ${top}\n\n${grupos.get(top).join('\n')}`);
    total += grupos.get(top).length;
  }
  guardarBloque(vault, '99-Sistema/indice.md', [partes.join('\n\n') || '- (vacío)'], 'Índice');
  return { texto: `Índice actualizado: ${total} notas.`, datos: { total } };
}

// ---------- hot ----------

function seccionesHot(vault) {
  const bloque = lineasBloque(vault, '99-Sistema/hot.md');
  const aprendizajes = [];
  let dentro = false;
  for (const l of bloque) {
    if (l.startsWith('## ')) dentro = l.startsWith('## Aprendizajes');
    else if (dentro && /^- \d{4}-\d{2}-\d{2}:/.test(l)) aprendizajes.push(l);
  }
  return { aprendizajes };
}

const contarPalabras = (t) => t.split(/\s+/).filter(Boolean).length;

export function hot(vault, op = {}) {
  const { aprendizajes } = seccionesHot(vault);
  if (op.aprendizaje) aprendizajes.unshift(`- ${fechaISO()}: ${String(op.aprendizaje).replace(/\s+/g, ' ').trim()}`);
  const actividad = lineasBloque(vault, '99-Sistema/bitacora.md').slice(0, MAX_ACTIVIDAD);
  const hilos = abiertos(lineasBloque(vault, '99-Sistema/pendientes.md')).map((x) => x.l);
  const contradicciones = listarNotas(vault)
    .filter((r) => !esSistema(r))
    .map((r) => leerNota(vault, r))
    .filter((n) => n.datos.estado === 'disputado')
    .map((n) => `- [[${n.nombre}]]`);

  const armar = () =>
    [
      '## Actividad reciente', '', ...(actividad.length ? actividad : ['- (sin actividad)']), '',
      '## Hilos abiertos', '', ...(hilos.length ? hilos : ['- Sin pendientes.']), '',
      '## Aprendizajes', '', ...(aprendizajes.length ? aprendizajes : ['- Aún no hay aprendizajes.']), '',
      '## Contradicciones', '', ...(contradicciones.length ? contradicciones : ['- Ninguna.']),
    ].join('\n');

  // Poda en orden de menor a mayor valor: actividad, contradicciones, hilos y, al final, aprendizajes.
  let texto = armar();
  for (const lista of [actividad, contradicciones, hilos, aprendizajes]) {
    while (contarPalabras(texto) > MAX_PALABRAS_HOT && lista.length > 1) {
      lista.pop();
      texto = armar();
    }
  }
  guardarBloque(vault, '99-Sistema/hot.md', [texto], 'Contexto reciente');
  return { texto: `hot.md actualizado (${contarPalabras(texto)} palabras).`, datos: { palabras: contarPalabras(texto) } };
}

// ---------- cerrar una operación ----------

export function cerrar(vault, skill, texto, op = {}) {
  const b = bitacora(vault, skill, texto, op.notas);
  indice(vault);
  hot(vault, op);
  const c = commit(vault, `okt ${skill}: ${texto}`.slice(0, 200));
  const git = c.hecho ? ' Commit hecho.' : c.error ? ` Git: ${c.error}` : '';
  return { texto: `${b.texto}\nÍndice y hot actualizados.${git}`, datos: { linea: b.datos.linea, commit: c } };
}
