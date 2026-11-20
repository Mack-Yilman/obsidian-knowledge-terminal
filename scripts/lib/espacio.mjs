// okt espacio: análisis de tamaño del vault, detección de duplicados/huérfanas/pequeñas y limpieza segura a .trash.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, renameSync, copyFileSync, rmSync } from 'node:fs';
import { join, relative, basename, extname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { R } from './estructura.mjs';
import { posix, sobrescribir, dentroDe } from './rutas.mjs';
import { fechaISO } from './fechas.mjs';
import { extraerEnlaces } from './vault.mjs';
import { reescribirEnlaces } from './migrar.mjs';
import { commit } from './git.mjs';
import { cerrar } from './sistema.mjs';
import { esBinario, tamanoGit, binariosRastreados } from './espacio-git.mjs';

const errorUso = (m, codigo = 2) => Object.assign(new Error(m), { codigo });

const IMAGENES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const PROHIBIDAS = new Set(['md', 'canvas', 'base', 'json', 'css', 'js']);
const UMBRAL_PEQUENA = 5 * 1024;
const UMBRAL_REVISAR = 20 * 1024;
const UMBRAL_GRANDE = 2 * 1024 * 1024;

const ES_PORTADA = /(^|[\s_-])(cover\d*|portada|cubierta)\.[a-z]+$/i;
const extDe = (ruta) => extname(ruta).toLowerCase().slice(1);
const esImagen = (ruta) => IMAGENES.has(extDe(ruta));
const mb = (b) => `${(b / 1048576).toLocaleString('es-PE', { maximumFractionDigits: 1 })} MB`;
const kb = (b) => `${(b / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} KB`;
const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');

// Recorre el vault completo salvo .git y .trash (incluye .obsidian y .cerebro para medir tamaños).
function recorrerVault(vault) {
  const salida = [];
  const caminar = (dir) => {
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const abs = join(dir, e.name);
      const rel = posix(relative(vault, abs));
      const primero = rel.split('/')[0];
      if (primero === '.git' || primero === '.trash') continue;
      if (e.isDirectory()) caminar(abs);
      else if (e.isFile()) {
        let bytes = 0;
        try {
          bytes = statSync(abs).size;
        } catch {}
        salida.push({ rel, abs, bytes, ext: extDe(rel) || '(sin ext)' });
      }
    }
  };
  caminar(vault);
  return salida;
}

const esRefArchivo = (rel) => {
  const r = rel.toLowerCase();
  if (r.endsWith('.md') || r.endsWith('.canvas') || r.endsWith('.base')) return true;
  return r.startsWith('.obsidian/') && (r.endsWith('.css') || r.endsWith('.json'));
};

const esNotaOPlantilla = (rel) => {
  const r = rel.toLowerCase();
  return r.endsWith('.md') || r.endsWith('.canvas') || r.endsWith('.base');
};

function corpusReferencias(vault, archivos) {
  const textos = [];
  for (const f of archivos) {
    if (!esRefArchivo(f.rel)) continue;
    try {
      textos.push(readFileSync(f.abs, 'utf8').toLowerCase());
    } catch {}
  }
  return textos;
}

function variantesNombre(nombre) {
  const s = new Set();
  for (const forma of [nombre, nombre.normalize('NFC'), nombre.normalize('NFD')]) {
    s.add(forma.toLowerCase());
    s.add(encodeURI(forma).toLowerCase());
    s.add(encodeURIComponent(forma).toLowerCase());
  }
  return [...s];
}

function estaReferenciada(nombre, corpus) {
  const vars = variantesNombre(nombre);
  return corpus.some((t) => vars.some((v) => t.includes(v)));
}

function enlazadaDesdeNotas(vault, nombre, archivosNotas) {
  const vars = new Set(variantesNombre(nombre));
  const fuentes = [];
  for (const f of archivosNotas) {
    let texto;
    try {
      texto = readFileSync(f.abs, 'utf8');
    } catch {
      continue;
    }
    const enlaces = extraerEnlaces(texto);
    const coincide = enlaces.some((e) => {
      const dest = basename(e.destino.replace(/\\$/, '')).toLowerCase();
      return vars.has(dest);
    });
    if (coincide || (!f.rel.toLowerCase().endsWith('.md') && [...vars].some((v) => texto.toLowerCase().includes(v)))) {
      fuentes.push(f.rel);
    }
  }
  return fuentes;
}

