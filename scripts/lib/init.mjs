// okt init: crea el vault en la carpeta actual. Sin --aplicar solo muestra la vista previa.
// Es reanudable: crea solo lo que falta y en AGENTS.md actualiza solo el bloque de OKT.
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
export const AREAS_POR_DEFECTO = ['🌱 Personal', '📖 Estudios', '💼 Trabajo'];

// Plantillas de Obsidian: el emoji de su tipo («Concepto» → «💡 Concepto»).
const PLANTILLAS = { Concepto: 'concepto', Diario: 'diario', Fuente: 'fuente', Proyecto: 'proyecto' };

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
  return texto.replace(/\{\{(fecha|areas|cli)\}\}/g, (_, k) => valores[k]);
}

export function textoAgents(valores) {
  return rellenar(readFileSync(join(PLANTILLA, 'AGENTS.md.tmpl'), 'utf8'), valores);
}

export function planInit(vault, opciones = {}) {
  if (dentroDe(RAIZ_PLUGIN, vault) || dentroDe(vault, RAIZ_PLUGIN)) {
    throw new Error(`No crees el vault dentro de la carpeta del plugin ni alrededor de ella (${posix(RAIZ_PLUGIN)}). Abre tu agente en la carpeta de tus notas.`);
  }
  // Un vault 0.2.x no se completa con init: tendría carpetas nuevas y viejas a la vez.
  if (necesitaMigrar(vault)) throw Object.assign(new Error(AVISO_MIGRAR), { codigo: 2 });
  const previa = leerConfigVault(vault);
  const areas = (opciones.areas ? opciones.areas.split(',') : previa.areas || AREAS_POR_DEFECTO)
    .map((a) => limpiarNombre(a))
    .filter((a) => sinEmoji(a))
    .map((a) => conEmoji('area', a));
  const valores = { fecha: fechaISO(), areas: areas.map((a) => `[[${a}]]`).join(', '), cli: posix(CLI) };
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
  for (const a of areas) {
    const ruta = `${C.areas}/${a}.md`;
    if (!existsSync(join(vault, ruta)) && !(existsSync(vault) && mismasNotas(vault, a).length)) acciones.push({ tipo: 'area', ruta, nombre: a });
  }
  acciones.push({ tipo: 'config', ruta: '.cerebro/config.json' });
  if (!existsSync(join(vault, '.git'))) acciones.push({ tipo: 'git', ruta: '.git (local, sin remoto)' });

  const ocupada = existsSync(vault) && readdirSync(vault).some((n) => !n.startsWith('.') && n.toLowerCase() !== 'desktop.ini') && !existsSync(join(vault, '.cerebro'));
  return { vault, areas, valores, acciones, ocupada };
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
    if (a.tipo === 'area') {
      mkdirSync(dirname(abs), { recursive: true });
      const datos = { tipo: 'area', creado: valores.fecha, actualizado: valores.fecha, resumen: `Área continua: ${sinEmoji(a.nombre)}.`, aliases: [sinEmoji(a.nombre)] };
      writeFileSync(abs, escribirFrontmatter(datos, `\n# ${a.nombre}\n\n## Proyectos\n\n## Conocimiento\n\n## Notas\n`));
    }
  }
  const previa = leerConfigVault(vault);
  guardarConfigVault(vault, {
    version: VERSION_ESTRUCTURA,
    creado: previa.creado || valores.fecha,
    areas,
    frescura_dias: previa.frescura_dias ?? 90,
    delegar: previa.delegar ?? null,
    excluir_proyectos: previa.excluir_proyectos ?? [],
  });
  guardarConfigGlobal({ vault: posix(vault), cli: posix(CLI) });
  const g = plan.acciones.some((a) => a.tipo === 'git') ? iniciarGit(vault) : {};
  const c = commit(vault, 'okt init: estructura del vault');
  return { git: g, commit: c };
}

export function describirPlan(plan) {
  const nombres = { carpeta: 'Carpeta', archivo: 'Archivo', bloque: 'Actualizar bloque OKT en', mezclar: 'Agregar ajustes que faltan (sin cambiar los tuyos) en', area: 'Área', config: 'Configuración', git: 'Git' };
  const lineas = plan.acciones.map((a) => `  - ${nombres[a.tipo]}: ${a.ruta}`);
  return lineas.join('\n');
}
