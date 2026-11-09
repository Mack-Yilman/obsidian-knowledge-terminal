// Flujo mecánico de un libro (EPUB, PDF, DOCX, MOBI, AZW3, FB2) con todo-a-markdown:
//   preparar(vault, archivo, { en, titulo, autor, publicado })
//   aplicar(vault, titulo, { aceptar, excluir })
//   verificar(vault, titulo)
//   pendientes(vault)
//   sanear(md) -> { texto, cambios }
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, basename, extname, resolve, isAbsolute, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { resolverBinario, ejecutar, jsonDe } from './binarios.mjs';
import { C, R } from './estructura.mjs';
import { temaNuevo } from './organizar.mjs';
import { carpetaDeDestino } from './notas.mjs';
import { limpiarNombre, sinEmoji, empiezaConEmoji, emojiInicial, nombreValido, recortar } from './nombres.mjs';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { sobrescribir, dentroDe, posix } from './rutas.mjs';
import { fechaISO } from './fechas.mjs';
import { listarNotas, extraerEnlaces } from './vault.mjs';

const EXTENSIONES = new Set(['.epub', '.pdf', '.docx', '.mobi', '.azw3', '.fb2']);

const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });

const lista = (v) =>
  Array.isArray(v)
    ? v.map((s) => String(s).trim()).filter(Boolean)
    : v && v !== true
      ? String(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

// Identificador corto y estable a partir del título sin emoji ni número.
export function idLibro(titulo) {
  const base = sinEmoji(titulo).toLowerCase();
  const slug = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  const hash = createHash('sha1').update(base).digest('hex').slice(0, 8);
  return slug ? `${slug}-${hash}` : hash;
}

const dirCacheLibro = (vault, id) => join(vault, '.cerebro', 'cache', `libro-${id}`);

// Saneamiento propio de OKT sin cambiar ninguna otra palabra.
export function sanear(md) {
  const crudo = String(md).replace(/\r\n/g, '\n');
  let notasEncabezado = 0;
  let notasTexto = 0;
  let lineasBlanco = 0;

  // 1. Llamadas a notas al pie al final de un encabezado: ## Título[19], ## Título<sup>19</sup>, ## Título[^19]
  let texto = crudo.replace(/^(#{1,6}[ \t]+.+?)(?:[ \t]*(?:\[\^?\d+\]|<sup>\d+<\/sup>))+[ \t]*$/gm, (_, prefijo) => {
    notasEncabezado++;
    return prefijo.replace(/[ \t]+$/, '');
  });

  // 2. ^[[19]] -> (19)
  texto = texto.replace(/\^\[\[(\d+)\]\]/g, (_, n) => {
    notasTexto++;
    return `(${n})`;
  });

  // 3. Más de 2 líneas en blanco seguidas -> 1 línea en blanco (2 saltos de línea: \n\n)
  texto = texto.replace(/\n(?:[ \t]*\n){2,}/g, () => {
    lineasBlanco++;
    return '\n\n';
  });

  return {
    texto,
    cambios: {
      notas_encabezado: notasEncabezado,
      notas_texto: notasTexto,
      lineas_en_blanco: lineasBlanco,
      total: notasEncabezado + notasTexto + lineasBlanco,
    },
  };
}

// Etiqueta limpia para el índice: sin ![[...]], sin **, sin llamadas a notas al pie.
function limpiarEtiqueta(encabezado) {
  return String(encabezado)
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\*\*/g, '')
    .replace(/(?:\[\^?\d+\]|<sup>\d+<\/sup>)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Si un encabezado ## trae imágenes incrustadas ![[...]], las baja a la línea siguiente para que el ancla
// del capítulo sea limpia y el índice de la ficha nunca contenga ![[.
function separarImagenesDeEncabezados(md) {
  return md.replace(/^(##[ \t]+)(.+?)[ \t]*$/gm, (linea, prefijo, contenido) => {
    if (!contenido.includes('![[')) return linea;
    const imagenes = [...contenido.matchAll(/!\[\[[^\]]+\]\]/g)].map((m) => m[0]);
    if (!imagenes.length) return linea;
    const textoLimpio = contenido
      .replace(/!\[\[[^\]]+\]\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!textoLimpio) return imagenes.join('\n');
    return `${prefijo}${textoLimpio}\n\n${imagenes.join('\n')}`;
  });
}

function moverArchivoSeguro(origen, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  try {
    renameSync(origen, destino);
  } catch {
    copyFileSync(origen, destino);
    rmSync(origen, { force: true });
  }
}

function informePropuestas(tituloBase, carpetaTema, propuestas) {
  const bloques = propuestas.map((p) => {
    const muestras = (p.muestras || [])
      .slice(0, 3)
      .map((m) => `  · línea ${m.linea}: ${m.texto}`)
      .join('\n');
    return `- ${p.id} (${p.tipo}, total: ${p.total}): ${p.accion || ''}${muestras ? `\n${muestras}` : ''}`;
  });
  const texto = [
    `Propuestas de pulido para «${tituloBase}» (${propuestas.length}):`,
    ...bloques,
    `Decide con las muestras (no leas el libro entero) y ejecuta okt libro aplicar "${tituloBase}" --aceptar "p1,p3" [--excluir "<líneas>"]; si no aceptas ninguna, --aceptar "".`,
  ].join('\n');
  return {
    texto,
    datos: {
      estado: 'pendiente',
      titulo: tituloBase,
      tema: carpetaTema,
      propuestas,
    },
  };
}

// Encabezados ## fuera de bloques de código (un comentario «## …» dentro de ``` no es un capítulo).
function encabezadosH2(md) {
  const sinCodigo = String(md).replace(/```[\s\S]*?```/g, '');
  return [...sinCodigo.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1].trim());
}