function agruparDuplicados(archivosImagenes) {
  const porHash = new Map();
  for (const f of archivosImagenes) {
    let h;
    try {
      h = sha256(f.abs);
    } catch {
      continue;
    }
    if (!porHash.has(h)) porHash.set(h, []);
    porHash.get(h).push(f);
  }
  const grupos = [];
  for (const lista of porHash.values()) {
    if (lista.length < 2) continue;
    lista.sort((a, b) => basename(a.rel).length - basename(b.rel).length || a.rel.localeCompare(b.rel));
    grupos.push({ conservar: lista[0], quitar: lista.slice(1) });
  }
  return grupos;
}

// ---------- 1. okt espacio [--breve] ----------

export function informe(vault, op = {}) {
  const archivos = recorrerVault(vault);
  const total = archivos.reduce((s, f) => s + f.bytes, 0);
  const gitBytes = tamanoGit(vault);

  const porExt = new Map();
  const porCarpeta = new Map();
  for (const f of archivos) {
    const e = porExt.get(f.ext) || { ext: f.ext, bytes: 0, cantidad: 0 };
    e.bytes += f.bytes;
    e.cantidad++;
    porExt.set(f.ext, e);

    const partes = f.rel.split('/').slice(0, -1);
    for (let nivel = 1; nivel <= Math.min(3, partes.length); nivel++) {
      const c = partes.slice(0, nivel).join('/');
      porCarpeta.set(c, (porCarpeta.get(c) || 0) + f.bytes);
    }
  }
  const extensiones = [...porExt.values()].sort((a, b) => b.bytes - a.bytes);
  const carpetas = [...porCarpeta.entries()].map(([ruta, bytes]) => ({ ruta, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, 10);

  const enAdjuntos = archivos.filter((f) => f.rel.startsWith(`${R.adjuntos}/`));
  const imagenesAdj = enAdjuntos.filter((f) => esImagen(f.rel));
  const dupGrupos = agruparDuplicados(imagenesAdj);
  const pequenas = imagenesAdj.filter((f) => f.bytes < UMBRAL_PEQUENA);
  const grandes = imagenesAdj.filter((f) => f.bytes > UMBRAL_GRANDE);

  const corpus = corpusReferencias(vault, archivos);
  const huerfanas = enAdjuntos.filter((f) => (esImagen(f.rel) || esBinario(f.rel)) && !estaReferenciada(basename(f.rel), corpus));
  const rastreados = existsSync(join(vault, '.git')) ? binariosRastreados(vault) : [];

  const datos = {
    totalBytes: total,
    gitBytes,
    archivos: archivos.length,
    carpetas,
    extensiones,
    duplicados: dupGrupos.map((g) => ({ conservar: g.conservar.rel, quitar: g.quitar.map((q) => q.rel) })),
    pequenas: pequenas.map((f) => ({ ruta: f.rel, bytes: f.bytes })),
    grandes: grandes.map((f) => ({ ruta: f.rel, bytes: f.bytes })),
    huerfanas: huerfanas.map((f) => f.rel),
    binariosGit: rastreados.length,
  };

  if (op.breve) {
    const partes = [
      `Vault: ${mb(total)}`,
      ...(gitBytes !== null ? [`.git: ${mb(gitBytes)}`] : []),
      `${dupGrupos.length} ${dupGrupos.length === 1 ? 'grupo' : 'grupos'} de imágenes duplicadas`,
      `${huerfanas.length} huérfana(s)`,
      `${pequenas.length} pequeña(s)`,
      `${grandes.length} grande(s)`,
      ...(rastreados.length ? [`${rastreados.length} binarios en git`] : []),
    ];
    return { texto: partes.join(' · '), datos };
  }

  const lineas = [
    `Espacio del vault: ${mb(total)} en ${archivos.length} archivos${gitBytes !== null ? ` · .git: ${mb(gitBytes)}` : ''}`,
    '',
    'Carpetas más pesadas (hasta 3 niveles):',
    ...(carpetas.length ? carpetas.map((c) => `- ${c.ruta}: ${mb(c.bytes)}`) : ['- (ninguna)']),
    '',
    'Por extensión:',
    ...(extensiones.slice(0, 10).map((e) => `- .${e.ext}: ${mb(e.bytes)} (${e.cantidad})`)),
    '',
    `Adjuntos (${R.adjuntos}):`,
    `- ${dupGrupos.length} ${dupGrupos.length === 1 ? 'grupo' : 'grupos'} de imágenes duplicadas`,
    `- Huérfanas (${huerfanas.length}):${huerfanas.length ? '' : ' ninguna'}`,
    ...huerfanas.slice(0, 15).map((f) => `  · ${f.rel}`),
    `- Pequeñas < 5 KB (${pequenas.length}):${pequenas.length ? '' : ' ninguna'}`,
    ...pequenas.slice(0, 15).map((f) => `  · ${f.rel} (${kb(f.bytes)})`),
    `- Grandes > 2 MB (${grandes.length}):${grandes.length ? '' : ' ninguna'}`,
    ...grandes.slice(0, 15).map((f) => `  · ${f.rel} (${mb(f.bytes)})`),
  ];

  if (rastreados.length) {
    lineas.push('', `Binarios rastreados por git (${rastreados.length}):`, ...rastreados.slice(0, 10).map((b) => `- ${b.ruta} (${mb(b.bytes)})`));
  }
  lineas.push('', '📍 okt espacio limpiar preparar');
  if (rastreados.length) lineas.push('📍 okt espacio git ignorar');

  return { texto: lineas.join('\n'), datos };
}

// ---------- 2. okt espacio limpiar preparar [--carpeta X] ----------

export function preparar(vault, op = {}) {
  let ambito = R.adjuntos;
  if (op.carpeta && op.carpeta !== true) {
    const c = posix(String(op.carpeta)).replace(/^\/+|\/+$/g, '');
    ambito = c === R.adjuntos || c.startsWith(`${R.adjuntos}/`) ? c : `${R.adjuntos}/${c}`;
  }

  const archivos = recorrerVault(vault);
  const conteoNombres = new Map();
  for (const f of archivos) {
    const n = basename(f.rel).toLowerCase();
    conteoNombres.set(n, (conteoNombres.get(n) || 0) + 1);
  }

  const enAmbito = archivos.filter((f) => f.rel === ambito || f.rel.startsWith(`${ambito}/`));
  const imagenesAmbito = enAmbito.filter((f) => esImagen(f.rel));

  // Duplicados: se omite el grupo si alguna ruta a quitar tiene un homónimo en otra carpeta del vault.
  const gruposCrudos = agruparDuplicados(imagenesAmbito);
  const duplicados = [];
  const enDuplicados = new Set();
  for (const g of gruposCrudos) {
    const ambiguo = g.quitar.some((q) => (conteoNombres.get(basename(q.rel).toLowerCase()) || 0) > 1);
    if (ambiguo) continue;
    duplicados.push({ conservar: g.conservar.rel, quitar: g.quitar.map((q) => q.rel) });
    enDuplicados.add(g.conservar.rel);
    for (const q of g.quitar) enDuplicados.add(q.rel);
  }

  const corpus = corpusReferencias(vault, archivos);
  const sinEnlazar = enAmbito.filter((f) => (esImagen(f.rel) || esBinario(f.rel)) && !estaReferenciada(basename(f.rel), corpus)).map((f) => f.rel);
  // La portada de un libro casi nunca va en el texto, pero Mack la quiere: se propone incrustarla en su ficha.
  const portadas = sinEnlazar.filter((r) => esImagen(r) && ES_PORTADA.test(basename(r)));
  const huerfanas = sinEnlazar.filter((r) => !portadas.includes(r));
  const setHuerfanas = new Set(sinEnlazar);

  const archivosNotas = archivos.filter((f) => esNotaOPlantilla(f.rel));
  const revisar = imagenesAmbito
    .filter((f) => f.bytes < UMBRAL_REVISAR && !enDuplicados.has(f.rel) && !setHuerfanas.has(f.rel))
    .map((f) => ({
      ruta: f.rel,
      bytes: f.bytes,
      enlazadaDesde: enlazadaDesdeNotas(vault, basename(f.rel), archivosNotas),
    }));

  const lote = { duplicados, huerfanas, revisar, portadas, quitar: [], webp: [] };
  const relLote = '.cerebro/cache/espacio/lote.json';
  const absLote = join(vault, relLote);
  mkdirSync(join(vault, '.cerebro', 'cache', 'espacio'), { recursive: true });
  sobrescribir(absLote, `${JSON.stringify(lote, null, 2)}\n`);

  const texto = [
    `Lote preparado en ${relLote} (ámbito: ${ambito}):`,
    `- Duplicados: ${duplicados.length} grupo(s)`,
    `- Huérfanas: ${huerfanas.length}`,
    `- Para revisar (< 20 KB): ${revisar.length}`,
    ...(portadas.length ? [`- Portadas sin enlazar: ${portadas.length} (no se borran: incrústalas en la ficha 📄 de su libro con ![[nombre]])`] : []),
    '',
    'Revisa cada imagen de «revisar» y pasa a «quitar» los logos, adornos o separadores; las portadas, tablas y gráficos se quedan.',
    'Mira también una muestra de «huerfanas»: si son figuras con información que el texto perdió, sácalas del lote y avisa.',
    `📍 okt espacio limpiar aplicar ${relLote}`,
  ].join('\n');

  return { texto, datos: { lote: relLote, ...lote } };
}

// ---------- 3. okt espacio limpiar aplicar <lote.json> ----------

function validarRutaLote(vault, ruta, vistos) {
  if (typeof ruta !== 'string' || !ruta.trim()) return 'ruta vacía';
  const r = posix(ruta.trim());
  if (isAbsolute(r) || r.split('/').includes('..')) return `ruta fuera del vault: ${ruta}`;
  if (r.split('/').some((seg) => seg.startsWith('.'))) return `ruta oculta no permitida: ${ruta}`;
  const abs = join(vault, r);
  if (!dentroDe(vault, abs)) return `ruta fuera del vault: ${ruta}`;
  if (!existsSync(abs) || !statSync(abs).isFile()) return `no existe: ${ruta}`;
  const ext = extDe(r);
  if (PROHIBIDAS.has(ext) || (!esImagen(r) && !esBinario(r))) return `tipo de archivo no permitido: ${ruta}`;
  if (vistos.has(r)) return `ruta repetida en el lote: ${ruta}`;
  vistos.add(r);
  return null;
}

function validarLote(vault, lote) {
  if (!lote || typeof lote !== 'object') throw errorUso('El lote no es un objeto JSON válido (no se tocó nada).');
  const duplicados = Array.isArray(lote.duplicados) ? lote.duplicados : [];
  const huerfanas = Array.isArray(lote.huerfanas) ? lote.huerfanas : [];
  const quitar = Array.isArray(lote.quitar) ? lote.quitar : [];
  const webp = Array.isArray(lote.webp) ? lote.webp : [];
  const vistos = new Set();
  const errores = [];

  for (const g of duplicados) {
    const errC = validarRutaLote(vault, g?.conservar, vistos);
    if (errC) {
      errores.push(errC);
      continue;
    }
    const hashC = sha256(join(vault, posix(g.conservar.trim())));
    for (const q of Array.isArray(g?.quitar) ? g.quitar : []) {
      const errQ = validarRutaLote(vault, q, vistos);
      if (errQ) {
        errores.push(errQ);
        continue;
      }
      if (sha256(join(vault, posix(q.trim()))) !== hashC) {
        errores.push(`no coincide el contenido (SHA-256) entre ${g.conservar} y ${q}`);
      }
    }
  }

  const archivos = huerfanas.length ? recorrerVault(vault) : [];
  const corpus = huerfanas.length ? corpusReferencias(vault, archivos) : [];
  for (const h of huerfanas) {
    const errH = validarRutaLote(vault, h, vistos);
    if (errH) {
      errores.push(errH);
      continue;
    }
    if (estaReferenciada(basename(posix(h.trim())), corpus)) {
      errores.push(`ya no es huérfana (tiene referencias): ${h}`);
    }
  }

  for (const q of quitar) {
    const errQ = validarRutaLote(vault, q, vistos);
    if (errQ) errores.push(errQ);
  }

  for (const w of webp) {
    const errW = validarRutaLote(vault, w, vistos);
    if (errW) {
      errores.push(errW);
      continue;
    }
    const r = posix(w.trim());
    if (extDe(r) !== 'png') errores.push(`webp solo admite .png: ${w}`);
    else if (existsSync(join(vault, `${r.slice(0, -4)}.webp`))) errores.push(`ya existe un .webp con el mismo nombre: ${w}`);
  }

  // Lo que se quita se busca por nombre en las notas: un homónimo en otra carpeta perdería sus enlaces.
  const porQuitarse = [...duplicados.flatMap((g) => (Array.isArray(g?.quitar) ? g.quitar : [])), ...quitar, ...webp].filter((r) => typeof r === 'string');
  if (porQuitarse.length) {
    const conteo = new Map();
    for (const f of recorrerVault(vault)) conteo.set(basename(f.rel).toLowerCase(), (conteo.get(basename(f.rel).toLowerCase()) || 0) + 1);
    for (const r of porQuitarse) if ((conteo.get(basename(posix(r.trim())).toLowerCase()) || 0) > 1) errores.push(`el nombre de ${r} se repite en otra carpeta del vault: renómbralo antes`);
  }

  if (errores.length) {
    throw errorUso(`Lote no válido (no se tocó nada):\n${errores.map((e) => `- ${e}`).join('\n')}`);
  }
  return { duplicados, huerfanas, quitar, webp };
}

// Elimina incrustaciones ![[nombre]] / ![[nombre|...]] y reemplaza enlaces [[nombre|alias]] por su alias (o los quita).
function quitarReferenciasEnTexto(texto, nombresQuitar) {
  return texto
    .split(/(```[\s\S]*?```)/g)
    .map((parte, i) => {
      if (i % 2) return parte;
      const lineas = parte.split('\n');
      const salida = [];
      for (const linea of lineas) {
        let cambio = false;
        const nueva = linea.replace(/(!?)\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:(\\?\|)([^\]\n]*))?\]\]/g, (m, excl, dest, sep, alias) => {
          const limpio = dest.replace(/\\$/, '').trim();
          const base = basename(limpio).toLowerCase();
          if (!nombresQuitar.has(base)) return m;
          cambio = true;
          if (excl === '!') return '';
          return alias ? alias.trim() : '';
        });
        if (!cambio) {
          salida.push(linea);
          continue;
        }
        const trimmed = nueva.trim();
        // En callout (> ![[x]]) queda «>»; en lista (- ![[x]], * ![[x]], 1. ![[x]]) o vacía se quita la línea.
        if (/^>+$/.test(trimmed)) {
          salida.push(trimmed);
        } else if (trimmed === '' || /^(?:[-*]|\d+\.)\s*$/.test(trimmed)) {
          // Omitir línea que quedó vacía o solo con marcador de lista.
        } else {
          salida.push(nueva);
        }
      }
      return salida.join('\n');
    })
    .join('');
}

