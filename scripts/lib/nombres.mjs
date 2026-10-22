// Nombres de nota: legibles, con tildes, espacios y emojis, pero sin lo que rompe enlaces o rutas.

const PROHIBIDOS = /[—–:/\\?*"<>|#^[\]]/;

// Uno o más emojis al inicio (con selector de variación, unión ZWJ, tono de piel o bandera) y el espacio que sigue.
const EMOJI_INICIAL = /^(?:(?![©®™])[\p{Extended_Pictographic}\p{Regional_Indicator}][\u{FE0F}\u{200D}\p{Emoji_Modifier}\p{Extended_Pictographic}\p{Regional_Indicator}]*)+\s*/u;

export function nombreValido(nombre) {
  return Boolean(nombre.trim()) && !PROHIBIDOS.test(nombre) && !/^\.|\.$/.test(nombre.trim());
}

// Corta por caracteres completos: un .slice() puede partir un emoji en dos y dejar un nombre inválido.
export const recortar = (texto, n) => Array.from(String(texto)).slice(0, n).join('');

export const empiezaConEmoji = (nombre) => EMOJI_INICIAL.test(String(nombre));

export const emojiInicial = (nombre) => (String(nombre).match(EMOJI_INICIAL)?.[0] || '').trim();

export const sinEmoji = (nombre) => String(nombre).replace(EMOJI_INICIAL, '').trim();

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
