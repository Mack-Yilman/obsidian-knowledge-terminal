// Detector de jerarquía «de lo general a lo específico» (OKT 0.9.0): mide la forma de las carpetas dentro de
// Áreas y Proyectos sin gastar tokens y señala dónde conviene agrupar notas en temas, crear una rama intermedia,
// convertir en tema una nota que creció o archivar un tema casi vacío. Solo detecta: nunca mueve nada.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { C, EMOJI, resolverCarpeta, ubicar } from './estructura.mjs';
import { diasEntre, fechaISO } from './fechas.mjs';
import { leerConfigVault, posix, sobrescribir } from './rutas.mjs';
import { leerNota, listarNotas } from './vault.mjs';

const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });

export const UMBRALES = {
  notas_sueltas: 4,
  rama_plana: 8,
  encabezados: 5,
  palabras: 1500,
};

const TITULOS_TIPO = {
  notas_sueltas: 'Notas sueltas para agrupar en temas',
  rama_plana: 'Ramas planas con demasiadas subcarpetas',
  nota_crecio: 'Notas que crecieron y pueden pasar a ser tema',
  tema_casi_vacio: 'Temas casi vacíos',
};

const SIGUIENTE_PASO =
  'Siguiente paso: para cada carpeta, okt reorganizar preparar --carpeta "<carpeta>"; propón la tabla actual → propuesto y aplica con un solo sí. Para no volver a ver uno: okt jerarquia descartar <id>.';

function umbralesDe(vault) {
  const j = leerConfigVault(vault).jerarquia || {};
  const nc = typeof j.nota_crecio === 'object' && j.nota_crecio ? j.nota_crecio : {};
  return {
    notas_sueltas: Number(j.notas_sueltas ?? j.notasSueltas ?? UMBRALES.notas_sueltas),
    rama_plana: Number(j.rama_plana ?? j.ramaPlana ?? j.subcarpetas ?? UMBRALES.rama_plana),
    encabezados: Number(j.encabezados ?? j.secciones ?? j.nota_crecio_encabezados ?? nc.encabezados ?? nc.secciones ?? UMBRALES.encabezados),
    palabras: Number(j.palabras ?? j.nota_crecio_palabras ?? nc.palabras ?? UMBRALES.palabras),
  };
}

export function idCandidato(tipo, carpeta, nota = '') {
  return createHash('sha1').update(`${tipo}|${carpeta}|${nota}`).digest('hex').slice(0, 8);
}

const rutaDescartados = (vault) => join(vault, '.cerebro', 'jerarquia.json');
const rutaSelloHoy = (vault) => join(vault, '.cerebro', 'cache', 'jerarquia-hoy.json');

function leerDescartados(vault) {
  const ruta = rutaDescartados(vault);
  if (!existsSync(ruta)) return {};
  try {
    return JSON.parse(readFileSync(ruta, 'utf8')).descartados || {};
  } catch {
    return {};
  }
}