function crearPapelera(vault) {
  const relDir = `.trash/okt-${fechaISO()}`;
  const absDir = join(vault, relDir);
  const absManifiesto = join(absDir, 'manifiesto.json');
  let manifiesto = {};
  if (existsSync(absManifiesto)) {
    try {
      manifiesto = JSON.parse(readFileSync(absManifiesto, 'utf8'));
    } catch {
      manifiesto = {};
    }
  }
  let seq = Object.keys(manifiesto).length + 1;
  let liberado = 0;

  const mover = (rel) => {
    const r = posix(rel.trim());
    const abs = join(vault, r);
    if (!existsSync(abs)) return;
    mkdirSync(absDir, { recursive: true });
    let bytes = 0;
    try {
      bytes = statSync(abs).size;
    } catch {}
    let nombre = `${String(seq).padStart(3, '0')}-${basename(r)}`;
    while (nombre in manifiesto || existsSync(join(absDir, nombre))) {
      seq++;
      nombre = `${String(seq).padStart(3, '0')}-${basename(r)}`;
    }
    seq++;
    const dest = join(absDir, nombre);
    try {
      renameSync(abs, dest);
    } catch {
      copyFileSync(abs, dest);
      rmSync(abs, { force: true });
    }
    manifiesto[nombre] = r;
    liberado += bytes;
  };

  const guardar = () => {
    if (!Object.keys(manifiesto).length) return;
    mkdirSync(absDir, { recursive: true });
    sobrescribir(absManifiesto, `${JSON.stringify(manifiesto, null, 2)}\n`);
  };

  return { relDir, mover, guardar, getLiberado: () => liberado };
}

