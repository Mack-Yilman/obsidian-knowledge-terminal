// okt numerar [--carpeta X] [--orden plan.json] [--aplicar]: pone «NN │ » a las carpetas de áreas, proyectos y temas
// (y a su nota principal), para que Obsidian las muestre en el orden que el usuario elige.
// - Sin --orden, el número es fijo: lo que ya tiene número no cambia y lo demás toma el siguiente libre.
// - Con --orden ({"<carpeta padre>": ["<hija 1>", "<hija 2>", …]}), esas hermanas se renumeran 1, 2, 3… en ese orden
//   (las no nombradas van detrás). Lo propone la IA según el dominio y lo confirma el usuario.
// Todo en lote: los enlaces del vault se reescriben una sola vez, y el resultado queda en un commit que se deshace con
// git revert.
import { readFileSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { sobrescribir, guardarConfigVault, posix } from './rutas.mjs';
import { C, resolverCarpeta } from './estructura.mjs';
import { numeroDe, conNumero, sinEmoji, sinNumero } from './nombres.mjs';
import { reescribirVault, actualizarRegistros } from './migrar.mjs';
import { actualizarAgents } from './init.mjs';
import { cerrar } from './sistema.mjs';
import { commit } from './git.mjs';

const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });
const RAICES = [C.areas, C.proyectos];
// Windows corta en 260 caracteres; por encima de esto, git y otras herramientas fallan (ver ruta_larga del lint).
const TOPE_RUTA = 240;

