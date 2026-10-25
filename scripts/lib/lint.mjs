// okt lint: comprobaciones deterministas del contrato. Las contradicciones de fondo las revisa el
// modelo solo a pedido; aquí nada gasta tokens.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { listarNotas, leerNota, extraerEnlaces, mapaDeNombres, esSistema } from './vault.mjs';
import { leerConfigVault } from './rutas.mjs';
import { leerBloque } from './bloques.mjs';
import { nombreValido, empiezaConEmoji, sinEmoji } from './nombres.mjs';
import { C, R, ubicar } from './estructura.mjs';
import { diasEntre, fechaISO } from './fechas.mjs';

const ANTIGUOS = new Set(['concepto', 'entidad', 'sintesis', 'sesion']);
const REQUERIDOS = {
  actualizado: ['nota', 'tema', 'fuente', 'proyecto', 'area'],
  resumen: ['nota', 'fuente'],
  estado: ['nota', 'fuente', 'proyecto'],
};
const TIPOS = new Set(['nota', 'tema', 'fuente', 'proyecto', 'area', 'diario', 'semanal', 'captura', 'sistema', ...ANTIGUOS]);
const PRINCIPALES = new Set(['area', 'proyecto', 'tema']);

export function lint(vault) {
  const hallazgos = [];
  const agregar = (nivel, regla, archivo, detalle, linea) => hallazgos.push({ nivel, regla, archivo, detalle, ...(linea ? { linea } : {}) });
  const cfg = leerConfigVault(vault);
  const nombres = mapaDeNombres(vault);
  const notas = listarNotas(vault).map((rel) => leerNota(vault, rel));
  const porBase = new Map(notas.map((n) => [sinEmoji(n.nombre).toLowerCase(), n.nombre]));
  const principales = new Map(); // carpeta → nota principal (para comprobar su índice)

  for (const n of notas) {
    if (esSistema(n.rel)) continue;
    const archivo = n.rel.startsWith(`${C.archivo}/`);
    const bandeja = n.rel.startsWith(`${C.bandeja}/`);

    // Enlaces.
    for (const e of extraerEnlaces(n.texto)) {
      const clave = e.destino.toLowerCase().replace(/\.md$/, '');
      if (nombres.get(clave) || nombres.get(e.destino.toLowerCase())) continue;
      // [[Anemia]] cuando la nota se llama «🩸 Anemia»: Obsidian no resuelve el enlace por el alias.
      const parecida = porBase.get(sinEmoji(e.destino).toLowerCase());
      agregar(bandeja || archivo ? 'aviso' : 'error', 'enlace_roto', n.rel, `[[${e.destino}]] no existe${parecida ? `: ¿quisiste decir [[${parecida}]]?` : ''}`);
    }
    if (bandeja || archivo) continue;

    if (!nombreValido(n.nombre)) agregar('error', 'nombre_invalido', n.rel, 'El nombre lleva caracteres que rompen enlaces (: / \\ ? * " < > | # ^ [ ] — –).');
    if (!empiezaConEmoji(n.nombre)) agregar('aviso', 'sin_emoji', n.rel, 'El nombre no empieza con un emoji: usa okt renombrar (temático en notas, temas, proyectos y áreas; el del tipo en lo demás).');
    const tipo = n.datos.tipo;
    if (!n.tieneFrontmatter || !tipo) {
      agregar('error', 'frontmatter', n.rel, 'Falta el frontmatter o el campo tipo.');
      continue;
    }
    if (!TIPOS.has(tipo)) agregar('error', 'frontmatter', n.rel, `tipo desconocido: ${tipo}`);
    if (ANTIGUOS.has(tipo)) agregar('aviso', 'tipo_antiguo', n.rel, `tipo: ${tipo} es de una versión anterior: usa ${tipo === 'sesion' ? 'captura (con origen: sesion)' : 'nota'}.`);
    if (!n.datos.creado) agregar('error', 'frontmatter', n.rel, 'falta creado');
    for (const [campo, tipos] of Object.entries(REQUERIDOS)) {
      if (tipos.includes(tipo) && !String(n.datos[campo] ?? '').trim()) agregar(campo === 'resumen' ? 'aviso' : 'error', 'frontmatter', n.rel, `falta ${campo}`);
    }
    if ((n.datos.resumen || '').length > 200) agregar('aviso', 'resumen_largo', n.rel, `El resumen tiene ${n.datos.resumen.length} caracteres (máximo 200).`);

    // Ubicación: dentro de un área o un proyecto, nunca suelta en la carpeta raíz.
    const u = ubicar(n.rel);
    const dir = dirname(n.rel);
    if ([C.areas, C.proyectos].includes(dir)) agregar('aviso', 'fuera_de_lugar', n.rel, `Está suelta en ${dir}: cada ${dir === C.areas ? 'área' : 'proyecto'} es una carpeta con su nota principal. Muévela con okt mover o conviértela en ${dir === C.areas ? 'área' : 'proyecto'}.`);
    if (['nota', 'fuente'].includes(tipo) && !u.raiz && !n.rel.startsWith(`${C.diario}/`)) agregar('aviso', 'fuera_de_lugar', n.rel, 'Las notas y las fuentes van dentro de un área o un proyecto.');
    if (PRINCIPALES.has(tipo) && basename(dir) === n.nombre) principales.set(dir, n);
    // Una nota procesada se enlaza con otras (las del bloque automático no cuentan: son de okt indice).
    if (tipo === 'nota') {
      const propio = n.cuerpo.replace(/<!-- okt:inicio -->[\s\S]*?<!-- okt:fin -->/g, '');
      if (!extraerEnlaces(propio).some((e) => e.destino.toLowerCase() !== n.nombre.toLowerCase())) agregar('aviso', 'sin_enlaces', n.rel, 'No enlaza ninguna otra nota: agrega al menos 2 en el texto o en ## Relacionado.');
    }

    // Frescura: sellos (al AAAA-MM-DD) más viejos que frescura_dias.
    const ventana = Number(n.datos.frescura_dias) || cfg.frescura_dias || 90;
    n.cuerpo.split(/\r?\n/).forEach((l) => {
      for (const m of l.matchAll(/\(al (\d{4}-\d{2}-\d{2})\)/g)) {
        const dias = diasEntre(m[1]);
        if (dias > ventana) agregar('aviso', 'sello_vencido', n.rel, `Dato con sello ${m[1]} (${dias} días; ventana ${ventana}): vuelve a verificarlo o cámbialo por un puntero.`);
      }
    });
  }

  // Índices: cada nota de un área, un proyecto o un tema aparece en el bloque «Contenido» de su carpeta, y cada
  // nota principal en el árbol de indice.md.
  let faltan = 0;
  for (const n of notas) {
    if (esSistema(n.rel) || !ubicar(n.rel).raiz) continue;
    const dir = dirname(n.rel);
    const esLaPrincipal = basename(dir) === n.nombre;
    let padre = esLaPrincipal ? dirname(dir) : dir;
    while (padre.includes('/') && !principales.has(padre)) padre = dirname(padre);
    const p = principales.get(padre);
    if (p && p !== n && !(leerBloque(p.texto) || '').includes(`[[${n.nombre}]]`)) faltan++;
  }
  const rutaIndice = join(vault, R.indice);
  const enIndice = existsSync(rutaIndice) ? leerBloque(readFileSync(rutaIndice, 'utf8')) || '' : '';
  faltan += [...principales.values()].filter((p) => !enIndice.includes(`[[${p.nombre}]]`)).length;
  if (faltan) agregar('aviso', 'indice_desactualizado', R.indice, `${faltan} notas no están en los índices automáticos: ejecuta okt indice.`);

  // Bandeja sin procesar hace más de 14 días.
  const viejas = notas.filter((n) => n.rel.startsWith(`${C.bandeja}/`) && /^\d{4}-\d{2}-\d{2}$/.test(n.datos.creado || '') && diasEntre(n.datos.creado) > 14).length;
  if (viejas) agregar('aviso', 'bandeja_vieja', `${C.bandeja}/`, `${viejas} elementos llevan más de 14 días sin procesar.`);

  const errores = hallazgos.filter((h) => h.nivel === 'error').length;
  const avisos = hallazgos.length - errores;
  const texto = hallazgos.length
    ? `Lint ${fechaISO()}: ${errores} errores, ${avisos} avisos\n${hallazgos.map((h) => `- [${h.nivel}] ${h.regla} · ${h.archivo}${h.linea ? `:${h.linea}` : ''} · ${h.detalle}`).join('\n')}`
    : `Lint ${fechaISO()}: sin hallazgos.`;
  return { texto, datos: { errores, avisos, hallazgos } };
}