function reescribirEnVault(vault, archivosNotas, nombresMap) {
  if (!nombresMap.size) return;
  for (const f of archivosNotas) {
    const texto = readFileSync(f.abs, 'utf8');
    const nuevo = reescribirEnlaces(texto, nombresMap);
    if (nuevo !== texto) sobrescribir(f.abs, nuevo);
  }
}

export function aplicar(vault, archivo) {
  if (!archivo) throw errorUso('Uso: okt espacio limpiar aplicar <lote.json> (no se tocó nada).');
  let loteCrudo;
  try {
    loteCrudo = JSON.parse(readFileSync(String(archivo), 'utf8'));
  } catch (e) {
    throw errorUso(`No pude leer el lote «${archivo}» (no se tocó nada): ${e.message}`);
  }
  const { duplicados, huerfanas, quitar, webp } = validarLote(vault, loteCrudo);

  commit(vault, 'okt: antes de limpiar espacio');

  const papelera = crearPapelera(vault);
  const archivosNotas = recorrerVault(vault).filter((f) => esNotaOPlantilla(f.rel));

  // 1. Duplicados: reescribir enlaces al conservado y mover copias a la papelera.
  const mapaDup = new Map();
  for (const g of duplicados) {
    const cons = basename(posix(g.conservar.trim()));
    for (const q of g.quitar || []) {
      const r = posix(q.trim());
      mapaDup.set(basename(r).toLowerCase(), cons);
      papelera.mover(r);
    }
  }
  reescribirEnVault(vault, archivosNotas, mapaDup);

  // 2. Quitar: eliminar incrustaciones/enlaces y mover a la papelera.
  if (quitar.length) {
    const nombresQuitar = new Set(quitar.map((q) => basename(posix(q.trim())).toLowerCase()));
    for (const f of archivosNotas) {
      const texto = readFileSync(f.abs, 'utf8');
      const nuevo = quitarReferenciasEnTexto(texto, nombresQuitar);
      if (nuevo !== texto) sobrescribir(f.abs, nuevo);
    }
    for (const q of quitar) papelera.mover(q);
  }

  // 3. Huérfanas: mover a la papelera.
  for (const h of huerfanas) papelera.mover(h);

  // 4. WebP: convertir con ffmpeg si reduce tamaño.
  const mapaWebp = new Map();
  let convertidos = 0;
  for (const w of webp) {
    const r = posix(w.trim());
    const absPng = join(vault, r);
    const relWebp = `${r.slice(0, -4)}.webp`;
    const absWebp = join(vault, relWebp);
    const sizePng = statSync(absPng).size;
    const res = spawnSync('ffmpeg', ['-nostdin', '-n', '-i', absPng, '-quality', '90', absWebp], { encoding: 'utf8' });
    if (res.status === 0 && existsSync(absWebp)) {
      if (statSync(absWebp).size < sizePng) {
        mapaWebp.set(basename(r).toLowerCase(), basename(relWebp));
        papelera.mover(r);
        convertidos++;
      } else {
        rmSync(absWebp, { force: true });
      }
    } else if (existsSync(absWebp)) {
      rmSync(absWebp, { force: true });
    }
  }
  reescribirEnVault(vault, archivosNotas, mapaWebp);

  papelera.guardar();
  const liberado = papelera.getLiberado();
  const c = cerrar(vault, 'mantener', `liberó ${mb(liberado)} (okt espacio)`);
  const hash = c.datos.commit?.hash;

  const texto = [
    `Limpieza aplicada: liberó ${mb(liberado)}${convertidos ? ` · ${convertidos} a webp` : ''}.`,
    `Los archivos eliminados están en ${papelera.relDir}/ con manifiesto.json para restaurar.`,
    c.texto,
    ...(hash ? [`Para deshacer las notas: git -C "${vault}" revert ${hash}`] : []),
  ].join('\n');

  return {
    texto,
    datos: {
      liberadoBytes: liberado,
      papelera: papelera.relDir,
      convertidos,
      commit: c.datos.commit,
    },
  };
}

