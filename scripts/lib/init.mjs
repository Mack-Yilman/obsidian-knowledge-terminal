// okt init: crea el vault en la carpeta actual. Sin --aplicar solo muestra la vista previa.
// Es reanudable: crea solo lo que falta y en AGENTS.md actualiza solo el bloque de OKT. Las áreas, los proyectos
// y los temas salen de la entrevista de la skill cerebro: sin --areas no se crea ninguna.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { RAIZ_PLUGIN, CLI, posix, dentroDe, guardarConfigGlobal, leerConfigVault, guardarConfigVault, sobrescribir } from './rutas.mjs';
import { CARPETAS, mismasNotas } from './vault.mjs';
import { C, VERSION_ESTRUCTURA, conEmoji, traducir, necesitaMigrar, AVISO_MIGRAR } from './estructura.mjs';
import { reemplazarBloque, leerBloque } from './bloques.mjs';
import { escribirFrontmatter } from './frontmatter.mjs';
import { fechaISO } from './fechas.mjs';
import { iniciarGit, commit } from './git.mjs';
import { limpiarNombre, sinEmoji } from './nombres.mjs';

const PLANTILLA = join(RAIZ_PLUGIN, 'plantillas', 'vault');

// Plantillas de Obsidian: el emoji de su tipo («Nota» → «💡 Nota»).
const PLANTILLAS = { Nota: 'nota', Fuente: 'fuente', Proyecto: 'proyecto', Area: 'area', Tema: 'tema', Diario: 'diario', Semanal: 'semanal' };

function archivosPlantilla(dir = PLANTILLA, base = '') {
  const lista = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) lista.push(...archivosPlantilla(join(dir, e.name), rel));
    else lista.push(rel);
  }
  return lista;
}

// Nombre final en el vault: AGENTS.md.tmpl → AGENTS.md, gitignore.tmpl → .gitignore. La plantilla del plugin
// guarda las carpetas con nombres ASCII («99-Sistema/hot.md»); aquí pasan a la estructura con emojis.
function destino(rel) {
  if (rel === 'gitignore.tmpl') return '.gitignore';
  const r = traducir(rel.replace(/\.tmpl$/, ''));
  const m = /^(.*\/)([^/]+)\.md$/.exec(r);
  return m && PLANTILLAS[m[2]] ? `${m[1]}${conEmoji(PLANTILLAS[m[2]], m[2])}.md` : r;
}

function rellenar(texto, valores) {
  return texto.replace(/\{\{(fecha|areas|cli|perfil)\}\}/g, (_, k) => valores[k] ?? '');
}

export function textoAgents(valores) {
  return rellenar(readFileSync(join(PLANTILLA, 'AGENTS.md.tmpl'), 'utf8'), valores);
}

// Valores del bloque de AGENTS.md según la configuración del vault.
export function valoresAgents(vault, cli = posix(CLI)) {
  const cfg = leerConfigVault(vault);
  const areas = (cfg.areas || []).map((a) => `[[${a}]]`).join(', ') || 'aún ninguna (pide «agrega un área»)';
  const perfil = cfg.perfil ? `**Quién usa este vault:** ${cfg.perfil}. Adapta los ejemplos, el tono y las propuestas a eso.` : '';
  return { fecha: fechaISO(), areas, cli, perfil };
}

// Reescribe el bloque de OKT en AGENTS.md (lo de fuera de las marcas es del usuario). Devuelve true si cambió.
export function actualizarAgents(vault, cli) {
  const ruta = join(vault, 'AGENTS.md');
  if (!existsSync(ruta)) return false;
  const texto = readFileSync(ruta, 'utf8');
  const nuevo = reemplazarBloque(texto, leerBloque(textoAgents(valoresAgents(vault, cli))));
  if (nuevo === texto) return false;
  sobrescribir(ruta, nuevo);
  return true;
}

const separar = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

// «🎓 Tesis@Medicina» → { nombre: '🎓 Tesis', area: '🩺 Medicina' } (el área se busca entre las pedidas, sin emoji).
function proyectosPedidos(texto, areas) {
  return separar(texto).map((p) => {
    const [nombre, area] = p.split('@').map((s) => s.trim());
    const limpio = conEmoji('proyecto', limpiarNombre(nombre));
    const delArea = area ? areas.find((a) => sinEmoji(a).toLowerCase() === sinEmoji(area).toLowerCase()) || conEmoji('area', limpiarNombre(area)) : null;
    return { nombre: limpio, area: delArea };
  });
}

