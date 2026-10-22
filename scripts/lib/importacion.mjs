// Base común de las importaciones (Notion, Drive/Docs, NotebookLM). Reglas del contrato:
// - solo a pedido y sobre lo que el usuario elige (sin --seleccion, solo se lista);
// - la fuente no se modifica;
// - lo importado va entre marcas okt, así reimportar actualiza la misma nota sin pisar lo que el
//   usuario agregó fuera de ellas;
// - si el contenido parece traer datos de pacientes, no se escribe (salvo --forzar).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { escribirFrontmatter, leerFrontmatter } from './frontmatter.mjs';
import { reemplazarBloque } from './bloques.mjs';
import { fechaISO } from './fechas.mjs';
import { limpiarNombre } from './nombres.mjs';
import { mapaDeNombres } from './vault.mjs';
import { patronSensible } from './sensibles.mjs';
import { posix } from './rutas.mjs';

export const errorUso = (m) => Object.assign(new Error(m), { codigo: 2 });

const rutaRegistro = (vault) => join(vault, '.cerebro', 'importaciones.json');

export function leerRegistro(vault) {
  try {
    return JSON.parse(readFileSync(rutaRegistro(vault), 'utf8'));
  } catch {
    return {};
  }
}

function guardarRegistro(vault, registro) {
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  writeFileSync(rutaRegistro(vault), `${JSON.stringify(registro, null, 2)}\n`);
}

// "1,3-5" o "todo" → índices (base 0) válidos para una lista de n elementos.
export function parsearSeleccion(sel, n) {
  if (sel === true || sel === 'todo' || sel === 'todos') return [...Array(n).keys()];
  const idx = new Set();
  for (const parte of String(sel).split(',')) {
    const [a, b] = parte.split('-').map((x) => Number(x.trim()));
    if (!Number.isInteger(a)) throw errorUso(`Selección inválida: «${sel}». Usa números de la lista (p. ej. 1,3-5) o «todo».`);
    for (let i = a; i <= (Number.isInteger(b) ? b : a); i++) {
      if (i < 1 || i > n) throw errorUso(`El ${i} no está en la lista (hay ${n}).`);
      idx.add(i - 1);
    }
  }
  return [...idx].sort((x, y) => x - y);
}

export function revisarSensible(texto, op, quien) {
  const p = patronSensible(texto);
  if (p && !op.forzar) {
    throw Object.assign(new Error(`No importé «${quien}»: el contenido parece incluir ${p.que}. El vault no guarda datos de pacientes ni de terceros. Si estás seguro de que no lo es, repite con --forzar.`), { codigo: 4 });
  }
}

// Escribe o actualiza la nota importada. clave = "notion:<id>", "drive:<id>", "notebooklm:<id>".
export function escribirImportada(vault, { clave, titulo, contenido, datos = {}, carpeta, op = {} }) {
  const registro = leerRegistro(vault);
  const previa = registro[clave];
  const hoy = fechaISO();
  // El nombre del adjunto se guarda para que reimportar reemplace el mismo archivo y no otro.
  const adjunto = datos.adjunto ? String(datos.adjunto).replace(/^\[\[|\]\]$/g, '') : previa?.adjunto;
  if (previa && existsSync(join(vault, previa.ruta)) && !previa.ruta.startsWith('90-Archivo/')) {
    const abs = join(vault, previa.ruta);
    const texto = readFileSync(abs, 'utf8');
    const { datos: fm, cuerpo } = leerFrontmatter(texto);
    const nuevo = escribirFrontmatter({ ...fm, ...datos, importado: hoy, actualizado: hoy }, reemplazarBloque(cuerpo, contenido.trim()));
    writeFileSync(abs, nuevo);
    registro[clave] = { ...previa, importado: hoy, ...(adjunto ? { adjunto } : {}) };
    guardarRegistro(vault, registro);
    return { ruta: previa.ruta, accion: 'actualizada' };
  }
  const destino = op.carpeta || carpeta || '00-Bandeja/importados';
  const base = limpiarNombre(titulo) || 'Sin título';
  let nombre = base;
  const nombres = mapaDeNombres(vault);
  for (let i = 2; nombres.has(nombre.toLowerCase()); i++) nombre = `${base} ${i}`;
  const rel = `${destino}/${nombre}.md`;
  const fm = { tipo: 'nota', creado: hoy, actualizado: hoy, ...datos, importado: hoy };
  const cuerpo = `\n# ${nombre}\n\nImportado de ${datos.origen || 'una fuente externa'} el ${hoy}. Lo que está entre las marcas se reemplaza si vuelves a importar; escribe tus notas fuera de ellas.\n\n<!-- okt:inicio -->\n${contenido.trim()}\n<!-- okt:fin -->\n`;
  mkdirSync(join(vault, destino), { recursive: true });
  writeFileSync(join(vault, rel), escribirFrontmatter(fm, cuerpo));
  registro[clave] = { ruta: rel, importado: hoy, ...(adjunto ? { adjunto } : {}) };
  guardarRegistro(vault, registro);
  return { ruta: rel, accion: 'creada' };
}

const EXT_POR_TIPO = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'application/pdf': '.pdf' };

// Descarga un archivo a 40-Fuentes/adjuntos/<origen>/ y devuelve su nombre (para ![[nombre]]).
export async function descargarAdjunto(vault, url, origen, base) {
  const dir = join(vault, '40-Fuentes', 'adjuntos', origen);
  mkdirSync(dir, { recursive: true });
  let bytes;
  let tipo = '';
  if (process.env.OKT_FAKE_DESCARGAS === '1') {
    bytes = Buffer.from(`fake ${url}`);
  } else {
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    tipo = (r.headers.get('content-type') || '').split(';')[0];
    bytes = Buffer.from(await r.arrayBuffer());
  }
  let ext = extname(new URL(url).pathname).toLowerCase();
  if (!ext || ext.length > 5) ext = EXT_POR_TIPO[tipo] || '.bin';
  let nombre = `${limpiarNombre(base)}${ext}`;
  for (let i = 2; existsSync(join(dir, nombre)); i++) nombre = `${limpiarNombre(base)} ${i}${ext}`;
  writeFileSync(join(dir, nombre), bytes);
  return nombre;
}

export function rutaAdjunto(origen, nombre) {
  return posix(join('40-Fuentes', 'adjuntos', origen, nombre));
}

export function asegurarCarpeta(vault, rel) {
  mkdirSync(join(vault, dirname(rel)), { recursive: true });
}
