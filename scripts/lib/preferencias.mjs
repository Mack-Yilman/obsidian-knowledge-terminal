// Preferencias del usuario: cómo trabaja y qué prefiere en cada sesión.
// Viven en AGENTS.md entre <!-- okt:preferencias --> y <!-- /okt:preferencias -->.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sobrescribir } from './rutas.mjs';
import { fechaISO } from './fechas.mjs';

export const MARCA_INICIO = '<!-- okt:preferencias -->';
export const MARCA_FIN = '<!-- /okt:preferencias -->';
export const SOBRES_VALIDOS = new Set(['flujo', 'formato', 'fuentes', 'herramientas', 'otro']);
export const TOPE_LINEAS = 40;
export const TOPE_CARACTERES = 4000;

const TEXTO_CABECERA = '## Cómo trabaja el usuario\n\nLo anota OKT con el sí del usuario (okt preferencia). Síguelo en cada sesión; si algo choca con esto, pregunta.';

const RE_PREF = /^-\s*(\d{4}-\d{2}-\d{2})\s*·\s*([^·\n]+)\s*·\s*(.+)$/;

function rutaAgents(vault) {
  return join(vault, 'AGENTS.md');
}

function normalizarTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leerAgents(vault) {
  const ruta = rutaAgents(vault);
  if (!existsSync(ruta)) {
    return { existe: false, texto: '', esCRLF: false };
  }
  const raw = readFileSync(ruta, 'utf8');
  return { existe: true, texto: raw, esCRLF: raw.includes('\r\n') };
}

function extraerBloque(texto) {
  const normalizado = texto.replace(/\r\n/g, '\n');
  const i = normalizado.indexOf(MARCA_INICIO);
  const f = normalizado.indexOf(MARCA_FIN);

  if (i >= 0 && f < 0) {
    throw Object.assign(
      new Error(`Falta la marca ${MARCA_FIN} después de ${MARCA_INICIO}: restáurala a mano para no perder preferencias.`),
      { codigo: 2 }
    );
  }
  if (i < 0 && f >= 0) {
    throw Object.assign(
      new Error(`Falta la marca ${MARCA_INICIO} antes de ${MARCA_FIN}: restáurala a mano para no perder preferencias.`),
      { codigo: 2 }
    );
  }
  if (i >= 0 && f >= 0 && f < i) {
    throw Object.assign(
      new Error(`La marca ${MARCA_FIN} está antes de ${MARCA_INICIO}: restáuralas a mano para no perder preferencias.`),
      { codigo: 2 }
    );
  }
  if (i < 0 && f < 0) {
    return null;
  }

  const contenido = normalizado.slice(i + MARCA_INICIO.length, f).replace(/^\n+|\n+$/g, '');
  return { i, f, fFin: f + MARCA_FIN.length, contenido, normalizado };
}

function parsearPreferencias(contenido) {
  if (!contenido) return [];
  const lineas = contenido.split('\n');
  const prefs = [];
  for (const l of lineas) {
    const trim = l.trim();
    if (!trim) continue;
    const m = trim.match(RE_PREF);
    // Una línea con otro formato (escrita a mano) se conserva tal cual: quitar o reemplazar otra no la borra.
    if (m) prefs.push({ fecha: m[1], sobre: m[2].trim(), texto: m[3].trim(), lineaOriginal: trim });
    else prefs.push({ fecha: '', sobre: 'otro', texto: trim.replace(/^[-*]\s*/, ''), lineaOriginal: trim });
  }
  return prefs;
}

function formatearLinea(fecha, sobre, texto) {
  return `- ${fecha} · ${sobre} · ${texto}`;
}