// Recorre las carpetas de Áreas y Proyectos para conocer sus subcarpetas directas sin releer notas.
function mapaSubcarpetas(vault, base) {
  const subcarpetas = new Map();
  const recorrer = (abs) => {
    let entradas;
    try {
      entradas = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const hijos = entradas
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    const rel = posix(relative(vault, abs));
    if (ubicar(rel).base && (!base || rel === base || rel.startsWith(`${base}/`))) {
      subcarpetas.set(rel, hijos);
    }
    for (const h of hijos) recorrer(join(abs, h));
  };
  for (const raiz of [C.proyectos, C.areas]) {
    const abs = join(vault, raiz);
    if (existsSync(abs)) recorrer(abs);
  }
  return subcarpetas;
}

// Cuenta encabezados ## y palabras del cuerpo sin frontmatter ni el bloque automático de OKT.
function metricasNota(cuerpo) {
  const limpio = String(cuerpo || '')
    .replace(/\r\n/g, '\n')
    .replace(/<!--\s*okt:inicio\s*-->[\s\S]*?<!--\s*okt:fin\s*-->/g, '');
  const encabezados = (limpio.match(/^##[ \t]+.+$/gm) || []).length;
  const palabras = (limpio.match(/\S+/g) || []).length;
  return { encabezados, palabras };
}

function esNotaElegibleCrecio(nota) {
  if (nota.datos.tipo !== 'nota') return false;
  if (nota.nombre.startsWith(EMOJI.articulo) || nota.nombre.startsWith(EMOJI.fuente)) return false;
  const sub = String(nota.datos.subtipo || nota.datos.formato || '').toLowerCase();
  if (['articulo', 'fuente', 'libro'].includes(sub)) return false;
  return true;
}

export function detectar(vault, { carpeta, todos = false } = {}) {
  const base = carpeta && carpeta !== true ? resolverCarpeta(vault, carpeta) : null;
  if (base && !(base === C.areas || base === C.proyectos || base.startsWith(`${C.areas}/`) || base.startsWith(`${C.proyectos}/`))) {
    throw errorUso(`«${carpeta}» no está dentro de Áreas ni Proyectos.`);
  }
  if (base && !existsSync(join(vault, base))) throw errorUso(`No encontré «${carpeta}».`);

  const umbrales = umbralesDe(vault);
  const subcarpetasPorDir = mapaSubcarpetas(vault, base);
  const notasPorDir = new Map();

  // Cada nota dentro del alcance se lee una sola vez.
  const rutasNotas = listarNotas(vault).filter((r) => ubicar(r).base && (!base || r === base || r.startsWith(`${base}/`)));
  for (const rel of rutasNotas) {
    const nota = leerNota(vault, rel);
    const dir = dirname(rel);
    if (!notasPorDir.has(dir)) notasPorDir.set(dir, []);
    notasPorDir.get(dir).push(nota);
    if (!subcarpetasPorDir.has(dir)) subcarpetasPorDir.set(dir, []);
  }

  const carpetas = [...subcarpetasPorDir.keys()].sort((a, b) => a.localeCompare(b));
  const candidatos = [];

  for (const dir of carpetas) {
    const notasDir = notasPorDir.get(dir) || [];
    const subcarpetas = subcarpetasPorDir.get(dir) || [];
    const nombreCarpeta = basename(dir);
    const principal = notasDir.find((n) => n.nombre === nombreCarpeta);
    const otras = notasDir.filter((n) => n.nombre !== nombreCarpeta);

    const sueltas = otras.filter((n) => ['nota', 'fuente'].includes(n.datos.tipo || 'nota'));
    if (sueltas.length >= umbrales.notas_sueltas) {
      const nombres = sueltas.map((n) => n.nombre);
      candidatos.push({
        id: idCandidato('notas_sueltas', dir),
        tipo: 'notas_sueltas',
        carpeta: dir,
        detalle: `${ nombres.length } notas directas sin agrupar en temas: ${nombres.join(', ')}`,
        notas: nombres,
      });
    }

    if (subcarpetas.length >= umbrales.rama_plana) {
      candidatos.push({
        id: idCandidato('rama_plana', dir),
        tipo: 'rama_plana',
        carpeta: dir,
        detalle: `${subcarpetas.length} subcarpetas directas: conviene crear una rama intermedia (${subcarpetas.join(', ')})`,
        notas: subcarpetas,
      });
    }

    for (const n of otras) {
      if (!esNotaElegibleCrecio(n)) continue;
      const { encabezados, palabras } = metricasNota(n.cuerpo);
      if (encabezados >= umbrales.encabezados && palabras >= umbrales.palabras) {
        candidatos.push({
          id: idCandidato('nota_crecio', dir, n.nombre),
          tipo: 'nota_crecio',
          carpeta: dir,
          detalle: `«${n.nombre}» tiene ${encabezados} encabezados ## y ${palabras} palabras: candidata a convertirse en tema`,
          notas: [n.nombre],
        });
      }
    }

    if (principal?.datos.tipo === 'tema' && subcarpetas.length === 0 && otras.length === 1) {
      const nombres = otras.map((n) => n.nombre);
      candidatos.push({
        id: idCandidato('tema_casi_vacio', dir),
        tipo: 'tema_casi_vacio',
        carpeta: dir,
        detalle: `tema sin subcarpetas y con solo 1 nota (${nombres[0]}): candidato a subirla al padre y archivar el tema`,
        notas: nombres,
      });
    }
  }

  if (todos) return candidatos;
  const descartados = leerDescartados(vault);
  return candidatos.filter((c) => !descartados[c.id]);
}

export function descartar(vault, id) {
  const limpio = String(id || '').trim();
  if (!limpio) throw errorUso('Uso: okt jerarquia descartar <id>');
  const actual = detectar(vault, { todos: true }).find((c) => c.id === limpio);
  if (!actual) throw errorUso(`No hay ningún candidato actual con el id «${limpio}».`);
  const hoy = fechaISO();
  const descartados = { ...leerDescartados(vault), [limpio]: hoy };
  const ruta = rutaDescartados(vault);
  mkdirSync(dirname(ruta), { recursive: true });
  sobrescribir(ruta, `${JSON.stringify({ descartados }, null, 2)}\n`);
  return {
    texto: `Descartado ${limpio} (${actual.tipo} en ${actual.carpeta}).`,
    datos: { id: limpio, fecha: hoy, descartados },
  };
}

export function jerarquia(vault, op = {}) {
  const candidatos = detectar(vault, op);
  if (!candidatos.length) return { texto: 'La jerarquía está al día.', datos: { candidatos: [] } };
  const bloques = [];
  for (const tipo of ['notas_sueltas', 'rama_plana', 'nota_crecio', 'tema_casi_vacio']) {
    const delTipo = candidatos.filter((c) => c.tipo === tipo);
    if (!delTipo.length) continue;
    bloques.push(`### ${TITULOS_TIPO[tipo]} (${tipo})\n${delTipo.map((c) => `- [${c.id}] ${c.carpeta} — ${c.detalle}`).join('\n')}`);
  }
  const texto = `${bloques.join('\n\n')}\n\n${SIGUIENTE_PASO}`;
  return { texto, datos: { candidatos } };
}

export function avisoInicio(vault) {
  try {
    if (!vault) return '';
    const candidatos = detectar(vault);
    if (!candidatos.length) return '';
    const hoy = fechaISO();
    const ids = [...new Set(candidatos.map((c) => c.id))].sort();
    const ruta = rutaSelloHoy(vault);
    if (existsSync(ruta)) {
      try {
        const previo = JSON.parse(readFileSync(ruta, 'utf8'));
        const prevIds = Array.isArray(previo.ids) ? [...new Set(previo.ids)].sort() : [];
        const mismosIds = prevIds.length === ids.length && prevIds.every((x, i) => x === ids[i]);
        if (mismosIds && /^\d{4}-\d{2}-\d{2}$/.test(previo.fecha || '') && diasEntre(previo.fecha) < 7) {
          return '';
        }
      } catch {}
    }
    mkdirSync(dirname(ruta), { recursive: true });
    sobrescribir(ruta, `${JSON.stringify({ fecha: hoy, ids }, null, 2)}\n`);
    const n = new Set(candidatos.map((c) => c.carpeta)).size;
    return `Jerarquía: ${n} carpetas podrían ordenarse de lo general a lo específico (okt jerarquia). Propónselo al usuario cuando termine lo que te pida; no muevas nada sin su sí.`;
  } catch {
    return '';
  }
}

export function avisosLint(vault) {
  return detectar(vault).map((c) => ({
    nivel: 'aviso',
    regla: c.tipo,
    archivo: c.carpeta,
    detalle: c.detalle,
  }));
}