// Un encabezado con [ ] | # ^ rompe el enlace [[nota#encabezado|etiqueta]]: no entra al índice y se informa.
const anclaSegura = (enc) => !/[[\]|#^]/.test(enc);

// Si el tema se movió o se renumeró mientras el libro esperaba decisiones, se busca por su nombre sin número.
function temaActual(vault, tema) {
  if (existsSync(join(vault, tema))) return tema;
  const base = sinEmoji(basename(tema)).toLowerCase();
  const principal = listarNotas(vault).find((r) => !r.startsWith(`${C.archivo}/`) && basename(dirname(r)) === basename(r, '.md') && sinEmoji(basename(r, '.md')).toLowerCase() === base);
  if (!principal) throw errorUso(`No encontré el tema del libro («${basename(tema)}»): ¿se archivó? Vuelve a prepararlo.`);
  return dirname(principal);
}

function terminar(vault, estado) {
  estado.tema = temaActual(vault, estado.tema);
  const mdCrudo = readFileSync(estado.md, 'utf8');
  const { datos: fmConv, cuerpo: cuerpoConvertido } = leerFrontmatter(mdCrudo);

  // 1. Mueve las imágenes enlazadas a la carpeta de adjuntos de destino si no están ahí.
  const dirAdjuntosAbs = join(vault, estado.adjuntos);
  const dirCache = dirname(estado.md);
  const dirStemAdjuntos = join(dirCache, `${estado.stem}_adjuntos`);
  const incrustados = extraerEnlaces(cuerpoConvertido).filter((e) => e.incrustado);
  let imagenesMovidas = 0;

  for (const { destino } of incrustados) {
    const nombreImg = basename(destino);
    const meta = join(dirAdjuntosAbs, nombreImg);
    if (existsSync(meta)) continue;
    const candidatos = [join(dirStemAdjuntos, nombreImg), join(dirCache, destino), join(dirCache, nombreImg)];
    const origen = candidatos.find((c) => existsSync(c));
    if (origen) {
      moverArchivoSeguro(origen, meta);
      imagenesMovidas++;
    }
  }

  // 2. Saneamiento propio de OKT.
  // Primero se bajan las imágenes de los encabezados: así una llamada [19] queda al final y sanear la quita.
  const { texto: cuerpoSaneadoBase, cambios: cambiosSanear } = sanear(separarImagenesDeEncabezados(cuerpoConvertido));
  const cuerpoFinal = cuerpoSaneadoBase.replace(/^\n+/, '');

  // 3. Escribe en la carpeta del tema 📖 <Título> - Texto completo.md.
  const hoy = fechaISO();
  const tituloBase = estado.titulo;
  const nombreTexto = `📖 ${tituloBase} - Texto completo`;
  const nombreFicha = `📄 ${tituloBase}`;
  const relTexto = `${estado.tema}/${nombreTexto}.md`;
  const relFicha = `${estado.tema}/${nombreFicha}.md`;

  const datosTexto = {
    tipo: 'fuente',
    creado: hoy,
    actualizado: hoy,
    estado: 'revisado',
    resumen: `Texto íntegro de ${tituloBase} en Markdown, con navegación por capítulos.`,
    aliases: [`${tituloBase} - Texto completo`],
    fuentes: [`[[${nombreFicha}]]`],
  };
  sobrescribir(join(vault, relTexto), escribirFrontmatter(datosTexto, `\n${cuerpoFinal}`));

  // 4. Escribe la ficha 📄 <Título>.md en la misma carpeta.
  const encabezados = encabezadosH2(cuerpoFinal);
  const sinIndice = encabezados.filter((enc) => !anclaSegura(enc));
  const lineasIndice = encabezados.filter(anclaSegura).map((enc) => {
    const etiqueta = limpiarEtiqueta(enc) || enc;
    return `- [[${nombreTexto}#${enc}|${etiqueta}]]`;
  });
  const notaPrincipalTema = basename(estado.tema);
  const autorFinal = estado.autor || fmConv.author || '';
  const datosFicha = {
    tipo: 'fuente',
    creado: hoy,
    actualizado: hoy,
    estado: 'borrador',
    resumen: '',
    aliases: [tituloBase],
    origen: 'archivo',
    ...(autorFinal ? { autor: autorFinal } : {}),
    ...(estado.publicado ? { publicado: estado.publicado } : {}),
  };
  const cuerpoFicha = [
    '',
    `# ${nombreFicha}`,
    '',
    '## 📌 TL;DR',
    '<!-- okt:llm Escribe un resumen ejecutivo de 3 a 5 líneas con la tesis central del libro. -->',
    '',
    '## 🔑 Puntos clave',
    '<!-- okt:llm Extrae las ideas clave y argumentos principales del libro. -->',
    '',
    '## 💡 Aplicaciones prácticas',
    '<!-- okt:llm Indica cómo aplicar las ideas del libro en tus proyectos o áreas. -->',
    '',
    '## 📚 Estructura y Capítulos',
    ...lineasIndice,
    '',
    '## 🔗 Relacionado',
    `- [[${notaPrincipalTema}]]`,
    '',
  ].join('\n');
  sobrescribir(join(vault, relFicha), escribirFrontmatter(datosFicha, cuerpoFicha));

  // 5. Si el archivo original está dentro del vault, muévelo a R.bruto/AAAA-MM/ (si existe uno igual, " 2").
  let relBruto = null;
  let avisoOriginal;
  const relOriginal = dentroDe(vault, estado.archivo) ? posix(relative(vault, estado.archivo)) : '';
  if (relOriginal.startsWith(`${R.bruto}/`) || relOriginal.startsWith(`${R.adjuntos}/`)) {
    // Ya estaba guardado (Bruto o adjuntos, con sus registros): moverlo lo dejaría huérfano.
    avisoOriginal = `El original ya estaba guardado y no se movió: ${relOriginal}`;
  } else if (relOriginal && existsSync(estado.archivo)) {
    const dirBruto = `${R.bruto}/${hoy.slice(0, 7)}`;
    mkdirSync(join(vault, dirBruto), { recursive: true });
    const ext = extname(estado.archivo);
    const stemOrig = basename(estado.archivo, ext);
    let nombreDest = `${stemOrig}${ext}`;
    for (let i = 2; existsSync(join(vault, dirBruto, nombreDest)); i++) nombreDest = `${stemOrig} ${i}${ext}`;
    relBruto = `${dirBruto}/${nombreDest}`;
    moverArchivoSeguro(estado.archivo, join(vault, relBruto));
    avisoOriginal = `Original movido a Bruto: ${relBruto}`;
  } else {
    avisoOriginal = `El archivo original está fuera del vault y no se tocó: ${posix(estado.archivo)}`;
  }

  // 6. Borra la carpeta .cerebro/cache/libro-<id>/ solo si todo salió bien.
  rmSync(dirCache, { recursive: true, force: true });

  // 7. Informe para el LLM.
  const palabras = estado.conversion?.metricas?.palabras ?? cuerpoFinal.split(/\s+/).filter(Boolean).length;
  const totalImagenes = estado.conversion?.metricas?.imagenes ?? incrustados.length;
  const avisos = estado.conversion?.avisos || [];
  const muestras = encabezados.slice(0, 5);
  const texto = [
    `Libro preparado: «${tituloBase}»`,
    `- Palabras: ${palabras} · Capítulos (##): ${encabezados.length} · Imágenes: ${totalImagenes} (${imagenesMovidas} movidas a adjuntos)`,
    `- Avisos de conversión: ${avisos.length ? avisos.join('; ') : 'ninguno'}`,
    `- Cambios de pulir: ${JSON.stringify(estado.pulir?.cambios || {})} · Cambios de sanear: ${JSON.stringify(cambiosSanear)}`,
    `- Muestra de encabezados (hasta 5): ${muestras.join(' | ') || 'ninguno'}`,
    ...(sinIndice.length ? [`- Fuera del índice (llevan [ ] | # o ^, que rompen el enlace): ${sinIndice.slice(0, 5).join(' · ')}. Si son capítulos, quita esos signos del encabezado en el texto completo y agrega su línea al índice.`] : []),
    `- Ficha: ${relFicha}`,
    `- Texto completo: ${relTexto}`,
    `- ${avisoOriginal}`,
    `Siguiente paso: lee el índice de la ficha y los primeros párrafos de 3 o 4 capítulos (no el libro entero), escribe el TL;DR, los puntos clave y las aplicaciones en lugar de cada <!-- okt:llm … -->, completa el resumen y ejecuta okt libro verificar "${tituloBase}"`,
  ].join('\n');

  return {
    texto,
    datos: {
      estado: 'ok',
      titulo: tituloBase,
      tema: estado.tema,
      ficha: relFicha,
      textoCompleto: relTexto,
      adjuntos: estado.adjuntos,
      bruto: relBruto,
      palabras,
      capitulos: encabezados.length,
      imagenes: totalImagenes,
      avisos,
      cambiosPulir: estado.pulir?.cambios || {},
      cambiosSanear,
      muestrasEncabezados: muestras,
    },
  };
}

export function preparar(vault, archivo, op = {}) {
  if (!archivo) throw errorUso('Falta la ruta del archivo del libro (.epub, .pdf, .docx, .mobi, .azw3, .fb2).');
  const absArchivo = isAbsolute(archivo) ? archivo : resolve(vault, archivo);
  const ext = extname(absArchivo).toLowerCase();
  if (!existsSync(absArchivo) || !EXTENSIONES.has(ext)) {
    throw errorUso(`Archivo no válido o no existe: «${archivo}». Extensiones admitidas: ${[...EXTENSIONES].join(' ')}`);
  }
  if (!op.en) throw errorUso('Falta --en "<área o tema>" donde crear el tema del libro.');
  const carpetaPadre = carpetaDeDestino(vault, op.en);

  const stem = basename(absArchivo, extname(absArchivo));
  const crudoTitulo = op.titulo && op.titulo !== true ? limpiarNombre(String(op.titulo)) : limpiarNombre(stem);
  const tituloBase = sinEmoji(crudoTitulo);
  if (!tituloBase || !nombreValido(tituloBase)) throw errorUso(`Título de libro no válido: «${op.titulo || stem}».`);
  const emoji = empiezaConEmoji(crudoTitulo) ? emojiInicial(crudoTitulo) : '📚';
  const tituloConEmoji = `${emoji} ${tituloBase}`;

  if (!resolverBinario('todo-a-markdown')) {
    throw errorUso('Falta la CLI todo-a-markdown (no está en el PATH). Instálala con su skill todo-a-markdown, o convierte el libro a Markdown con esa skill y guárdalo con okt adjuntar.');
  }

  const yaEsta = listarNotas(vault).find((r) => basename(r, '.md').toLowerCase() === `📖 ${tituloBase} - Texto completo`.toLowerCase());
  if (yaEsta) throw errorUso(`El libro «${tituloBase}» ya tiene un «Texto completo»: ${yaEsta}.`, 3);

  const id = idLibro(tituloBase);
  const dirCache = dirCacheLibro(vault, id);
  mkdirSync(dirCache, { recursive: true });

  // Un PDF grande con docling tarda ~10 s por página: el tope por defecto (2 min) cortaría la conversión.
  const rConv = ejecutar('todo-a-markdown', [absArchivo, '-o', dirCache], { timeout: 30 * 60000 });
  const conv = jsonDe(rConv.salida);
  if (!rConv.ok || !conv || conv.estado === 'error') {
    throw errorUso(`Error al convertir el libro: ${conv?.motivos?.join(', ') || rConv.error || rConv.salida}`);
  }

  const rutaMd = conv.salida ? resolve(dirCache, conv.salida) : join(dirCache, `${stem}.md`);
  const { datos: fmConv } = leerFrontmatter(readFileSync(rutaMd, 'utf8'));

  const relAdjuntos = `${R.adjuntos}/📖 libros/${recortar(tituloBase, 40).trim()}`;
  const absAdjuntos = join(vault, relAdjuntos);
  const rPulir = ejecutar('todo-a-markdown', ['pulir', rutaMd, '--obsidian', '--adjuntos', absAdjuntos], { timeout: 10 * 60000 });
  const resPulir = jsonDe(rPulir.salida);
  if (!rPulir.ok || !resPulir || resPulir.estado === 'error') {
    throw errorUso(`Error al pulir el libro: ${rPulir.error || rPulir.salida}`);
  }

  // El tema se crea recién ahora: si la conversión falla, el vault queda como estaba.
  const resTema = temaNuevo(vault, `${carpetaPadre}/${tituloConEmoji}`);
  const carpetaTema = dirname(resTema.datos.ruta);

  const estado = {
    id,
    archivo: absArchivo,
    stem,
    tema: carpetaTema,
    md: rutaMd,
    titulo: tituloBase,
    autor: op.autor && op.autor !== true ? String(op.autor) : fmConv.author || '',
    publicado: op.publicado && op.publicado !== true ? String(op.publicado) : '',
    adjuntos: relAdjuntos,
    conversion: conv,
    pulir: resPulir,
    propuestas: resPulir.propuestas || [],
  };
  writeFileSync(join(dirCache, 'estado.json'), `${JSON.stringify(estado, null, 2)}\n`);

  if (resPulir.estado === 'pendiente') {
    return informePropuestas(tituloBase, carpetaTema, estado.propuestas);
  }
  return terminar(vault, estado);
}

function leerPendientesInterno(vault) {
  const baseCache = join(vault, '.cerebro', 'cache');
  if (!existsSync(baseCache)) return [];
  const salida = [];
  for (const e of readdirSync(baseCache, { withFileTypes: true })) {
    if (!e.isDirectory() || !e.name.startsWith('libro-')) continue;
    const rutaEstado = join(baseCache, e.name, 'estado.json');
    if (!existsSync(rutaEstado)) continue;
    try {
      salida.push(JSON.parse(readFileSync(rutaEstado, 'utf8')));
    } catch {}
  }
  return salida;
}

export function pendientes(vault) {
  const items = leerPendientesInterno(vault);
  if (!items.length) return { texto: 'No hay libros pendientes.', datos: { pendientes: [] } };
  const lineas = items.map((x) => `- ${x.titulo} (${x.propuestas?.length || 0} propuestas) → ${x.tema}`);
  return {
    texto: `Libros pendientes (${items.length}):\n${lineas.join('\n')}`,
    datos: { pendientes: items },
  };
}

export function aplicar(vault, titulo, { aceptar = '', excluir = '' } = {}) {
  const buscado = sinEmoji(titulo || '').toLowerCase();
  if (!buscado) throw errorUso('Falta el título del libro a aplicar.');
  const estado = leerPendientesInterno(vault).find((x) => sinEmoji(x.titulo).toLowerCase() === buscado);
  if (!estado) throw errorUso(`No hay ningún libro a medias con el título «${sinEmoji(titulo)}».`);

  const dirCache = dirname(estado.md);
  const decisiones = {
    aceptar: lista(aceptar),
    excluir_lineas: lista(excluir)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0),
  };
  const rutaDecisiones = join(dirCache, 'decisiones.json');
  writeFileSync(rutaDecisiones, `${JSON.stringify(decisiones, null, 2)}\n`);

  const r = ejecutar('todo-a-markdown', ['pulir', estado.md, '--aplicar', rutaDecisiones], { timeout: 10 * 60000 });
  const resAplicar = jsonDe(r.salida);
  if (!r.ok || !resAplicar || resAplicar.estado === 'error') {
    throw errorUso(`Error al aplicar decisiones en el libro: ${r.error || r.salida}`);
  }
  estado.pulir = {
    ...estado.pulir,
    ...resAplicar,
    cambios: { ...(estado.pulir?.cambios || {}), ...(resAplicar.cambios || {}) },
  };
  return terminar(vault, estado);
}