// ---------- 5. unificarDuplicados(vault, rutasImagenes, notasRel) ----------

export function unificarDuplicados(vault, rutasImagenes, notasRel = []) {
  const vistas = new Set();
  const existentes = [];
  for (const rel of rutasImagenes || []) {
    const r = posix(String(rel));
    if (vistas.has(r)) continue;
    vistas.add(r);
    const abs = join(vault, r);
    if (existsSync(abs) && statSync(abs).isFile()) existentes.push({ rel: r, abs });
  }

  const grupos = agruparDuplicados(existentes);
  const nombres = new Map();
  const aBorrar = [];
  for (const g of grupos) {
    const cons = basename(g.conservar.rel);
    for (const q of g.quitar) {
      nombres.set(basename(q.rel).toLowerCase(), cons);
      aBorrar.push(q);
    }
  }

  if (nombres.size) {
    for (const rel of notasRel || []) {
      const abs = join(vault, posix(String(rel)));
      if (!existsSync(abs)) continue;
      const texto = readFileSync(abs, 'utf8');
      const nuevo = reescribirEnlaces(texto, nombres);
      if (nuevo !== texto) sobrescribir(abs, nuevo);
    }
    for (const q of aBorrar) rmSync(q.abs, { force: true });
  }

  return { quitados: aBorrar.length, nombres };
}
