// Carpeta del sistema: bitácora, pendientes, índice y hot. Es lo único por lo que se comunican las skills,
// y solo este módulo lo escribe. okt indice también regenera el bloque «Contenido» de la nota principal de cada
// área, proyecto y tema: así la jerarquía se navega por enlaces.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { leerBloque, reemplazarBloque } from './bloques.mjs';
import { listarNotas, leerNota, esSistema, esArchivado } from './vault.mjs';
import { fechaISO, horaCorta } from './fechas.mjs';
import { escribirFrontmatter } from './frontmatter.mjs';
import { commit } from './git.mjs';
import { sobrescribir } from './rutas.mjs';
import { C, R, ubicar } from './estructura.mjs';
import { sinEmoji } from './nombres.mjs';

const MAX_BITACORA = 300;
const MAX_ACTIVIDAD = 8;
const MAX_PALABRAS_HOT = 500;
const PRINCIPALES = new Set(['area', 'proyecto', 'tema']);

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
  const nuevo = reemplazarBloque(texto, lineas.join('\n'));
  if (nuevo !== texto) sobrescribir(ruta, nuevo);
}

const enlaces = (lista) => (lista ? String(lista).split(',').map((s) => s.trim()).filter(Boolean).map((n) => `[[${n.replace(/^\[\[|\]\]$/g, '')}]]`) : []);

// ---------- bitácora ----------

export function bitacora(vault, skill, texto, notas) {
  if (!skill || !texto) throw errorUso('Uso: okt bitacora <skill> "<qué se hizo>" [--notas "A,B"]');
  const partes = [`${fechaISO()} ${horaCorta()}`, skill, texto.replace(/\s+/g, ' ').trim()];
  const e = enlaces(notas);
  if (e.length) partes.push(e.join(', '));
  const linea = `- ${partes.join(' · ')}`;
  const lineas = [linea, ...lineasBloque(vault, R.bitacora)].slice(0, MAX_BITACORA);
  guardarBloque(vault, R.bitacora, lineas, '📜 Bitácora');
  return { texto: linea, datos: { linea } };
}

// ---------- pendientes ----------

// Dos secciones: «Para ti» (lo que la IA necesita que decida el usuario) y «Para la IA» (lo que una skill debe
// hacer después). Las líneas sin sección, de versiones anteriores, cuentan como «Para la IA».
const SECCIONES = { usuario: '## Para ti', ia: '## Para la IA' };
const SKILLS = new Set(['cerebro', 'capturar', 'consultar', 'mantener', 'notebooklm', 'redactar', 'ia']);

function leerPendientes(vault) {
  const grupos = { usuario: [], ia: [] };
  let actual = 'ia';
  for (const l of lineasBloque(vault, R.pendientes)) {
    if (l === SECCIONES.usuario) actual = 'usuario';
    else if (l === SECCIONES.ia) actual = 'ia';
    else if (l.startsWith('- [')) grupos[actual].push(l);
  }
  return grupos;
}

function guardarPendientes(vault, grupos) {
  const partes = [];
  for (const k of ['usuario', 'ia']) partes.push(SECCIONES[k], '', ...(grupos[k].length ? grupos[k] : ['- (nada)']), '');
  guardarBloque(vault, R.pendientes, [partes.join('\n').trimEnd()], '✅ Pendientes');
}

const abiertosDe = (grupos) => ['usuario', 'ia'].flatMap((k) => grupos[k].map((l, i) => ({ k, i, l })).filter((x) => x.l.startsWith('- [ ]')));

export function pendientesAbiertos(vault) {
  return abiertosDe(leerPendientes(vault)).map((x) => ({ para: x.k, linea: x.l }));
}

