// okt migrar: lleva un vault de una versión anterior a la estructura actual, por pasos:
//   v1 (0.2.x) → v2 (0.3.x): carpetas y notas con emojis;
//   v2 (0.3.x) → v3 (0.4.x): el conocimiento y las fuentes pasan a las áreas y los proyectos, cada área es una
//   carpeta, la bandeja se aplana y los adjuntos van al Sistema;
//   raíces (0.7.0): las carpetas raíz pasan a 00–05 y lo archivado con su ruta completa va a la carpeta de su motivo.
//   Corre antes que v2 → v3, que ya trabaja con las raíces nuevas.
// okt renombrar: cambia el nombre de una nota y actualiza sus enlaces. Nada se borra: todo se mueve con
// renameSync, los registros se actualizan y la migración termina en un commit (se deshace con git). Es
// reanudable: el plan de cada paso se guarda en .cerebro/migracion.json antes de mover nada, y una segunda
// corrida termina lo que haya quedado a medias.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { leerConfigVault, guardarConfigVault, sobrescribir, posix, RAIZ_PLUGIN } from './rutas.mjs';
import { C, C3, R, C2, R2, CARPETAS, CARPETAS2, EMOJI, ANTIGUAS, conEmoji, destinoArchivo, traducir, traducirV3, necesitaMigrar, versionDe, VERSION_ESTRUCTURA } from './estructura.mjs';
import { empiezaConEmoji, sinEmoji, limpiarNombre, nombreValido } from './nombres.mjs';
import { listarNotas, mismasNotas, esSistema } from './vault.mjs';
import { actualizarAgents } from './init.mjs';
import { cerrar, pendiente } from './sistema.mjs';

const errorUso = (m) => Object.assign(new Error(m), { codigo: 2 });
const RAICES_ANTIGUAS = ['00-Bandeja', '10-Proyectos', '20-Areas', '30-Conocimiento', '40-Fuentes', '50-Diario', '90-Archivo', '99-Sistema'];
const ORIGENES_CON_EMOJI = new Set(['notion', 'drive', 'notebooklm', 'telegram']);
const rutaPlan = (vault) => join(vault, '.cerebro', 'migracion.json');

function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return null;
  }
}

const guardarJson = (ruta, datos) => sobrescribir(ruta, `${JSON.stringify(datos, null, 2)}\n`);

