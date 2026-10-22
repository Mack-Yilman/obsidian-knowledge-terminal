// okt migrar: lleva un vault 0.2.x a la estructura con emojis (0.3.0). okt renombrar: cambia el nombre de una
// nota y actualiza sus enlaces. Nada se borra: todo se mueve con renameSync, los registros se actualizan y la
// migración termina en un commit (se deshace con git). Es reanudable: el plan se guarda en
// .cerebro/migracion.json antes de mover nada, y una segunda corrida termina lo que haya quedado a medias.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { leerBloque, reemplazarBloque } from './bloques.mjs';
import { leerConfigVault, guardarConfigVault, sobrescribir, posix, CLI } from './rutas.mjs';
import { C, CARPETAS, EMOJI, ANTIGUAS, VERSION_ESTRUCTURA, conEmoji, traducir, necesitaMigrar } from './estructura.mjs';
import { empiezaConEmoji, sinEmoji, limpiarNombre, nombreValido } from './nombres.mjs';
import { listarNotas, mismasNotas, esSistema } from './vault.mjs';
import { textoAgents } from './init.mjs';
import { fechaISO } from './fechas.mjs';
import { cerrar } from './sistema.mjs';

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

// Ruta vieja → nueva: un archivo movido, una carpeta renombrada (la de un proyecto) o, si no, la traducción de
// las carpetas de la estructura anterior (una ruta que ya es nueva no cambia).
function conMapa(rel, archivos, carpetas) {
  if (!rel) return rel;
  const r = posix(String(rel));
  if (archivos[r]) return archivos[r];
  let mejor = null;
  for (const de of Object.keys(carpetas)) if ((r === de || r.startsWith(`${de}/`)) && (!mejor || de.length > mejor.length)) mejor = de;
  return mejor ? carpetas[mejor] + r.slice(mejor.length) : traducir(r);
}

// Registros de .cerebro: rutas de notas importadas, huellas de adjuntos, notas de Telegram y vínculos de cuadernos.
function actualizarRegistros(vault, archivos, carpetas, nombres) {
  const cer = (n) => join(vault, '.cerebro', n);
  const imp = leerJson(cer('importaciones.json'));
  if (imp) {
    for (const v of Object.values(imp)) if (v?.ruta) v.ruta = conMapa(v.ruta, archivos, carpetas);
    guardarJson(cer('importaciones.json'), imp);
  }
  const huellas = leerJson(cer('fuentes.json'));
  if (huellas) {
    for (const k of Object.keys(huellas)) huellas[k] = conMapa(huellas[k], archivos, carpetas);
    guardarJson(cer('fuentes.json'), huellas);
  }
  const tg = leerJson(cer('telegram.json'));
  if (tg?.escritos) {
    for (const v of Object.values(tg.escritos)) if (v?.ruta) v.ruta = conMapa(v.ruta, archivos, carpetas);
    guardarJson(cer('telegram.json'), tg);
  }
  const cfg = leerConfigVault(vault);
  const cambios = {};
  if (Array.isArray(cfg.areas)) cambios.areas = cfg.areas.map((a) => nombres.get(String(a).toLowerCase()) || a);
  if (cfg.cuadernos) cambios.cuadernos = Object.fromEntries(Object.entries(cfg.cuadernos).map(([k, v]) => [conMapa(k, archivos, carpetas), v]));
  if (Object.keys(cambios).length) guardarConfigVault(vault, cambios);
}

// ---------- okt migrar ----------

function calcularPlan(vault) {
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

  // Choques: dos archivos al mismo destino, o un destino que ya existe y es otro archivo.
  const vistos = new Map();
  const choques = [];
  for (const m of movimientos) {
    const k = m.a.toLowerCase();
    if (vistos.has(k)) choques.push(`${vistos.get(k)} y ${m.de} → ${m.a}`);
    vistos.set(k, m.de);
    if (existsSync(join(vault, m.a)) && existsSync(join(vault, m.de))) choques.push(`${m.de} → ${m.a} (ya existe)`);
  }
  const vista = [...ANTIGUAS.filter(([a]) => existsSync(join(vault, a))), ...Object.entries(carpetas)];
  return { version: 1, movimientos, carpetas, vista, nombres, ambiguos: [...ambiguos], choques };
}

export function planMigrar(vault) {
  const guardado = leerJson(rutaPlan(vault));
  if (guardado) return { ...guardado, reanudado: true };
  return calcularPlan(vault);
}

function describir(plan) {
  const carpetas = plan.vista || [];
  const notas = plan.movimientos.filter((m) => m.de.endsWith('.md') && basename(m.de) !== basename(m.a));
  const lineas = [`Carpetas (${carpetas.length}):`, ...carpetas.map(([de, a]) => `  - ${de} → ${a}`)];
  lineas.push(`Notas con nombre nuevo (${notas.length}):`, ...notas.map((m) => `  - ${basename(m.de, '.md')} → ${basename(m.a, '.md')}`));
  lineas.push(`Archivos que se mueven en total: ${plan.movimientos.length}.`);
  lineas.push('También: enlaces [[…]] de todas las notas, registros de .cerebro, configuración de Obsidian (adjuntos, notas nuevas, diario y plantillas), el bloque de AGENTS.md y el .gitignore.');
  if (plan.ambiguos.length) lineas.push(`Enlaces que no se cambian porque varias notas se llamaban igual: ${plan.ambiguos.join(', ')}. Revísalos después con okt lint.`);
  return lineas.join('\n');
}