export function pendiente(vault, accion, pos, op) {
  const grupos = leerPendientes(vault);
  if (accion === 'agregar') {
    const texto = pos.join(' ').trim();
    if (!texto) throw errorUso('Uso: okt pendiente agregar "<qué falta>" [--para usuario|ia] [--de <skill>] [--nota <nombre>]');
    // --para usuario (o «ti», «tú») va a «Para ti»; cualquier skill o «ia», a «Para la IA».
    const para = /^(usuario|ti|tu|tú|yo)$/i.test(String(op.para || '')) ? 'usuario' : 'ia';
    const partes = [fechaISO()];
    // Con --de queda a la vista quién lo dejó y para quién: «capturar → mantener», «mantener → ti».
    const destino = para === 'usuario' ? 'ti' : SKILLS.has(String(op.para)) ? op.para : 'ia';
    if (op.de) partes.push(`${op.de} → ${destino}`);
    partes.push(texto);
    const e = enlaces(op.nota);
    if (e.length) partes.push(e.join(', '));
    const linea = `- [ ] ${partes.join(' · ')}`;
    grupos[para].push(linea);
    guardarPendientes(vault, grupos);
    return { texto: `${para === 'usuario' ? 'Para ti' : 'Para la IA'}: ${linea}`, datos: { linea, para } };
  }
  if (accion === 'cerrar') {
    const n = Number(pos[0]);
    const lista = abiertosDe(grupos);
    if (!Number.isInteger(n) || n < 1 || n > lista.length) throw errorUso(`Número fuera de rango: hay ${lista.length} pendientes abiertos.`);
    const { k, i } = lista[n - 1];
    grupos[k][i] = `${grupos[k][i].replace('- [ ]', '- [x]')} · cerrado ${fechaISO()}`;
    guardarPendientes(vault, grupos);
    return { texto: `Cerrado: ${grupos[k][i]}`, datos: { linea: grupos[k][i] } };
  }
  if (accion === 'listar' || !accion) {
    const lista = op.cerrados ? ['usuario', 'ia'].flatMap((k) => grupos[k].map((l) => ({ k, l }))) : abiertosDe(grupos);
    const texto = lista.length ? lista.map((x, n) => `${n + 1}. [${x.k === 'usuario' ? 'para ti' : 'para la IA'}] ${x.l}`).join('\n') : 'No hay pendientes abiertos.';
    return { texto, datos: lista.map((x) => ({ para: x.k, linea: x.l })) };
  }
  throw errorUso('Uso: okt pendiente agregar|cerrar|listar');
}

// ---------- árbol del vault ----------

// Carpetas con nota principal (área, proyecto, tema) y las notas de cada una. La nota principal de una carpeta
// «X» es «X/X.md».
export function arbol(vault) {
  const notas = listarNotas(vault)
    .filter((r) => !esSistema(r) && !esArchivado(r))
    .map((r) => leerNota(vault, r));
  const carpetas = new Map(); // ruta de la carpeta → { nota principal, notas sueltas, subcarpetas }
  const nodo = (dir) => {
    if (!carpetas.has(dir)) carpetas.set(dir, { dir, principal: null, notas: [], hijos: new Set() });
    return carpetas.get(dir);
  };
  for (const n of notas) {
    const dir = dirname(n.rel);
    if (!dir.startsWith(`${C.areas}/`) && !dir.startsWith(`${C.proyectos}/`)) continue;
    if (basename(dir) === n.nombre) nodo(dir).principal = n;
    else nodo(dir).notas.push(n);
  }
  // Cada carpeta cuelga de la más cercana hacia arriba que también esté en el mapa (las de área y proyecto, de la raíz).
  for (const dir of [...carpetas.keys()]) {
    let arriba = dirname(dir);
    while (arriba.includes('/') && !carpetas.has(arriba)) arriba = dirname(arriba);
    if (carpetas.has(arriba)) carpetas.get(arriba).hijos.add(dir);
  }
  const total = (dir) => {
    const c = carpetas.get(dir);
    return c.notas.length + [...c.hijos].reduce((s, h) => s + total(h), 0);
  };
  const raices = (raiz) => [...carpetas.keys()].filter((d) => dirname(d) === raiz).sort((a, b) => a.localeCompare(b));
  return { notas, carpetas, total, raices };
}

const nombreDe = (c) => (c.principal ? c.principal.nombre : basename(c.dir));
const enlace = (c) => (c.principal ? `[[${c.principal.nombre}]]` : basename(c.dir));
const linea = (n) => `- [[${n.nombre}]]${(n.datos.resumen || '').trim() ? `: ${n.datos.resumen.trim()}` : ''}`;

