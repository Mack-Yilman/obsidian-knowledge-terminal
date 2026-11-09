// okt lint: comprobaciones deterministas del contrato. Las contradicciones de fondo las revisa el
// modelo solo a pedido; aquí nada gasta tokens.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { listarNotas, leerNota, extraerEnlaces, extraerAnclas, listarArchivos, mapaDeNombres, esSistema } from './vault.mjs';
import { normalizar } from './buscar.mjs';
import { leerConfigVault } from './rutas.mjs';
import { leerBloque } from './bloques.mjs';
import { nombreValido, empiezaConEmoji, sinEmoji, numeroDe } from './nombres.mjs';
import { C, R, ubicar, numerarActivo } from './estructura.mjs';
import { avisosLint as avisosJerarquia } from './jerarquia.mjs';
import { diasEntre, fechaISO } from './fechas.mjs';

function limpiarCodigo(texto) {
  return String(texto || '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\r\n]/g, ' '))
    .replace(/`[^`\r\n]*`/g, (m) => ' '.repeat(m.length));
}

function extraerEncabezados(texto) {
  const sinCod = limpiarCodigo(texto);
  const encabezados = [];
  for (const l of sinCod.split(/\r?\n/)) {
    const m = l.match(/^#{1,6}[ \t]+(.*)$/);
    if (m) {
      const limpio = m[1].replace(/[ \t#\r]+$/, '').trim();
      if (limpio) encabezados.push(limpio);
    }
  }
  return encabezados;
}

function tieneBloqueId(texto, id) {
  const lineas = texto.split(/\r?\n/);
  const target = id.toLowerCase();
  for (const l of lineas) {
    const r = l.replace(/[ \t\r]+$/, '').toLowerCase();
    if (r.endsWith(target)) return true;
  }
  return false;
}

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
  const cacheNotas = new Map();
  const cacheEncabezados = new Map();
  for (const n of notas) cacheNotas.set(n.rel, n.texto);

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

    // Imagen en enlace y anclas rotas (error fuera de Bandeja/Archivo, aviso dentro).
    const nivelEnlace = bandeja || archivo ? 'aviso' : 'error';
    const imagenesReportadas = new Set();

    for (const a of extraerAnclas(n.texto)) {
      if ((a.ancla && a.ancla.includes('![[')) || (a.etiqueta && a.etiqueta.includes('![['))) {
        const k = `${a.linea}:${a.crudo}`;
        if (!imagenesReportadas.has(k)) {
          imagenesReportadas.add(k);
          agregar(nivelEnlace, 'imagen_en_enlace', n.rel, `Imagen incrustada dentro de un enlace: ${a.crudo}`, a.linea);
        }
        continue;
      }

      // ancla_rota
      let textoDestino = null;
      let rutaDestino = null;

      if (!a.destino) {
        textoDestino = n.texto;
        rutaDestino = n.rel;
      } else {
        const clave = a.destino.toLowerCase().replace(/\.md$/, '');
        const rutas = nombres.get(clave) || nombres.get(a.destino.toLowerCase());
        if (!rutas || !rutas.length) continue; // Si no existe el destino, ya lo marca enlace_roto
        rutaDestino = rutas[0];
        if (!rutaDestino.toLowerCase().endsWith('.md')) continue;

        if (cacheNotas.has(rutaDestino)) {
          textoDestino = cacheNotas.get(rutaDestino);
        } else {
          try {
            textoDestino = readFileSync(join(vault, rutaDestino), 'utf8');
            cacheNotas.set(rutaDestino, textoDestino);
          } catch {
            continue;
          }
        }
      }

      const objetivo = a.destino ? `[[${a.destino}#${a.ancla}]]` : `[[#${a.ancla}]]`;
      const enDonde = a.destino ? `[[${a.destino}]]` : 'esta nota';

      if (a.bloque) {
        if (!tieneBloqueId(textoDestino, a.ancla)) {
          agregar(nivelEnlace, 'ancla_rota', n.rel, `${objetivo} no existe en ${enDonde}`, a.linea);
        }
      } else {
        let encs = cacheEncabezados.get(rutaDestino);
        if (!encs) {
          encs = extraerEncabezados(textoDestino);
          cacheEncabezados.set(rutaDestino, encs);
        }
        const anclaLimpia = a.ancla.replace(/[ \t#\r]+$/, '').trim().toLowerCase();
        // Como Obsidian: «## *Calma tus nervios*» o «## Parte 1: Inicio» se enlazan sin el formato ni los signos.
        const clave = (t) => normalizar(t).replace(/[*_`~=:#|^[\]]/g, '').replace(/\s+/g, ' ').trim();
        const existe = encs.some((h) => clave(h) === clave(anclaLimpia));
        if (!existe) {
          const normA = normalizar(anclaLimpia);
          let mejor = null;
          let maxPref = 0;
          for (const h of encs) {
            const normH = normalizar(h.replace(/[ \t#\r]+$/, '').trim());
            let p = 0;
            while (p < normA.length && p < normH.length && normA[p] === normH[p]) p++;
            if (p > maxPref) {
              maxPref = p;
              mejor = h;
            }
          }
          const sugerencia = mejor ? `: ¿quisiste decir #${mejor}?` : '';
          agregar(nivelEnlace, 'ancla_rota', n.rel, `${objetivo} no existe en ${enDonde}${sugerencia}`, a.linea);
        }
      }
    }

    // Imagen en enlaces sin ancla (ej. [[Nota|alias ![[img.png]]]])
    for (const e of extraerEnlaces(n.texto)) {
      if ((e.ancla && e.ancla.includes('![[')) || (e.etiqueta && e.etiqueta.includes('![['))) {
        const k = `${e.linea}:${e.crudo}`;
        if (!imagenesReportadas.has(k)) {
          imagenesReportadas.add(k);
          agregar(nivelEnlace, 'imagen_en_enlace', n.rel, `Imagen incrustada dentro de un enlace: ${e.crudo}`, e.linea);
        }
      }
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

  // Numeración: en un vault que numera, cada área, proyecto y tema lleva «NN │ ».
  if (numerarActivo(vault)) {
    const sinNumero = [...principales.keys()].filter((d) => d.split('/').length >= 2 && numeroDe(basename(d)) === null);
    if (sinNumero.length) agregar('aviso', 'sin_numero', sinNumero[0], `${sinNumero.length} carpetas sin número (${sinNumero.slice(0, 3).map((d) => basename(d)).join(', ')}${sinNumero.length > 3 ? '…' : ''}): okt numerar.`);
  }

  // Jerarquía: candidatos a ordenarse de lo general a lo específico (los descartados no salen).
  try {
    for (const h of avisosJerarquia(vault)) agregar(h.nivel, h.regla, h.archivo, h.detalle);
  } catch {}

  // Bandeja sin procesar hace más de 14 días.
  const viejas = notas.filter((n) => n.rel.startsWith(`${C.bandeja}/`) && /^\d{4}-\d{2}-\d{2}$/.test(n.datos.creado || '') && diasEntre(n.datos.creado) > 14).length;
  if (viejas) agregar('aviso', 'bandeja_vieja', `${C.bandeja}/`, `${viejas} elementos llevan más de 14 días sin procesar.`);

  // Rutas largas: más de 240 caracteres en la ruta absoluta (todos los archivos, incluido Sistema).
  for (const rel of listarArchivos(vault)) {
    const abs = join(vault, rel);
    if (abs.length > 240) {
      agregar('aviso', 'ruta_larga', rel, `La ruta tiene ${abs.length} caracteres (máximo 240): acorta el nombre de la nota o de una carpeta (okt renombrar).`);
    }
  }

  const errores = hallazgos.filter((h) => h.nivel === 'error').length;
  const avisos = hallazgos.length - errores;
  const texto = hallazgos.length
    ? `Lint ${fechaISO()}: ${errores} errores, ${avisos} avisos\n${hallazgos.map((h) => `- [${h.nivel}] ${h.regla} · ${h.archivo}${h.linea ? `:${h.linea}` : ''} · ${h.detalle}`).join('\n')}`
    : `Lint ${fechaISO()}: sin hallazgos.`;
  return { texto, datos: { errores, avisos, hallazgos } };
}
