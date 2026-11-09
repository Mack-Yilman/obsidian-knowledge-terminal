// Nombres de nota: legibles, con tildes, espacios y emojis, pero sin lo que rompe enlaces o rutas.

const PROHIBIDOS = /[—–:/\\?*"<>|#^[\]]/;

// Uno o más emojis al inicio (con selector de variación, unión ZWJ, tono de piel o bandera) y el espacio que sigue.
const EMOJI_INICIAL = /^(?:(?![©®™])[\p{Extended_Pictographic}\p{Regional_Indicator}][\u{FE0F}\u{200D}\p{Emoji_Modifier}\p{Extended_Pictographic}\p{Regional_Indicator}]*)+\s*/u;

export function nombreValido(nombre) {
  return Boolean(nombre.trim()) && !PROHIBIDOS.test(nombre) && !/^\.|\.$/.test(nombre.trim());
}

// Corta por caracteres completos: un .slice() puede partir un emoji en dos y dejar un nombre inválido.
export const recortar = (texto, n) => Array.from(String(texto)).slice(0, n).join('');

// Prefijo de orden de una carpeta y de su nota principal: «01 │ 🩺 Medicina» (U+2502, como las raíces). Va antes
// del emoji para que Obsidian ordene por él. El nombre base (sinEmoji) no lo lleva: «Medicina» encuentra la carpeta.
const NUMERO = /^(\d{2,3})[ \t]*│[ \t]*/;

export const numeroDe = (nombre) => {
  const m = String(nombre).match(NUMERO);
  return m ? Number(m[1]) : null;
};

export const sinNumero = (nombre) => String(nombre).replace(NUMERO, '');

export const formatoNumero = (n) => String(n).padStart(2, '0');

// «🫀 Cardiología» → «03 │ 🫀 Cardiología»; reemplaza un número anterior.
export const conNumero = (n, nombre) => `${formatoNumero(n)} │ ${sinNumero(nombre).trim()}`;

export const empiezaConEmoji = (nombre) => EMOJI_INICIAL.test(sinNumero(nombre));

export const emojiInicial = (nombre) => (sinNumero(nombre).match(EMOJI_INICIAL)?.[0] || '').trim();

export const sinEmoji = (nombre) => sinNumero(String(nombre).trim()).replace(EMOJI_INICIAL, '').trim();

export function limpiarNombre(nombre) {
  const limpio = nombre
    .replace(/\[\[|\]\]/g, '')
    .replace(/\s*[—–:/\\|]\s*/g, ' - ')
    .replace(/[?*"<>#^[\]]/g, '')
    .replace(/(?:\s+-){2,}\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '');
  return recortar(limpio, 120).trim();
}