function bloqueContenido(a, c, proyectosDelArea) {
  const partes = [];
  if (proyectosDelArea) {
    partes.push('## Proyectos', '', ...(proyectosDelArea.length ? proyectosDelArea.map((p) => `- [[${p.nombre}]] · ${p.datos.estado || 'activo'}${p.datos.resumen ? `: ${p.datos.resumen}` : ''}`) : ['- (ninguno)']), '');
  }
  partes.push('## Contenido', '');
  const hijos = [...c.hijos].map((h) => a.carpetas.get(h)).sort((x, y) => nombreDe(x).localeCompare(nombreDe(y)));
  if (hijos.length) partes.push('**Temas**', '', ...hijos.map((h) => `- ${enlace(h)} (${a.total(h.dir)} ${a.total(h.dir) === 1 ? 'nota' : 'notas'})`), '');
  const sueltas = [...c.notas].sort((x, y) => x.nombre.localeCompare(y.nombre));
  if (sueltas.length) partes.push(...(hijos.length ? ['**Notas**', ''] : []), ...sueltas.map(linea));
  if (!hijos.length && !sueltas.length) partes.push('- (vacío: lo que proceses aquí aparecerá en esta lista)');
  return partes.join('\n').trimEnd();
}

function lineasArbol(a, dir, nivel) {
  const c = a.carpetas.get(dir);
  const sangria = '  '.repeat(nivel);
  const n = a.total(dir);
  const extra = c.principal?.datos.tipo === 'proyecto' ? ` · ${c.principal.datos.estado || 'activo'}${c.principal.datos.area ? ` · área ${c.principal.datos.area}` : ''}` : '';
  const salida = [`${sangria}- ${enlace(c)} · ${n} ${n === 1 ? 'nota' : 'notas'}${extra}`];
  for (const h of [...c.hijos].sort((x, y) => x.localeCompare(y))) salida.push(...lineasArbol(a, h, nivel + 1));
  return salida;
}

// ---------- índice ----------

export function indice(vault) {
  const a = arbol(vault);
  // 1. El bloque «Contenido» de cada nota principal (y «Proyectos» en las áreas). Solo se reescribe si cambia.
  const proyectos = [...a.carpetas.values()].filter((c) => c.principal?.datos.tipo === 'proyecto').map((c) => c.principal);
  let bloques = 0;
  for (const c of a.carpetas.values()) {
    if (!c.principal || !PRINCIPALES.has(c.principal.datos.tipo)) continue;
    // Se compara sin el emoji: un proyecto con «area: [[Medicina]]» (escrito a mano) también cuenta.
    const delArea = c.principal.datos.tipo === 'area' ? proyectos.filter((p) => sinEmoji(String(p.datos.area || '').replace(/^\[\[|\]\]$/g, '')).toLowerCase() === sinEmoji(c.principal.nombre).toLowerCase()) : null;
    const abs = join(vault, c.principal.rel);
    const texto = readFileSync(abs, 'utf8');
    const nuevo = reemplazarBloque(texto, bloqueContenido(a, c, delArea));
    if (nuevo !== texto) {
      sobrescribir(abs, nuevo);
      bloques++;
    }
  }
  // 2. El árbol del vault en indice.md: lo que la IA lee para decidir dónde va cada cosa.
  const todas = listarNotas(vault);
  const bandeja = todas.filter((r) => r.startsWith(`${C.bandeja}/`)).length;
  const diario = todas.filter((r) => r.startsWith(`${C.diario}/`));
  const sueltasRaiz = a.notas.filter((n) => [C.areas, C.proyectos].includes(dirname(n.rel)));
  const partes = [`## 📥 Bandeja\n\n- ${bandeja} ${bandeja === 1 ? 'captura' : 'capturas'} sin procesar`];
  for (const [raiz, titulo] of [[C.areas, '## 🧭 Áreas'], [C.proyectos, '## 🎯 Proyectos']]) {
    const ramas = a.raices(raiz);
    partes.push(`${titulo}\n\n${ramas.length ? ramas.flatMap((d) => lineasArbol(a, d, 0)).join('\n') : '- (ninguno)'}`);
  }
  if (sueltasRaiz.length) partes.push(`## ⚠️ Fuera de lugar\n\n${sueltasRaiz.map((n) => `- [[${n.nombre}]] · ${n.rel}`).join('\n')}`);
  partes.push(`## 📅 Diario\n\n- ${diario.length} ${diario.length === 1 ? 'nota' : 'notas'}${diario.length ? ` (última: [[${basename(diario.sort().at(-1), '.md')}]])` : ''}`);
  guardarBloque(vault, R.indice, [partes.join('\n\n')], '🗂️ Índice');
  // Las notas principales (de área, proyecto o tema) no se cuentan: son el índice, no el contenido.
  const total = a.notas.filter((n) => ubicar(n.rel).raiz && basename(dirname(n.rel)) !== n.nombre).length;
  return { texto: `Índice actualizado: ${total} notas en áreas y proyectos${bloques ? `, ${bloques} índices de carpeta al día` : ''}.`, datos: { total, bloques } };
}