// Archivos (rutas posix relativas al vault) bajo una carpeta, sin las ocultas.
function archivosBajo(vault, rel) {
  const salida = [];
  const recorrer = (r) => {
    let entradas;
    try {
      entradas = readdirSync(join(vault, r), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (e.name.startsWith('.')) continue;
      const hijo = `${r}/${e.name}`;
      if (e.isDirectory()) recorrer(hijo);
      else salida.push(hijo);
    }
  };
  recorrer(rel);
  return salida.sort();
}

// Qué emoji le toca a una nota según su frontmatter (null: no se renombra).
function tipoEmojiDe(texto) {
  const { datos, cuerpo } = leerFrontmatter(texto);
  if (datos.tipo === 'nota' && ORIGENES_CON_EMOJI.has(datos.origen)) return datos.origen;
  if (datos.tipo === 'fuente' && /^## Método\s*$/m.test(cuerpo)) return 'articulo';
  return EMOJI[datos.tipo] ? datos.tipo : null;
}

// [[destino#sección|alias]] y ![[destino]] fuera de los bloques de código: cambia los destinos renombrados.
export function reescribirEnlaces(texto, nombres) {
  return texto
    .split(/(```[\s\S]*?```)/g)
    .map((parte, i) =>
      i % 2
        ? parte
        : parte.replace(/(!?\[\[)([^\]\n|#]+)((?:[#|][^\]\n]*)?\]\])/g, (m, abre, destino, resto) => {
            const ultimo = destino.trim().replace(/\.md$/i, '').split('/').pop();
            const nuevo = nombres.get(ultimo.toLowerCase());
            return nuevo ? `${abre}${nuevo}${resto}` : m;
          }),
    )
    .join('');
}

// Notas del vault más AGENTS.md y CLAUDE.md de la raíz, que también pueden llevar enlaces.
function archivosConEnlaces(vault) {
  return [...listarNotas(vault), ...['AGENTS.md', 'CLAUDE.md'].filter((n) => existsSync(join(vault, n)))];
}

function reescribirVault(vault, nombres) {
  let cambiados = 0;
  if (!nombres.size) return 0;
  for (const rel of archivosConEnlaces(vault)) {
    const abs = join(vault, rel);
    const texto = readFileSync(abs, 'utf8');
    const nuevo = reescribirEnlaces(texto, nombres);
    if (nuevo !== texto) {
      sobrescribir(abs, nuevo);
      cambiados++;
    }
  }
  return cambiados;
}

// Ruta vieja → nueva: un archivo movido, una carpeta renombrada o, si no, la traducción por carpeta de la
// estructura anterior (una ruta que ya es nueva no cambia).
function conMapa(rel, archivos, carpetas, traductor = traducir) {
  if (!rel) return rel;
  const r = posix(String(rel));
  if (archivos[r]) return archivos[r];
  let mejor = null;
  for (const de of Object.keys(carpetas)) if ((r === de || r.startsWith(`${de}/`)) && (!mejor || de.length > mejor.length)) mejor = de;
  return mejor ? carpetas[mejor] + r.slice(mejor.length) : traductor(r);
}

// Registros de .cerebro: rutas de notas importadas, huellas de adjuntos, notas de Telegram y vínculos de cuadernos.
// La usan también okt mover, okt procesar y okt tema nuevo.
export function actualizarRegistros(vault, archivos, carpetas, nombres, traductor = (r) => r) {
  const cer = (n) => join(vault, '.cerebro', n);
  const mapa = (r) => conMapa(r, archivos, carpetas, traductor);
  const imp = leerJson(cer('importaciones.json'));
  if (imp) {
    for (const v of Object.values(imp)) if (v?.ruta) v.ruta = mapa(v.ruta);
    guardarJson(cer('importaciones.json'), imp);
  }
  const huellas = leerJson(cer('fuentes.json'));
  if (huellas) {
    for (const k of Object.keys(huellas)) huellas[k] = mapa(huellas[k]);
    guardarJson(cer('fuentes.json'), huellas);
  }
  const tg = leerJson(cer('telegram.json'));
  if (tg?.escritos) {
    for (const v of Object.values(tg.escritos)) if (v?.ruta) v.ruta = mapa(v.ruta);
    guardarJson(cer('telegram.json'), tg);
  }
  const agentes = leerJson(cer('agentes.json'));
  if (agentes?.carpetas) {
    for (const c of Object.values(agentes.carpetas)) for (const k of ['destino', 'captura']) if (c?.[k]) c[k] = mapa(c[k]);
    guardarJson(cer('agentes.json'), agentes);
  }
  const cfg = leerConfigVault(vault);
  const cambios = {};
  if (Array.isArray(cfg.areas) && nombres.size) cambios.areas = cfg.areas.map((a) => nombres.get(String(a).toLowerCase()) || a);
  if (cfg.cuadernos) cambios.cuadernos = Object.fromEntries(Object.entries(cfg.cuadernos).map(([k, v]) => [mapa(k), v]));
  if (Object.keys(cambios).length) guardarConfigVault(vault, cambios);
}

// Quita las carpetas viejas que quedaron vacías (solo vacías: nunca borra contenido).
function quitarVacias(vault, rel) {
  const abs = join(vault, rel);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return;
  for (const e of readdirSync(abs)) quitarVacias(vault, `${rel}/${e}`);
  try {
    if (!readdirSync(abs).length) rmdirSync(abs);
  } catch {}
}

function moverTodo(vault, movimientos) {
  for (const { de, a } of movimientos) {
    if (!existsSync(join(vault, de))) continue;
    mkdirSync(dirname(join(vault, a)), { recursive: true });
    renameSync(join(vault, de), join(vault, a));
  }
}

// Choques: dos archivos al mismo destino, o un destino que ya existe y es otro archivo.
function choquesDe(vault, movimientos) {
  const vistos = new Map();
  const choques = [];
  for (const m of movimientos) {
    const k = m.a.toLowerCase();
    if (vistos.has(k)) choques.push(`${vistos.get(k)} y ${m.de} → ${m.a}`);
    vistos.set(k, m.de);
    if (existsSync(join(vault, m.a)) && existsSync(join(vault, m.de)) && m.a.toLowerCase() !== m.de.toLowerCase()) choques.push(`${m.de} → ${m.a} (ya existe)`);
  }
  return choques;
}

// ---------- paso 1: v1 (0.2.x) → v2 (0.3.x) ----------

function planV2(vault) {
  const archivos = RAICES_ANTIGUAS.flatMap((r) => archivosBajo(vault, r));
  const tipos = {};
  for (const f of archivos) if (f.endsWith('.md')) tipos[f] = tipoEmojiDe(readFileSync(join(vault, f), 'utf8'));

  // La carpeta de un proyecto cambia junto con su nota principal (Curso/Curso.md → 🎯 Curso/🎯 Curso.md).
  const carpetas = {};
  const nuevoNombre = (f) => {
    // traducir() ya da su nombre con emoji a los cuatro archivos del sistema («hot» → «🔥 hot»).
    const base = basename(traducir(f), '.md');
    return tipos[f] && !empiezaConEmoji(base) ? conEmoji(tipos[f], base) : base;
  };
  for (const f of archivos) {
    if (tipos[f] !== 'proyecto') continue;
    const base = basename(f, '.md');
    if (basename(dirname(f)) !== base) continue;
    const dir = traducir(dirname(f));
    carpetas[dirname(f)] = `${dirname(dir)}/${nuevoNombre(f)}`;
  }

  const movimientos = [];
  const nombres = {};
  const ambiguos = new Set();
  for (const f of archivos) {
    let destino = conMapa(f, {}, carpetas);
    if (f.endsWith('.md')) {
      const viejo = basename(f, '.md');
      const nuevo = nuevoNombre(f);
      destino = `${dirname(destino)}/${nuevo}.md`;
      // Los cuatro archivos del sistema ya cambian de nombre con traducir(): su nombre viejo también se mapea.
      const final = basename(destino, '.md');
      // Las plantillas de Obsidian no entran: un [[Fuente]] genérico no debe pasar a apuntar a la plantilla.
      if (final !== viejo && !f.startsWith('99-Sistema/plantillas/')) {
        const k = viejo.toLowerCase();
        if (nombres[k] && nombres[k] !== final) ambiguos.add(viejo);
        nombres[k] = final;
      }
    }
    if (destino !== f) movimientos.push({ de: f, a: destino });
  }
  for (const a of ambiguos) delete nombres[a.toLowerCase()];
  const vista = [...ANTIGUAS.filter(([a]) => existsSync(join(vault, a))), ...Object.entries(carpetas)];
  return { paso: 2, movimientos, carpetas, vista, nombres, ambiguos: [...ambiguos], choques: choquesDe(vault, movimientos) };
}

function describirV2(plan) {
  const carpetas = plan.vista || [];
  const notas = plan.movimientos.filter((m) => m.de.endsWith('.md') && basename(m.de) !== basename(m.a));
  const lineas = ['Paso 1 de 2 (0.2 → 0.3): carpetas y notas con emojis.', `Carpetas (${carpetas.length}):`, ...carpetas.map(([de, a]) => `  - ${de} → ${a}`)];
  lineas.push(`Notas con nombre nuevo (${notas.length}):`, ...notas.map((m) => `  - ${basename(m.de, '.md')} → ${basename(m.a, '.md')}`));
  lineas.push(`Archivos que se mueven en total: ${plan.movimientos.length}.`);
  if (plan.ambiguos.length) lineas.push(`Enlaces que no se cambian porque varias notas se llamaban igual: ${plan.ambiguos.join(', ')}. Revísalos después con okt lint.`);
  lineas.push('Paso 2 de 2 (0.3 → 0.4): el conocimiento y las fuentes pasan a sus áreas y proyectos. Su vista previa se calcula al terminar el paso 1; las dos van en el mismo --aplicar.');
  return lineas.join('\n');
}

function ajustarObsidianV2(vault, archivos, carpetas) {
  const ruta = (n) => join(vault, '.obsidian', n);
  const sinMd = (r) => r.replace(/\.md$/, '');
  const app = leerJson(ruta('app.json'));
  if (app) {
    for (const k of ['attachmentFolderPath', 'newFileFolderPath']) if (typeof app[k] === 'string') app[k] = conMapa(app[k], {}, carpetas);
    guardarJson(ruta('app.json'), app);
  }
  const diario = leerJson(ruta('daily-notes.json'));
  if (diario) {
    if (diario.folder) diario.folder = traducir(diario.folder);
    if (!diario.format || diario.format === 'YYYY-MM-DD') diario.format = `[${EMOJI.diario}] YYYY-MM-DD`;
    if (diario.template) diario.template = sinMd(conMapa(`${diario.template}.md`, archivos, carpetas));
    guardarJson(ruta('daily-notes.json'), diario);
  }
  const plantillas = leerJson(ruta('templates.json'));
  if (plantillas?.folder) {
    plantillas.folder = traducir(plantillas.folder);
    guardarJson(ruta('templates.json'), plantillas);
  }
}

const TITULOS_SISTEMA = { Bitácora: '📜 Bitácora', Pendientes: '✅ Pendientes', Índice: '🗂️ Índice', 'Contexto reciente': '🔥 Contexto reciente' };
const SIN_ALIAS = new Set(['sistema', 'diario', 'semanal', 'sesion']);

// El título # de cada nota renombrada pasa a llevar el emoji, y su nombre sin emoji queda como alias.
function ajustarTitulos(vault, movimientos) {
  for (const { de, a } of movimientos) {
    if (!a.endsWith('.md') || basename(de) === basename(a) || !existsSync(join(vault, a))) continue;
    const abs = join(vault, a);
    const texto = readFileSync(abs, 'utf8');
    if (de.startsWith('99-Sistema/plantillas/')) {
      const nuevo = texto.replace(/^# \{\{date:YYYY-MM-DD\}\}[ \t]*$/m, `# ${EMOJI.diario} {{date:YYYY-MM-DD}}`);
      if (nuevo !== texto) sobrescribir(abs, nuevo);
      continue;
    }
    const nombre = basename(a, '.md');
    const { datos, cuerpo, tiene } = leerFrontmatter(texto);
    // [ \t]* y no \s*: \s* se comería la línea en blanco que sigue al título.
    const cuerpoNuevo = cuerpo.replace(/^# (.+?)[ \t]*$/m, (m, t) => (TITULOS_SISTEMA[t] ? `# ${TITULOS_SISTEMA[t]}` : sinEmoji(t) === sinEmoji(nombre) && t !== nombre ? `# ${nombre}` : m));
    if (!tiene) {
      if (cuerpoNuevo !== cuerpo) sobrescribir(abs, cuerpoNuevo);
      continue;
    }
    const alias = [].concat(datos.aliases || []);
    const conAlias = SIN_ALIAS.has(datos.tipo) || alias.includes(sinEmoji(nombre)) ? alias : [...alias, sinEmoji(nombre)];
    if (cuerpoNuevo !== cuerpo || conAlias !== alias) sobrescribir(abs, escribirFrontmatter({ ...datos, ...(conAlias.length ? { aliases: conAlias } : {}) }, cuerpoNuevo));
  }
}

function asegurarGitignore(vault) {
  const ruta = join(vault, '.gitignore');
  if (!existsSync(ruta)) return;
  const texto = readFileSync(ruta, 'utf8');
  if (!/^\.tmp\.drivedownload\/?$/m.test(texto)) sobrescribir(ruta, `${texto.replace(/\s*$/, '')}\n.tmp.drivedownload/\n`);
}

function aplicarV2(vault, plan) {
  moverTodo(vault, plan.movimientos);
  const archivos = Object.fromEntries(plan.movimientos.map((m) => [m.de, m.a]));
  const nombres = new Map(Object.entries(plan.nombres));
  ajustarTitulos(vault, plan.movimientos);
  const enlaces = reescribirVault(vault, nombres);
  actualizarRegistros(vault, archivos, plan.carpetas, nombres, traducir);
  ajustarObsidianV2(vault, archivos, plan.carpetas);
  asegurarGitignore(vault);
  for (const c of CARPETAS2) mkdirSync(join(vault, c), { recursive: true });
  for (const r of RAICES_ANTIGUAS) quitarVacias(vault, r);
  guardarConfigVault(vault, { version: 2 });
  return { movidos: plan.movimientos.length, enlaces };
}

// ---------- paso 2: v2 (0.3.x) → v3 (0.4.x) ----------

const nombreDeEnlace = (v) => String([].concat(v || [])[0] || '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim();
const SUBS_BANDEJA = () => [R2.notas, R2.sesiones, R2.importados, R2.telegram];

// Al aplicar, planV3 corre después de las raíces (ya en 00–05). En la vista previa de un vault de la 0.3 todavía tienen el
// número viejo: lee ahí lo que está en disco, y el plan queda en rutas nuevas.
function enDisco(vault, rel) {
  for (const k of Object.keys(C3)) {
    if (C3[k] === C[k] || !(rel === C[k] || rel.startsWith(`${C[k]}/`))) continue;
    if (!existsSync(join(vault, C[k])) && existsSync(join(vault, C3[k]))) return C3[k] + rel.slice(C[k].length);
  }
  return rel;
}

function planV3(vault) {
  const movimientos = [];
  const usados = new Set();
  // Los enlaces no se reescriben: si una nota cambia de nombre por un choque, la otra conserva el suyo, y reescribir
  // [[X]] → [[X 2]] desviaría también los enlaces que apuntaban a la que se quedó. Se informan en la vista previa.
  const nombres = {};
  const renombradas = [];
  // Un destino ya usado o ya existente lleva « 2», « 3»…
  const reservar = (de, dir, archivo) => {
    const punto = archivo.lastIndexOf('.');
    const [raiz, ext] = punto > 0 ? [archivo.slice(0, punto), archivo.slice(punto)] : [archivo, ''];
    let nombre = archivo;
    for (let i = 2; usados.has(`${dir}/${nombre}`.toLowerCase()) || (existsSync(join(vault, enDisco(vault, `${dir}/${nombre}`))) && `${dir}/${nombre}` !== de); i++) nombre = `${raiz} ${i}${ext}`;
    usados.add(`${dir}/${nombre}`.toLowerCase());
    if (nombre !== archivo) renombradas.push(`${de} → ${dir}/${nombre}`);
    return `${dir}/${nombre}`;
  };

  // 1. Cada área pasa a ser una carpeta con su nota principal.
  const areas = new Map(); // nombre sin emoji, en minúsculas → carpeta del área
  const carpetasArea = [];
  for (const e of existsSync(join(vault, enDisco(vault, C.areas))) ? readdirSync(join(vault, enDisco(vault, C.areas)), { withFileTypes: true }) : []) {
    if (e.isFile() && e.name.endsWith('.md')) {
      const nombre = e.name.slice(0, -3);
      const dir = `${C.areas}/${nombre}`;
      movimientos.push({ de: `${C.areas}/${e.name}`, a: reservar(`${C.areas}/${e.name}`, dir, e.name) });
      areas.set(sinEmoji(nombre).toLowerCase(), dir);
      carpetasArea.push(dir);
    } else if (e.isDirectory()) areas.set(sinEmoji(e.name).toLowerCase(), `${C.areas}/${e.name}`);
  }
  const proyectos = new Map();
  for (const e of existsSync(join(vault, enDisco(vault, C.proyectos))) ? readdirSync(join(vault, enDisco(vault, C.proyectos)), { withFileTypes: true }) : []) {
    if (e.isDirectory()) proyectos.set(sinEmoji(e.name).toLowerCase(), `${C.proyectos}/${e.name}`);
  }

  // 2. Conocimiento y fichas de fuentes: al proyecto o al área que dicen sus propiedades; si no dicen, a la Bandeja.
  const sinUbicar = [];
  const conocimiento = [...archivosBajo(vault, C2.conocimiento), ...archivosBajo(vault, C2.fuentes).filter((f) => !f.startsWith(`${R2.adjuntos}/`))];
  for (const f of conocimiento) {
    let dir = C.bandeja;
    if (f.endsWith('.md')) {
      const { datos } = leerFrontmatter(readFileSync(join(vault, f), 'utf8'));
      const proyecto = proyectos.get(sinEmoji(nombreDeEnlace(datos.proyecto)).toLowerCase());
      const area = areas.get(sinEmoji(nombreDeEnlace(datos.area)).toLowerCase());
      dir = (datos.proyecto && proyecto) || (datos.area && area) || C.bandeja;
      if (dir === C.bandeja) sinUbicar.push(basename(f, '.md'));
    }
    movimientos.push({ de: f, a: reservar(f, dir, basename(f)) });
  }

  // 3. La bandeja se aplana y los adjuntos pasan al Sistema.
  for (const sub of SUBS_BANDEJA()) for (const f of archivosBajo(vault, sub)) movimientos.push({ de: f, a: reservar(f, C.bandeja, basename(f)) });
  for (const f of archivosBajo(vault, R2.adjuntos)) movimientos.push({ de: f, a: traducirV3(f) });

  return { paso: 3, movimientos, carpetasArea, sinUbicar, nombres, renombradas, choques: choquesDe(vault, movimientos) };
}

function describirV3(plan) {
  const lineas = ['Reorganización de OKT 0.4.0: el conocimiento vive en sus áreas y proyectos.'];
  if (plan.carpetasArea.length) lineas.push(`Áreas que pasan a ser carpetas (${plan.carpetasArea.length}):`, ...plan.carpetasArea.map((d) => `  - ${d}/`));
  const grupos = {};
  for (const m of plan.movimientos) {
    const dir = dirname(m.a);
    const clave = dir.startsWith(R.adjuntos) ? R.adjuntos : dir;
    grupos[clave] = (grupos[clave] || 0) + 1;
  }
  lineas.push('Destino de los archivos:', ...Object.entries(grupos).map(([d, n]) => `  - ${d}: ${n}`));
  if (plan.sinUbicar.length) lineas.push(`Notas de Conocimiento o Fuentes sin área ni proyecto, que van a la Bandeja para ubicarlas con la skill mantener (${plan.sinUbicar.length}): ${plan.sinUbicar.slice(0, 12).join(', ')}${plan.sinUbicar.length > 12 ? '…' : ''}`);
  if (plan.renombradas?.length) lineas.push(`Archivos que cambian de nombre para no pisar otro con el mismo nombre (revisa sus enlaces después con okt lint): ${plan.renombradas.join(', ')}`);
  lineas.push(`Archivos que se mueven en total: ${plan.movimientos.length}.`);
  lineas.push('También: tipos concepto/entidad/sintesis → nota y lo de la Bandeja → captura, notas de área con «De qué trata», plantillas nuevas, adjuntos y notas nuevas en Obsidian, registros de .cerebro, el bloque de AGENTS.md y los índices automáticos de cada carpeta.');
  return lineas.join('\n');
}

// Frontmatter de la versión 3: tipos nuevos y lo de la Bandeja como captura.
function ajustarTipos(vault) {
  let n = 0;
  for (const rel of listarNotas(vault)) {
    if (esSistema(rel) || rel.startsWith(`${C.archivo}/`)) continue;
    const abs = join(vault, rel);
    const texto = readFileSync(abs, 'utf8');
    const { datos, cuerpo, tiene } = leerFrontmatter(texto);
    if (!tiene) continue;
    let tipo = datos.tipo;
    const extra = {};
    if (['concepto', 'entidad', 'sintesis'].includes(tipo)) tipo = 'nota';
    if (rel.startsWith(`${C.bandeja}/`) && ['nota', 'sesion'].includes(datos.tipo)) {
      tipo = 'captura';
      extra.origen = datos.tipo === 'sesion' ? 'sesion' : datos.origen || 'nota';
    }
    let cuerpoNuevo = cuerpo;
    // Las notas de área de la 0.3 traían secciones vacías («Proyectos», «Conocimiento», «Notas»), que ahora llena el
    // índice, y un resumen de relleno («Área continua: X.»). Solo se quitan si están vacías o son el relleno.
    if (tipo === 'area') {
      // Vacía = solo líneas en blanco hasta el siguiente encabezado, las marcas o el final (no \s*$ con la bandera m:
      // $ coincidiría antes de la primera línea en blanco y se llevaría secciones con texto).
      cuerpoNuevo = cuerpo.replace(/^## (Proyectos|Conocimiento|Notas)[ \t]*\n(?=(?:[ \t]*\n)*(?:## |<!-- okt:inicio -->|(?![\s\S])))/gm, '').replace(/\n{3,}/g, '\n\n');
      if (!/^## De qué trata/m.test(cuerpoNuevo)) cuerpoNuevo = cuerpoNuevo.replace(/^(# .+\n)/m, '$1\n## De qué trata\n');
      if (/^Área continua: .*\.$/.test(datos.resumen || '')) extra.resumen = '';
    }
    if (tipo !== datos.tipo || cuerpoNuevo !== cuerpo || Object.keys(extra).length) {
      sobrescribir(abs, escribirFrontmatter({ ...datos, tipo, ...extra }, cuerpoNuevo));
      n++;
    }
  }
  return n;
}

function ajustarObsidianV3(vault) {
  const ruta = join(vault, '.obsidian', 'app.json');
  const app = leerJson(ruta);
  if (!app) return;
  if (typeof app.attachmentFolderPath === 'string') app.attachmentFolderPath = traducirV3(app.attachmentFolderPath);
  if (typeof app.newFileFolderPath === 'string') app.newFileFolderPath = traducirV3(app.newFileFolderPath);
  guardarJson(ruta, app);
}

// Plantillas de Obsidian de la 0.4: se agregan las que faltan; la de Concepto pasa al Archivo (sigue ahí).
function ajustarPlantillas(vault) {
  const origen = join(RAIZ_PLUGIN, 'plantillas', 'vault', '99-Sistema', 'plantillas');
  if (!existsSync(origen)) return;
  mkdirSync(join(vault, R.plantillas), { recursive: true });
  const tipos = { Nota: 'nota', Fuente: 'fuente', Proyecto: 'proyecto', Area: 'area', Tema: 'tema', Diario: 'diario', Semanal: 'semanal' };
  for (const f of readdirSync(origen)) {
    const base = f.replace(/\.md$/, '');
    const dest = join(vault, R.plantillas, `${conEmoji(tipos[base] || 'nota', base)}.md`);
    if (!existsSync(dest)) copyFileSync(join(origen, f), dest);
  }
  const concepto = `${R.plantillas}/${EMOJI.concepto} Concepto.md`;
  if (existsSync(join(vault, concepto))) {
    const dest = destinoArchivo(concepto);
    mkdirSync(dirname(join(vault, dest)), { recursive: true });
    if (!existsSync(join(vault, dest))) renameSync(join(vault, concepto), join(vault, dest));
  }
}

function aplicarV3(vault, plan) {
  moverTodo(vault, plan.movimientos);
  const archivos = Object.fromEntries(plan.movimientos.map((m) => [m.de, m.a]));
  const nombres = new Map(Object.entries(plan.nombres));
  const enlaces = reescribirVault(vault, nombres);
  actualizarRegistros(vault, archivos, { [R2.adjuntos]: R.adjuntos }, nombres, traducirV3);
  const tipos = ajustarTipos(vault);
  ajustarObsidianV3(vault);
  ajustarPlantillas(vault);
  for (const c of CARPETAS) mkdirSync(join(vault, c), { recursive: true });
  for (const r of [C2.conocimiento, C2.fuentes, ...SUBS_BANDEJA()]) quitarVacias(vault, r);
  guardarConfigVault(vault, { version: 3 });
  if (plan.sinUbicar.length) pendiente(vault, 'agregar', [`ubicar ${plan.sinUbicar.length} notas que la migración dejó en la Bandeja (no decían su área ni su proyecto): procesa la bandeja`], { para: 'usuario', de: 'migrar' });
  return { movidos: plan.movimientos.length, enlaces, tipos };
}

// ---------- raíces (0.7.0): 00 a 05 y Archivo por motivo ----------

const RAICES_V3 = Object.keys(C3).filter((k) => C3[k] !== C[k]);
const esRaizNumerada = (nombre) => /^\d+\s*│/.test(nombre);

// Lo que okt archivar dejó con su ruta completa (<Archivo>/<raíz numerada>/…), antes de la 0.7.0.
function archivadosConRuta(vault) {
  const arch = existsSync(join(vault, C3.archivo)) ? C3.archivo : C.archivo;
  let subs = [];
  try {
    subs = readdirSync(join(vault, arch), { withFileTypes: true }).filter((d) => d.isDirectory() && esRaizNumerada(d.name)).map((d) => d.name);
  } catch {}
  return { arch, subs, archivos: subs.flatMap((s) => archivosBajo(vault, `${arch}/${s}`)) };
}

const necesitaRaices = (vault) => RAICES_V3.some((k) => existsSync(join(vault, C3[k]))) || archivadosConRuta(vault).archivos.length > 0;

function planV4(vault) {
  const movimientos = [];
  const usados = new Set();
  const renombradas = [];
  // 1. Lo archivado pasa a la carpeta de su motivo, todavía dentro del Archivo de la v3 (se renombra en el punto 2).
  const { arch, subs, archivos } = archivadosConRuta(vault);
  for (const f of archivos) {
    const destino = arch + destinoArchivo(f.slice(arch.length + 1)).slice(C.archivo.length);
    // También se mira su lugar final: si el Archivo nuevo ya existe, el punto 2 junta los dos y renameSync pisaría.
    const ocupado = (p) => usados.has(p.toLowerCase()) || existsSync(join(vault, p)) || existsSync(join(vault, C.archivo + p.slice(arch.length)));
    let a = destino;
    for (let i = 2; ocupado(a); i++) a = destino.replace(/(\.[^./]+)?$/, ` ${i}$1`);
    usados.add(a.toLowerCase());
    if (a !== destino) renombradas.push(`${f} → ${a}`);
    movimientos.push({ de: f, a });
  }
  const yaMovidos = new Map(movimientos.map((m) => [m.de, m.a]));
  // 2. Cada raíz se renombra entera; si la nueva ya existe (la creó Obsidian, p. ej.), se mueve archivo por archivo.
  const carpetas = {};
  for (const k of RAICES_V3) {
    const viejo = C3[k];
    if (!existsSync(join(vault, viejo))) continue;
    carpetas[viejo] = C[k];
    if (!existsSync(join(vault, C[k]))) movimientos.push({ de: viejo, a: C[k] });
    else for (const f of archivosBajo(vault, viejo).map((f) => yaMovidos.get(f) || f)) movimientos.push({ de: f, a: C[k] + f.slice(viejo.length) });
  }
  return { paso: 4, movimientos, carpetas, archivados: archivos.length, subs, renombradas, choques: choquesDe(vault, movimientos) };
}

function describirV4(plan) {
  const raices = Object.entries(plan.carpetas);
  const lineas = ['OKT 0.7.0: carpetas raíz numeradas de 00 a 05 y Archivo ordenado por motivo.'];
  if (raices.length) lineas.push(`Carpetas raíz (${raices.length}):`, ...raices.map(([de, a]) => `  - ${de} → ${a}`));
  if (plan.archivados) lineas.push(`Archivados con su ruta completa que pasan a ${['🗑️ Descartes', '✅ Terminados', '💤 Inactivos'].join(', ')}: ${plan.archivados}.`);
  if (plan.renombradas.length) lineas.push(`Archivos que cambian de nombre para no pisar otro con el mismo nombre: ${plan.renombradas.join(', ')}`);
  lineas.push('También: las rutas en .obsidian (adjuntos, notas nuevas, diario, plantillas y marcadores), en los registros de .cerebro, en el texto de las notas (hot, bitácora) y el bloque de AGENTS.md.');
  return lineas.join('\n');
}

// Las rutas que cambian de raíz dentro del texto: notas, AGENTS.md y CLAUDE.md de la raíz y la configuración de Obsidian.
// shortcut: una ruta escrita de lo archivado con su ruta completa queda con la raíz nueva pero sin su motivo; sus
// enlaces [[nombre]] sí siguen funcionando.
function cambiarRutasEnTexto(vault, carpetas) {
  const obsidian = join(vault, '.obsidian');
  const jsons = [];
  try {
    for (const e of readdirSync(obsidian, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.json')) jsons.push(`.obsidian/${e.name}`);
      if (e.isDirectory() && e.name === 'plugins') for (const p of readdirSync(join(obsidian, 'plugins'))) if (existsSync(join(obsidian, 'plugins', p, 'data.json'))) jsons.push(`.obsidian/plugins/${p}/data.json`);
    }
  } catch {}
  let n = 0;
  for (const rel of [...archivosConEnlaces(vault), ...jsons]) {
    const abs = join(vault, rel);
    const texto = readFileSync(abs, 'utf8');
    let nuevo = texto;
    for (const [de, a] of Object.entries(carpetas)) nuevo = nuevo.split(de).join(a);
    if (nuevo !== texto) {
      sobrescribir(abs, nuevo);
      n++;
    }
  }
  return n;
}

function aplicarV4(vault, plan) {
  moverTodo(vault, plan.movimientos);
  const final = (p) => conMapa(p, {}, plan.carpetas, (r) => r);
  const archivos = Object.fromEntries(plan.movimientos.map((m) => [m.de, final(m.a)]));
  actualizarRegistros(vault, archivos, plan.carpetas, new Map());
  // En el texto cuentan todas las raíces, también las que este vault no tenía (una nota puede citarlas igual).
  const textos = cambiarRutasEnTexto(vault, Object.fromEntries(RAICES_V3.map((k) => [C3[k], C[k]])));
  for (const viejo of Object.keys(plan.carpetas)) quitarVacias(vault, viejo);
  for (const s of plan.subs) quitarVacias(vault, `${C.archivo}/${s}`);
  for (const c of CARPETAS) mkdirSync(join(vault, c), { recursive: true });
  return { movidos: plan.movimientos.length, textos };
}

// ---------- okt migrar ----------

// Orden de los pasos: 2 (v1 → v2), 4 (raíces) y 3 (v2 → v3). El paso 3 se escribió con las raíces actuales, y la v1 → v2
// ya traduce a ellas, así que las raíces van antes del 3.
function pasoSiguiente(vault) {
  const v = versionDe(vault);
  if (v < 2) return 2;
  if (necesitaRaices(vault)) return 4;
  return v < 3 ? 3 : null;
}

const PLANES = { 2: planV2, 3: planV3, 4: planV4 };
const DESCRIBIR = { 2: describirV2, 3: describirV3, 4: describirV4 };
const APLICAR = { 2: aplicarV2, 3: aplicarV3, 4: aplicarV4 };
const RESUMEN = {
  2: (r) => `0.2 → 0.3: ${r.movidos} archivos movidos, enlaces en ${r.enlaces} notas`,
  3: (r) => `0.3 → 0.4: ${r.movidos} archivos movidos, ${r.tipos} notas con el tipo nuevo${r.enlaces ? `, enlaces en ${r.enlaces} notas` : ''}`,
  4: (r) => `raíces 00 a 05 y Archivo por motivo (0.7.0): ${r.movidos} movimientos, rutas actualizadas en ${r.textos} archivos`,
};

export function planMigrar(vault) {
  const guardado = leerJson(rutaPlan(vault));
  // El paso de las raíces a medias ya no se ve en las carpetas (las raíces viejas no están): se reconoce por su plan.
  if (guardado?.paso === 4) return { ...guardado, reanudado: true };
  const paso = pasoSiguiente(vault);
  if (!paso) return null;
  if (guardado && (guardado.paso || 2) === paso) return { ...guardado, paso, reanudado: true };
  return PLANES[paso](vault);
}

function guardarPlan(vault, plan) {
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  if (!plan.reanudado) writeFileSync(rutaPlan(vault), `${JSON.stringify(plan, null, 2)}\n`);
}

const errorChoques = (plan) => Object.assign(new Error(`No migré nada: hay nombres que chocarían.\n${plan.choques.map((c) => `- ${c}`).join('\n')}\nRenombra o archiva una de cada par y vuelve a intentarlo.`), { codigo: 3 });

export function migrar(vault, op = {}) {
  if (!necesitaMigrar(vault)) return { texto: 'El vault ya usa la estructura de OKT 0.7.0: no hay nada que migrar.', datos: { hecho: false } };
  let plan = planMigrar(vault);
  if (plan?.choques?.length) throw errorChoques(plan);
  if (!op.aplicar) {
    let texto = plan ? DESCRIBIR[plan.paso](plan) : 'Solo cambia la versión de la estructura: no se mueve nada.';
    // Un vault de la 0.3 hace las raíces y luego 0.3 → 0.4: las dos vistas previas van juntas.
    if (plan?.paso === 4 && versionDe(vault) === 2) texto += `\n\n${describirV3(planV3(vault))}`;
    return { texto: `Vista previa de okt migrar en ${posix(vault)}${plan?.reanudado ? ' (continúa una migración que quedó a medias)' : ''}\n${texto}\n\nSi faltan más pasos, se calculan al terminar este y van en el mismo --aplicar. Antes de aplicar, cierra Obsidian. Para migrar: okt migrar --aplicar (hace commit: se deshace con git).`, datos: plan };
  }

  const resumen = [];
  let sinUbicar = [];
  while (plan) {
    guardarPlan(vault, plan);
    const r = APLICAR[plan.paso](vault, plan);
    rmSync(rutaPlan(vault), { force: true });
    resumen.push(RESUMEN[plan.paso](r));
    if (plan.sinUbicar) sinUbicar = plan.sinUbicar;
    plan = planMigrar(vault);
    // Un choque de un paso posterior deja el vault sano, con lo ya hecho en su commit.
    if (plan?.choques?.length) {
      cerrar(vault, 'migrar', `migración a medias: ${resumen.join('; ')}`);
      throw errorChoques(plan);
    }
  }
  guardarConfigVault(vault, { version: VERSION_ESTRUCTURA });
  actualizarAgents(vault);
  const c = cerrar(vault, 'migrar', `estructura de OKT 0.7.0: ${resumen.join('; ') || 'solo la versión'}`);
  const siguiente = sinUbicar.length ? `Siguiente paso: ${sinUbicar.length} notas quedaron en la Bandeja sin área ni proyecto: «procesa mi bandeja» las ubica.` : 'Siguiente paso: abre Obsidian y revisa el árbol; crea temas cuando haya 3 o más notas de un mismo tema.';
  return { texto: `Migración lista. ${resumen.join('. ')}.\n${c.texto}\n${siguiente}`, datos: { pasos: resumen, sinUbicar, commit: c.datos.commit } };
}

// ---------- okt renombrar ----------

export function renombrar(vault, nota, nuevoPedido) {
  if (!nota || !nuevoPedido) throw errorUso('Uso: okt renombrar "<nota>" "<nombre nuevo>" (p. ej. okt renombrar "💡 Anemia" "🩸 Anemia")');
  const notas = listarNotas(vault).filter((r) => !r.startsWith(`${C.archivo}/`));
  const pedida = String(nota).replace(/^\[\[|\]\]$/g, '').replace(/\.md$/i, '');
  let candidatas = notas.filter((r) => basename(r, '.md').toLowerCase() === pedida.toLowerCase());
  if (!candidatas.length) candidatas = mismasNotas(vault, pedida);
  if (!candidatas.length) throw errorUso(`No encontré la nota «${pedida}». Búscala con okt buscar.`);
  if (candidatas.length > 1) throw errorUso(`Hay varias notas con ese nombre:\n${candidatas.map((c) => `- ${c}`).join('\n')}\nUsa el nombre exacto, con su emoji.`);
  const rel = candidatas[0];
  if (esSistema(rel)) throw errorUso('Los archivos del sistema no se renombran.');
  const viejo = basename(rel, '.md');
  const nuevo = limpiarNombre(String(nuevoPedido).replace(/\.md$/i, ''));
  if (!sinEmoji(nuevo) || !nombreValido(nuevo)) throw errorUso(`Nombre no válido: «${nuevoPedido}».`);
  if (nuevo === viejo) return { texto: 'El nombre no cambia.', datos: { ruta: rel } };
  const otras = mismasNotas(vault, nuevo).filter((r) => r !== rel);
  if (otras.length) throw Object.assign(new Error(`Ya existe una nota llamada «${sinEmoji(nuevo)}»: ${otras[0]}.`), { codigo: 3 });

  // La nota principal de un área, un proyecto o un tema vive en una carpeta con su mismo nombre: cambian las dos.
  const dir = dirname(rel);
  const conCarpeta = basename(dir) === viejo && (dir.startsWith(`${C.proyectos}/`) || dir.startsWith(`${C.areas}/`));
  const carpetas = {};
  let destino;
  if (conCarpeta) {
    const dirNuevo = `${dirname(dir)}/${nuevo}`;
    if (existsSync(join(vault, dirNuevo)) && dirNuevo.toLowerCase() !== dir.toLowerCase()) throw Object.assign(new Error(`Ya existe la carpeta ${dirNuevo}.`), { codigo: 3 });
    renameSync(join(vault, dir), join(vault, dirNuevo));
    renameSync(join(vault, dirNuevo, `${viejo}.md`), join(vault, dirNuevo, `${nuevo}.md`));
    carpetas[dir] = dirNuevo;
    destino = `${dirNuevo}/${nuevo}.md`;
  } else {
    destino = `${dir}/${nuevo}.md`;
    renameSync(join(vault, rel), join(vault, destino));
  }

  // El nombre anterior (sin emoji) queda como alias, y el título # se actualiza si era el nombre.
  const abs = join(vault, destino);
  const { datos, cuerpo, tiene } = leerFrontmatter(readFileSync(abs, 'utf8'));
  const cuerpoNuevo = cuerpo.replace(/^# (.+?)[ \t]*$/m, (m, t) => (t === viejo || sinEmoji(t) === sinEmoji(viejo) ? `# ${nuevo}` : m));
  if (tiene) {
    const alias = [...new Set([...[].concat(datos.aliases || []), sinEmoji(viejo), sinEmoji(nuevo)].filter((a) => a && a !== nuevo))];
    sobrescribir(abs, escribirFrontmatter({ ...datos, aliases: alias }, cuerpoNuevo));
  } else if (cuerpoNuevo !== cuerpo) sobrescribir(abs, cuerpoNuevo);

  const nombres = new Map([[viejo.toLowerCase(), nuevo]]);
  const enlaces = reescribirVault(vault, nombres);
  actualizarRegistros(vault, { [rel]: destino }, carpetas, nombres);
  if (datos.tipo === 'area') actualizarAgents(vault);
  return { texto: `Renombrada: ${rel} → ${destino}. Enlaces actualizados en ${enlaces} notas. Cierra con okt cerrar <skill> "renombró …".`, datos: { de: rel, a: destino, enlaces } };
}