export function listar(vault) {
  const { existe, texto } = leerAgents(vault);
  if (!existe) {
    return { texto: 'No hay preferencias registradas.', datos: { preferencias: [] } };
  }

  const bloque = extraerBloque(texto);
  if (!bloque) {
    return { texto: 'No hay preferencias registradas.', datos: { preferencias: [] } };
  }

  const prefs = parsearPreferencias(bloque.contenido);
  if (!prefs.length) {
    return { texto: 'No hay preferencias registradas.', datos: { preferencias: [] } };
  }

  const lineas = prefs.map((p, idx) => `${idx + 1}. ${p.fecha} · ${p.sobre} · ${p.texto}`);
  const datos = prefs.map((p, idx) => ({ n: idx + 1, fecha: p.fecha, sobre: p.sobre, texto: p.texto }));

  return { texto: lineas.join('\n'), datos: { preferencias: datos } };
}

export function agregar(vault, texto, { sobre = 'otro' } = {}) {
  const sobreFinal = (sobre && sobre !== true) ? String(sobre).trim() : 'otro';
  if (!SOBRES_VALIDOS.has(sobreFinal)) {
    throw Object.assign(
      new Error(`Sobre «${sobreFinal}» inválido: usa flujo, formato, fuentes, herramientas u otro.`),
      { codigo: 2 }
    );
  }

  const limpio = String(texto || '').trim().replace(/[\r\n]+/g, ' ');
  if (!limpio) {
    throw Object.assign(new Error('El texto de la preferencia es obligatorio.'), { codigo: 2 });
  }

  const { existe, texto: textoActual, esCRLF } = leerAgents(vault);
  const bloque = existe ? extraerBloque(textoActual) : null;
  const hoy = fechaISO();

  const nuevaLinea = formatearLinea(hoy, sobreFinal, limpio);
  let lineasActuales = [];

  if (bloque) {
    const prefs = parsearPreferencias(bloque.contenido);
    const normNuevo = normalizarTexto(limpio);
    const existente = prefs.find((p) => normalizarTexto(p.texto) === normNuevo);
    if (existente) {
      return {
        texto: 'Esa preferencia ya está registrada.',
        datos: { agregada: false, preferencia: existente },
      };
    }
    lineasActuales = bloque.contenido ? bloque.contenido.split('\n').filter((l) => l.trim()) : [];
  }

  lineasActuales.push(nuevaLinea);
  const nuevoContenido = lineasActuales.join('\n');
  if (lineasActuales.length > TOPE_LINEAS || nuevoContenido.length > TOPE_CARACTERES) {
    throw Object.assign(
      new Error(
        'Se alcanzó el tope de 40 preferencias o 4000 caracteres dentro del bloque. Consolida con okt preferencia reemplazar <n> "<texto>" o quitar <n>.'
      ),
      { codigo: 3 }
    );
  }

  if (bloque) {
    const antes = bloque.normalizado.slice(0, bloque.i + MARCA_INICIO.length);
    const despues = bloque.normalizado.slice(bloque.f);
    const nuevoTextoNormalizado = `${antes}\n${nuevoContenido}\n${despues}`;
    const textoFinal = esCRLF ? nuevoTextoNormalizado.replace(/\r?\n/g, '\r\n') : nuevoTextoNormalizado;

    sobrescribir(rutaAgents(vault), textoFinal);
    return {
      texto: `Preferencia agregada: [${sobreFinal}] ${limpio}`,
      datos: { agregada: true, preferencia: { fecha: hoy, sobre: sobreFinal, texto: limpio } },
    };
  }

  // Si no hay bloque de preferencias, se agrega al final de AGENTS.md (o crea el archivo)
  const seccionCompleta = `\n\n${TEXTO_CABECERA}\n\n${MARCA_INICIO}\n${nuevoContenido}\n${MARCA_FIN}\n`;

  let nuevoTextoNormalizado = '';
  if (!existe || !textoActual.trim()) {
    nuevoTextoNormalizado = `${TEXTO_CABECERA}\n\n${MARCA_INICIO}\n${nuevoContenido}\n${MARCA_FIN}\n`;
  } else {
    const normalizado = textoActual.replace(/\r\n/g, '\n').replace(/\s*$/, '');
    nuevoTextoNormalizado = `${normalizado}${seccionCompleta}`;
  }

  const textoFinal = esCRLF ? nuevoTextoNormalizado.replace(/\r?\n/g, '\r\n') : nuevoTextoNormalizado;
  sobrescribir(rutaAgents(vault), textoFinal);

  return {
    texto: `Preferencia agregada: [${sobreFinal}] ${limpio}`,
    datos: { agregada: true, preferencia: { fecha: hoy, sobre: sobreFinal, texto: limpio } },
  };
}