export function verificar(vault, titulo) {
  const base = sinEmoji(titulo || '');
  if (!base) throw errorUso('Falta el título del libro a verificar.');
  const notas = listarNotas(vault).filter((r) => !r.startsWith(`${C.archivo}/`));
  const relFicha = notas.find(
    (r) => basename(r, '.md').toLowerCase() === `📄 ${base}`.toLowerCase() || (basename(r, '.md').startsWith('📄 ') && sinEmoji(basename(r, '.md')).toLowerCase() === base.toLowerCase()),
  );
  if (!relFicha) throw errorUso(`No encontré la ficha del libro «${base}».`);

  const carpeta = dirname(relFicha);
  const tituloReal = sinEmoji(basename(relFicha, '.md'));
  const relTexto = `${carpeta}/📖 ${tituloReal} - Texto completo.md`;
  const problemas = [];

  const { datos: fmFicha, cuerpo: cuerpoFichaRaw } = leerFrontmatter(readFileSync(join(vault, relFicha), 'utf8'));
  const cuerpoFicha = cuerpoFichaRaw.replace(/\r\n/g, '\n');

  if (!String(fmFicha.resumen || '').trim()) {
    problemas.push('El resumen de la ficha está vacío.');
  }
  if (cuerpoFicha.includes('<!-- okt:llm')) {
    problemas.push('Quedan marcadores <!-- okt:llm en la ficha.');
  }

  const mIndice = cuerpoFicha.match(/^##[ \t]+📚[ \t]+Estructura y Capítulos[ \t]*\n([\s\S]*?)(?=^##[ \t]+|$(?![\s\S]))/m);
  const seccionIndice = mIndice ? mIndice[1] : '';
  if (seccionIndice.includes('![[')) {
    problemas.push('El índice de la ficha contiene ![[.');
  }

  if (!existsSync(join(vault, relTexto))) {
    problemas.push(`Falta el texto completo: ${relTexto}`);
  } else {
    const { cuerpo: cuerpoTextoRaw } = leerFrontmatter(readFileSync(join(vault, relTexto), 'utf8'));
    const cuerpoTexto = cuerpoTextoRaw.replace(/\r\n/g, '\n');
    const encabezadosTexto = new Set(encabezadosH2(cuerpoTexto));

    const enlacesIndice = [...seccionIndice.matchAll(/^\s*-\s*\[\[([^\n]+?)\]\]/gm)].map((m) => m[1]);
    for (const raw of enlacesIndice) {
      const destinoYAncla = raw.includes('|') ? raw.slice(0, raw.lastIndexOf('|')) : raw;
      const idx = destinoYAncla.indexOf('#');
      const ancla = idx >= 0 ? destinoYAncla.slice(idx + 1).trim() : '';
      if (!ancla || !encabezadosTexto.has(ancla)) {
        problemas.push(`El enlace del índice «#${ancla}» no apunta a un ## existente en el texto completo.`);
      }
    }
  }

  const ok = problemas.length === 0;
  return {
    texto: ok ? `Libro verificado: «${tituloReal}» cumple todas las comprobaciones.` : `Problemas en «${tituloReal}»:\n${problemas.map((p) => `- ${p}`).join('\n')}`,
    datos: { ok, problemas },
  };
}