// ---------- hot ----------

function seccionesHot(vault) {
  const bloque = lineasBloque(vault, R.hot);
  const aprendizajes = [];
  let dentro = false;
  for (const l of bloque) {
    if (l.startsWith('## ')) dentro = l.startsWith('## Aprendizajes');
    else if (dentro && /^- \d{4}-\d{2}-\d{2}:/.test(l)) aprendizajes.push(l);
  }
  return { aprendizajes };
}

const contarPalabras = (t) => t.split(/\s+/).filter(Boolean).length;

// Primera tarea abierta de «## Próximos pasos» de un proyecto.
function siguientePaso(n) {
  const lineas = n.cuerpo.replace(/\r\n/g, '\n').split('\n');
  const i = lineas.findIndex((l) => /^##\s+Próximos pasos\s*$/.test(l));
  if (i < 0) return '';
  for (let k = i + 1; k < lineas.length && !/^#{1,2}\s/.test(lineas[k]); k++) {
    const m = /^\s*- \[ \]\s+(.+)$/.exec(lineas[k]);
    if (m) return m[1].trim();
  }
  return '';
}

export function hot(vault, op = {}) {
  const { aprendizajes } = seccionesHot(vault);
  if (op.aprendizaje) aprendizajes.unshift(`- ${fechaISO()}: ${String(op.aprendizaje).replace(/\s+/g, ' ').trim()}`);
  const a = arbol(vault);
  const foco = [...a.carpetas.values()]
    .filter((c) => c.principal?.datos.tipo === 'proyecto' && (c.principal.datos.estado || 'activo') === 'activo')
    .map((c) => {
      const paso = siguientePaso(c.principal);
      return `- [[${c.principal.nombre}]]: ${paso || 'sin próximo paso anotado'}`;
    });
  const actividad = lineasBloque(vault, R.bitacora).slice(0, MAX_ACTIVIDAD);
  const pendientes = pendientesAbiertos(vault).map((p) => `${p.linea}${p.para === 'usuario' ? ' (para ti)' : ''}`);
  const disputa = a.notas.filter((n) => n.datos.estado === 'disputado').map((n) => `- [[${n.nombre}]]`);

  const seccion = (titulo, lista) => (lista.length ? [titulo, '', ...lista, ''] : []);
  const armar = () =>
    [
      ...seccion('## En foco', foco),
      ...seccion('## Actividad reciente', actividad),
      ...seccion('## Pendientes', pendientes),
      ...seccion('## Aprendizajes', aprendizajes),
      ...seccion('## En disputa', disputa),
    ]
      .join('\n')
      .trimEnd() || '- Vault recién creado: aún no hay actividad.';

  // Poda en orden de menor a mayor valor: actividad, disputa, pendientes, foco y, al final, aprendizajes.
  let texto = armar();
  for (const lista of [actividad, disputa, pendientes, foco, aprendizajes]) {
    while (contarPalabras(texto) > MAX_PALABRAS_HOT && lista.length > 1) {
      lista.pop();
      texto = armar();
    }
  }
  guardarBloque(vault, R.hot, [texto], '🔥 Contexto reciente');
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