export function quitar(vault, n) {
  const { existe, texto, esCRLF } = leerAgents(vault);
  if (!existe) {
    throw Object.assign(new Error('No existe AGENTS.md.'), { codigo: 2 });
  }

  const bloque = extraerBloque(texto);
  if (!bloque) {
    throw Object.assign(new Error('No hay bloque de preferencias en AGENTS.md.'), { codigo: 2 });
  }

  const prefs = parsearPreferencias(bloque.contenido);
  const idx = Number(n);
  if (!Number.isInteger(idx) || idx < 1 || idx > prefs.length) {
    throw Object.assign(new Error(`No existe la preferencia #${n}.`), { codigo: 2 });
  }

  const eliminada = prefs.splice(idx - 1, 1)[0];
  const nuevoContenido = prefs.map((p) => p.lineaOriginal).join('\n');

  const antes = bloque.normalizado.slice(0, bloque.i + MARCA_INICIO.length);
  const despues = bloque.normalizado.slice(bloque.f);
  const nuevoTextoNormalizado = nuevoContenido
    ? `${antes}\n${nuevoContenido}\n${despues}`
    : `${antes}\n${despues}`;

  const textoFinal = esCRLF ? nuevoTextoNormalizado.replace(/\r?\n/g, '\r\n') : nuevoTextoNormalizado;
  sobrescribir(rutaAgents(vault), textoFinal);

  return { texto: `Preferencia #${idx} eliminada.`, datos: { eliminada } };
}

export function reemplazar(vault, n, texto) {
  const { existe, texto: textoActual, esCRLF } = leerAgents(vault);
  if (!existe) {
    throw Object.assign(new Error('No existe AGENTS.md.'), { codigo: 2 });
  }

  const bloque = extraerBloque(textoActual);
  if (!bloque) {
    throw Object.assign(new Error('No hay bloque de preferencias en AGENTS.md.'), { codigo: 2 });
  }

  const prefs = parsearPreferencias(bloque.contenido);
  const idx = Number(n);
  if (!Number.isInteger(idx) || idx < 1 || idx > prefs.length) {
    throw Object.assign(new Error(`No existe la preferencia #${n}.`), { codigo: 2 });
  }

  const limpio = String(texto || '').trim().replace(/[\r\n]+/g, ' ');
  if (!limpio) {
    throw Object.assign(new Error('El texto de la preferencia no puede estar vacío.'), { codigo: 2 });
  }

  const target = prefs[idx - 1];
  target.texto = limpio;
  target.lineaOriginal = formatearLinea(target.fecha, target.sobre, limpio);

  const nuevoContenido = prefs.map((p) => p.lineaOriginal).join('\n');
  if (prefs.length > TOPE_LINEAS || nuevoContenido.length > TOPE_CARACTERES) {
    throw Object.assign(
      new Error(
        'Se alcanzó el tope de 40 preferencias o 4000 caracteres dentro del bloque. Consolida con okt preferencia reemplazar <n> "<texto>" o quitar <n>.'
      ),
      { codigo: 3 }
    );
  }

  const antes = bloque.normalizado.slice(0, bloque.i + MARCA_INICIO.length);
  const despues = bloque.normalizado.slice(bloque.f);
  const nuevoTextoNormalizado = `${antes}\n${nuevoContenido}\n${despues}`;
  const textoFinal = esCRLF ? nuevoTextoNormalizado.replace(/\r?\n/g, '\r\n') : nuevoTextoNormalizado;

  sobrescribir(rutaAgents(vault), textoFinal);

  return {
    texto: `Preferencia #${idx} actualizada.`,
    datos: { preferencia: { n: idx, fecha: target.fecha, sobre: target.sobre, texto: limpio } },
  };
}