// «Medicina/🫀 Cardiología/💔 Síndrome coronario agudo» → área o proyecto + cadena de temas.
function temasPedidos(texto, areas, proyectos) {
  return separar(texto).map((t) => {
    const [base, ...temas] = t.split('/').map((s) => limpiarNombre(s.trim())).filter(Boolean);
    const igual = (x) => sinEmoji(x).toLowerCase() === sinEmoji(base || '').toLowerCase();
    const area = areas.find(igual);
    const proyecto = !area && proyectos.find((p) => igual(p.nombre));
    if (!base || (!area && !proyecto) || !temas.length) throw Object.assign(new Error(`Tema «${t}»: empieza por un área o un proyecto de los que se crean (p. ej. "Medicina/🫀 Cardiología").`), { codigo: 2 });
    return { raiz: area ? `${C.areas}/${area}` : `${C.proyectos}/${proyecto.nombre}`, temas: temas.map((x) => conEmoji('tema', x)) };
  });
}

export function planInit(vault, opciones = {}) {
  if (dentroDe(RAIZ_PLUGIN, vault) || dentroDe(vault, RAIZ_PLUGIN)) {
    throw new Error(`No crees el vault dentro de la carpeta del plugin ni alrededor de ella (${posix(RAIZ_PLUGIN)}). Abre tu agente en la carpeta de tus notas.`);
  }
  // Un vault de una versión anterior no se completa con init: tendría carpetas nuevas y viejas a la vez.
  if (necesitaMigrar(vault)) throw Object.assign(new Error(AVISO_MIGRAR), { codigo: 2 });
  const previa = leerConfigVault(vault);
  const nuevas = separar(opciones.areas)
    .map((a) => limpiarNombre(a))
    .filter((a) => sinEmoji(a))
    .map((a) => conEmoji('area', a));
  const areas = [...(previa.areas || [])];
  for (const a of nuevas) if (!areas.some((x) => sinEmoji(x).toLowerCase() === sinEmoji(a).toLowerCase())) areas.push(a);
  const proyectos = proyectosPedidos(opciones.proyectos, areas);
  for (const p of proyectos) if (p.area && !areas.includes(p.area)) areas.push(p.area);
  const temas = temasPedidos(opciones.temas, areas, proyectos);
  const valores = { ...valoresAgents(vault), areas: areas.map((a) => `[[${a}]]`).join(', ') || 'aún ninguna (pide «agrega un área»)' };
  const acciones = [];

  for (const c of CARPETAS) if (!existsSync(join(vault, c))) acciones.push({ tipo: 'carpeta', ruta: c });
  for (const rel of archivosPlantilla()) {
    const dest = destino(rel);
    if (dest === 'AGENTS.md' && existsSync(join(vault, dest))) {
      acciones.push({ tipo: 'bloque', ruta: dest });
    } else if (dest.startsWith('.obsidian/') && dest.endsWith('.json') && existsSync(join(vault, dest))) {
      // El usuario ya tiene esa configuración de Obsidian: se agregan solo las claves que faltan.
      if (clavesQueFaltan(join(vault, dest), join(PLANTILLA, rel)).length) acciones.push({ tipo: 'mezclar', ruta: dest, origen: rel });
    } else if (!existsSync(join(vault, dest))) {
      acciones.push({ tipo: 'archivo', ruta: dest, origen: rel });
    }
  }
  const falta = (nombre) => !(existsSync(vault) && mismasNotas(vault, nombre).length);
  for (const a of areas) {
    const ruta = `${C.areas}/${a}/${a}.md`;
    if (!existsSync(join(vault, ruta)) && falta(a)) acciones.push({ tipo: 'area', ruta, nombre: a });
  }
  for (const p of proyectos) {
    const ruta = `${C.proyectos}/${p.nombre}/${p.nombre}.md`;
    if (!existsSync(join(vault, ruta)) && falta(p.nombre)) acciones.push({ tipo: 'proyecto', ruta, nombre: p.nombre, area: p.area });
  }
  for (const t of temas) {
    let dir = t.raiz;
    for (const nombre of t.temas) {
      dir = `${dir}/${nombre}`;
      const ruta = `${dir}/${nombre}.md`;
      if (!existsSync(join(vault, ruta)) && !acciones.some((x) => x.ruta === ruta) && falta(nombre)) acciones.push({ tipo: 'tema', ruta, nombre });
    }
  }
  acciones.push({ tipo: 'config', ruta: '.cerebro/config.json' });
  if (!existsSync(join(vault, '.git'))) acciones.push({ tipo: 'git', ruta: '.git (local, sin remoto)' });

  const ocupada = existsSync(vault) && readdirSync(vault).some((n) => !n.startsWith('.') && n.toLowerCase() !== 'desktop.ini') && !existsSync(join(vault, '.cerebro'));
  return { vault, areas, proyectos, valores, acciones, ocupada, perfil: opciones.perfil && opciones.perfil !== true ? String(opciones.perfil).trim() : previa.perfil || null };
}