// Carpetas que son área, proyecto o tema: tienen dentro una nota con su mismo nombre.
function hijasPrincipales(vault, padre) {
  try {
    return readdirSync(join(vault, padre), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(vault, padre, e.name, `${e.name}.md`)))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

const base = (n) => sinEmoji(n).toLowerCase();

// Orden actual: primero las numeradas (por su número), luego las demás por nombre.
const ordenActual = (nombres) =>
  [...nombres].sort((a, b) => (numeroDe(a) ?? Infinity) - (numeroDe(b) ?? Infinity) || sinEmoji(a).localeCompare(sinEmoji(b), 'es'));

function leerOrden(vault, archivo) {
  if (!archivo || archivo === true) return new Map();
  let json;
  try {
    json = JSON.parse(readFileSync(resolve(String(archivo)), 'utf8'));
  } catch (e) {
    throw errorUso(`No pude leer el orden «${archivo}»: ${e.message}`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw errorUso('El orden es un objeto: {"<carpeta padre>": ["<hija 1>", "<hija 2>"]}.');
  const mapa = new Map();
  for (const [padre, hijas] of Object.entries(json)) {
    const rel = RAICES.includes(padre) ? padre : resolverCarpeta(vault, padre);
    if (!existsSync(join(vault, rel))) throw errorUso(`No encontré la carpeta «${padre}» del orden.`);
    if (!Array.isArray(hijas)) throw errorUso(`«${padre}»: el valor es una lista de nombres.`);
    // Una hija repetida en el orden contaría dos veces.
    const unicas = [...new Map(hijas.map((h) => [base(h), { nombre: String(h), base: base(h) }])).values()];
    mapa.set(rel, unicas);
  }
  return mapa;
}

// Calcula el nombre nuevo de cada carpeta (ruta vieja → nombre nuevo), de arriba abajo.
function planificar(vault, op) {
  const orden = leerOrden(vault, op.orden);
  const raiz = op.carpeta ? resolverCarpeta(vault, op.carpeta) : null;
  if (raiz && !RAICES.some((r) => raiz === r || raiz.startsWith(`${r}/`))) throw errorUso(`«${op.carpeta}» no es un área, un proyecto ni un tema.`);
  if (raiz && !existsSync(join(vault, raiz))) throw errorUso(`No encontré «${op.carpeta}».`);
  const cambios = []; // { padre, de, a }
  const errores = [];
  const vistas = new Set();
  const recorrer = (padre) => {
    vistas.add(padre);
    const hijas = hijasPrincipales(vault, padre);
    const pedido = orden.get(padre);
    if (pedido) {
      for (const p of pedido) if (!hijas.some((h) => base(h) === p.base)) errores.push(`«${p.nombre}» no está en ${padre}.`);
      const nombradas = pedido.map((p) => hijas.find((h) => base(h) === p.base)).filter(Boolean);
      const resto = ordenActual(hijas.filter((h) => !nombradas.includes(h)));
      [...nombradas, ...resto].forEach((h, i) => cambios.push({ padre, de: h, a: conNumero(i + 1, h) }));
    } else {
      let max = Math.max(0, ...hijas.map((h) => numeroDe(h) ?? 0));
      const usados = new Set();
      for (const h of ordenActual(hijas)) {
        const n = numeroDe(h);
        // Un número repetido entre hermanas (copias hechas a mano) también se corrige.
        if (n !== null && !usados.has(n)) usados.add(n);
        else cambios.push({ padre, de: h, a: conNumero(++max, h) });
      }
    }
    for (const h of hijas) recorrer(`${padre}/${h}`);
  };
  if (raiz) recorrer(raiz);
  else RAICES.forEach(recorrer);
  for (const p of orden.keys()) if (!vistas.has(p)) errores.push(`${p} no es un área, un proyecto ni un tema dentro de lo que se numera.`);
  if (errores.length) throw errorUso(`El orden no coincide con las carpetas (no se tocó nada):\n${errores.map((e) => `- ${e}`).join('\n')}`);
  const reales = cambios.filter((c) => c.de !== c.a);
  // Dos carpetas con el mismo nombre en lugares distintos harían ambiguos los enlaces [[nombre]].
  const porNombre = new Map();
  for (const c of reales) porNombre.set(c.de.toLowerCase(), [...(porNombre.get(c.de.toLowerCase()) || []), c]);
  const choques = [...porNombre.values()].filter((l) => l.length > 1).map((l) => `«${l[0].de}» está en ${l.map((c) => c.padre).join(' y ')}`);
  // Un nombre que también existe en otra rama (fuera de lo que se numera) haría que sus enlaces apuntaran a la nueva.
  const enVault = new Map();
  const contar = (padre) => {
    for (const h of hijasPrincipales(vault, padre)) {
      enVault.set(h.toLowerCase(), (enVault.get(h.toLowerCase()) || 0) + 1);
      contar(`${padre}/${h}`);
    }
  };
  RAICES.forEach(contar);
  for (const c of reales) {
    if ((enVault.get(c.de.toLowerCase()) || 0) > 1 && !choques.some((x) => x.includes(c.de))) choques.push(`«${c.de}» existe en más de una carpeta del vault`);
    if (enVault.has(c.a.toLowerCase())) choques.push(`«${c.a}» ya existe en el vault`);
  }
  if (choques.length) throw errorUso(`Hay carpetas con el mismo nombre y sus enlaces serían ambiguos (no se tocó nada):\n${choques.map((c) => `- ${c}`).join('\n')}\nRenombra una de cada par con okt renombrar.`, 3);
  return reales;
}

// Ruta final de una carpeta, aplicando los cambios de todas sus carpetas de arriba.
function rutaNueva(rel, nombres) {
  const partes = rel.split('/');
  return partes.map((p, i) => (i === 0 ? p : nombres.get(partes.slice(0, i + 1).join('/')) || p)).join('/');
}

function rutasLargas(vault, renombres) {
  const largas = [];
  const recorrer = (rel, relNueva) => {
    for (const e of readdirSync(join(vault, rel), { withFileTypes: true })) {
      const nuevo = `${relNueva}/${e.name === basename(rel) + '.md' ? `${basename(relNueva)}.md` : e.name}`;
      if (e.isDirectory()) recorrer(`${rel}/${e.name}`, rutaNueva(`${rel}/${e.name}`, renombres));
      else if (join(vault, nuevo).length > TOPE_RUTA) largas.push(nuevo);
    }
  };
  for (const r of RAICES) if (existsSync(join(vault, r))) recorrer(r, r);
  return largas;
}

export function numerar(vault, op = {}) {
  const cambios = planificar(vault, op);
  const renombres = new Map(cambios.map((c) => [`${c.padre}/${c.de}`, c.a])); // ruta vieja → nombre nuevo
  const largas = cambios.length ? rutasLargas(vault, renombres) : [];
  const avisoLargas = largas.length ? `\n⚠️ ${largas.length} archivos quedarían con rutas de más de ${TOPE_RUTA} caracteres (Windows corta en 260). Acorta nombres antes, o acepta el riesgo:\n${largas.slice(0, 5).map((l) => `- ${l}`).join('\n')}` : '';
  if (!op.aplicar) {
    const porPadre = new Map();
    for (const c of cambios) porPadre.set(c.padre, [...(porPadre.get(c.padre) || []), c]);
    const tabla = [...porPadre].map(([p, l]) => `\n${p}\n${l.map((c) => `  ${c.de} → ${c.a}`).join('\n')}`).join('\n');
    const texto = cambios.length
      ? `Vista previa de okt numerar: ${cambios.length} carpetas.${tabla}\n${avisoLargas}\nCambian el nombre de cada carpeta, el de su nota principal y los enlaces a ella. Para aplicar (con Obsidian cerrado): repite con --aplicar.`
      : 'Todas las carpetas ya tienen su número: no hay nada que cambiar.';
    return { texto, datos: { cambios, largas } };
  }
  // Con --carpeta se numera solo una rama: la numeración del resto del vault no se activa.
  if (!op.carpeta) guardarConfigVault(vault, { numerar_carpetas: true });
  if (!cambios.length) return { texto: 'Todas las carpetas ya tienen su número. La numeración queda activa para las nuevas.', datos: { cambios: [] } };

  commit(vault, 'okt: antes de numerar');
  // De la más profunda a la más general: así la ruta de cada una sigue siendo la vieja al renombrarla.
  const orden = [...cambios].sort((a, b) => b.padre.split('/').length - a.padre.split('/').length);
  const carpetas = {};
  const archivos = {};
  const nombres = new Map();
  for (const c of orden) {
    const dir = `${c.padre}/${c.de}`;
    renameSync(join(vault, dir, `${c.de}.md`), join(vault, dir, `${c.a}.md`));
    renameSync(join(vault, dir), join(vault, c.padre, c.a));
    nombres.set(c.de.toLowerCase(), c.a);
  }
  // Mapas para los registros de .cerebro, con las rutas finales (las de arriba también cambiaron).
  for (const c of cambios) {
    const vieja = `${c.padre}/${c.de}`;
    const nueva = rutaNueva(vieja, renombres);
    carpetas[vieja] = nueva;
    archivos[`${vieja}/${c.de}.md`] = `${nueva}/${c.a}.md`;
  }
  // Título # y alias de cada nota principal (el alias sin número ni emoji ya lo tenían; se asegura).
  for (const c of cambios) {
    const rel = archivos[`${c.padre}/${c.de}/${c.de}.md`];
    const abs = join(vault, rel);
    const { datos, cuerpo, tiene } = leerFrontmatter(readFileSync(abs, 'utf8'));
    const cuerpoNuevo = cuerpo.replace(/^# (.+?)[ \t]*$/m, (m, t) => (t === c.de ? `# ${c.a}` : m));
    if (tiene) {
      const alias = [...new Set([...[].concat(datos.aliases || []), sinEmoji(c.a)].filter(Boolean))];
      sobrescribir(abs, escribirFrontmatter({ ...datos, aliases: alias }, cuerpoNuevo));
    } else if (cuerpoNuevo !== cuerpo) sobrescribir(abs, cuerpoNuevo);
  }
  const enlaces = reescribirVault(vault, nombres);
  actualizarRegistros(vault, archivos, carpetas, nombres);
  actualizarAgents(vault);
  const r = cerrar(vault, 'mantener', `numeró ${cambios.length} carpetas`);
  const hash = r.datos.commit?.hash;
  return {
    texto: `Numeradas ${cambios.length} carpetas; enlaces actualizados en ${enlaces} notas.${avisoLargas}\n${r.texto}${hash ? `\nPara deshacerlo: git -C "${posix(vault)}" revert ${hash}` : ''}`,
    datos: { cambios, enlaces, largas, commit: r.datos.commit },
  };
}