function ajustarObsidian(vault, archivos, carpetas) {
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

// Quita las carpetas viejas que quedaron vacías (solo vacías: nunca borra contenido).
function quitarVacias(vault, rel) {
  const abs = join(vault, rel);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return;
  for (const e of readdirSync(abs)) quitarVacias(vault, `${rel}/${e}`);
  try {
    if (!readdirSync(abs).length) rmdirSync(abs);
  } catch {}
}

export function migrar(vault, op = {}) {
  if (!necesitaMigrar(vault)) return { texto: 'El vault ya usa la estructura con emojis de OKT 0.3.0: no hay nada que migrar.', datos: { hecho: false } };
  const plan = planMigrar(vault);
  if (plan.choques?.length) {
    throw Object.assign(new Error(`No migré nada: hay nombres que chocarían.\n${plan.choques.map((c) => `- ${c}`).join('\n')}\nRenombra o archiva una de cada par y vuelve a intentarlo.`), { codigo: 3 });
  }
  if (!op.aplicar) {
    return { texto: `Vista previa de okt migrar en ${posix(vault)}${plan.reanudado ? ' (continúa una migración que quedó a medias)' : ''}\n${describir(plan)}\n\nAntes de aplicar, cierra Obsidian. Para migrar: okt migrar --aplicar (hace commit: se deshace con git).`, datos: plan };
  }

  // 1. El plan queda guardado antes de mover nada: si algo falla, otra corrida lo termina.
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  if (!plan.reanudado) writeFileSync(rutaPlan(vault), `${JSON.stringify(plan, null, 2)}\n`);
  // 2. Mover (lo ya movido en una corrida anterior se salta).
  for (const { de, a } of plan.movimientos) {
    if (!existsSync(join(vault, de))) continue;
    mkdirSync(dirname(join(vault, a)), { recursive: true });
    renameSync(join(vault, de), join(vault, a));
  }
  // 3. Enlaces, registros y configuración.
  const archivos = Object.fromEntries(plan.movimientos.map((m) => [m.de, m.a]));
  const nombres = new Map(Object.entries(plan.nombres));
  ajustarTitulos(vault, plan.movimientos);
  const enlaces = reescribirVault(vault, nombres);
  actualizarRegistros(vault, archivos, plan.carpetas, nombres);
  ajustarObsidian(vault, archivos, plan.carpetas);
  asegurarGitignore(vault);
  for (const c of CARPETAS) mkdirSync(join(vault, c), { recursive: true });
  for (const r of RAICES_ANTIGUAS) quitarVacias(vault, r);
  guardarConfigVault(vault, { version: VERSION_ESTRUCTURA });
  const agents = join(vault, 'AGENTS.md');
  if (existsSync(agents)) {
    const areas = (leerConfigVault(vault).areas || []).map((a) => `[[${a}]]`).join(', ');
    sobrescribir(agents, reemplazarBloque(readFileSync(agents, 'utf8'), leerBloque(textoAgents({ fecha: fechaISO(), areas, cli: posix(CLI) }))));
  }
  rmSync(rutaPlan(vault), { force: true });
  // 4. Bitácora, índice, hot y commit.
  const c = cerrar(vault, 'migrar', `estructura con emojis (0.3.0): ${plan.movimientos.length} archivos movidos, enlaces en ${enlaces} notas`);
  return {
    texto: `Migración lista: ${plan.movimientos.length} archivos movidos y enlaces actualizados en ${enlaces} notas.\n${c.texto}\nSiguiente paso: elegir un emoji temático para conceptos, entidades, síntesis, proyectos y áreas (okt renombrar "<nota>" "<emoji> <nombre>").`,
    datos: { movimientos: plan.movimientos.length, enlaces, commit: c.datos.commit },
  };
}

// ---------- okt renombrar ----------

export function renombrar(vault, nota, nuevoPedido) {
  if (!nota || !nuevoPedido) throw errorUso('Uso: okt renombrar "<nota>" "<nombre nuevo>" (p. ej. okt renombrar "💡 Anemia" "🩸 Anemia")');
  const notas = listarNotas(vault);
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

  // La nota principal de un proyecto vive en una carpeta con su mismo nombre: cambian las dos.
  const dir = dirname(rel);
  const esProyecto = basename(dir) === viejo && dir.startsWith(`${C.proyectos}/`);
  const carpetas = {};
  let destino;
  if (esProyecto) {
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
  return { texto: `Renombrada: ${rel} → ${destino}. Enlaces actualizados en ${enlaces} notas. Cierra con okt cerrar <skill> "renombró …".`, datos: { de: rel, a: destino, enlaces } };
}