function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return null;
  }
}

// Solo objetos JSON: si el archivo del usuario es otra cosa (o está dañado), no se toca.
function clavesQueFaltan(rutaUsuario, rutaPlantilla) {
  const u = leerJson(rutaUsuario);
  const p = leerJson(rutaPlantilla);
  if (!u || !p || Array.isArray(u) || typeof u !== 'object') return [];
  return Object.keys(p).filter((k) => !(k in u));
}

// Nota principal de un área, un proyecto o un tema. El bloque «Contenido» lo llena okt indice.
export function textoPrincipal(tipo, nombre, extra = {}) {
  const hoy = fechaISO();
  const datos = { tipo, creado: hoy, actualizado: hoy, ...(tipo === 'proyecto' ? { estado: 'activo' } : {}), resumen: extra.resumen || '', aliases: [sinEmoji(nombre)], ...(extra.area ? { area: `[[${extra.area}]]` } : {}) };
  const secciones = tipo === 'proyecto' ? '## Objetivo\n\n## Próximos pasos\n\n## Decisiones\n' : '## De qué trata\n';
  return escribirFrontmatter(datos, `\n# ${nombre}\n\n${secciones}`);
}

export function aplicarInit(plan) {
  const { vault, areas, valores } = plan;
  for (const a of plan.acciones) {
    const abs = join(vault, a.ruta);
    if (a.tipo === 'carpeta') mkdirSync(abs, { recursive: true });
    if (a.tipo === 'archivo') {
      mkdirSync(dirname(abs), { recursive: true });
      const origen = join(PLANTILLA, a.origen);
      if (/\.(md|tmpl)$/.test(a.origen)) writeFileSync(abs, rellenar(readFileSync(origen, 'utf8'), valores));
      else copyFileSync(origen, abs);
    }
    if (a.tipo === 'mezclar') {
      const u = leerJson(abs);
      const p = leerJson(join(PLANTILLA, a.origen));
      if (u && p) sobrescribir(abs, `${JSON.stringify({ ...p, ...u }, null, 2)}\n`);
    }
    if (a.tipo === 'bloque') {
      const nuevo = leerBloque(textoAgents(valores));
      sobrescribir(abs, reemplazarBloque(readFileSync(abs, 'utf8'), nuevo));
    }
    if (a.tipo === 'area' || a.tipo === 'proyecto' || a.tipo === 'tema') {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, textoPrincipal(a.tipo, a.nombre, { area: a.area }));
    }
  }
  const previa = leerConfigVault(vault);
  guardarConfigVault(vault, {
    version: VERSION_ESTRUCTURA,
    creado: previa.creado || valores.fecha,
    areas,
    ...(plan.perfil ? { perfil: plan.perfil } : {}),
    frescura_dias: previa.frescura_dias ?? 90,
    delegar: previa.delegar ?? null,
    excluir_proyectos: previa.excluir_proyectos ?? [],
  });
  // El perfil puede haber llegado con este init: el bloque de AGENTS.md se regenera con él.
  actualizarAgents(vault, valores.cli);
  guardarConfigGlobal({ vault: posix(vault), cli: posix(CLI) });
  const g = plan.acciones.some((a) => a.tipo === 'git') ? iniciarGit(vault) : {};
  const c = commit(vault, 'okt init: estructura del vault');
  return { git: g, commit: c };
}

export function describirPlan(plan) {
  const nombres = { carpeta: 'Carpeta', archivo: 'Archivo', bloque: 'Actualizar bloque OKT en', mezclar: 'Agregar ajustes que faltan (sin cambiar los tuyos) en', area: 'Área', proyecto: 'Proyecto', tema: 'Tema', config: 'Configuración', git: 'Git' };
  const lineas = plan.acciones.map((a) => `  - ${nombres[a.tipo]}: ${a.ruta}${a.area ? ` (área ${a.area})` : ''}`);
  return lineas.join('\n');
}
