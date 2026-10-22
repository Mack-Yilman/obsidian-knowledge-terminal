// Bloques regenerables: solo se toca lo que está entre las marcas; lo demás es del usuario.

export const INICIO = '<!-- okt:inicio -->';
export const FIN = '<!-- okt:fin -->';

export function leerBloque(texto) {
  const i = texto.indexOf(INICIO);
  const f = texto.indexOf(FIN, i);
  if (i < 0 || f < 0) return null;
  return texto.slice(i + INICIO.length, f).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

export function reemplazarBloque(texto, contenido) {
  const i = texto.indexOf(INICIO);
  const f = texto.indexOf(FIN, i);
  const bloque = contenido ? `${INICIO}\n${contenido}\n${FIN}` : `${INICIO}\n${FIN}`;
  // Sin la marca de cierre, agregar otro bloque haría que la próxima vez se borre lo que quedó en medio.
  if (i >= 0 && f < 0) throw new Error(`Falta la marca ${FIN} después de ${INICIO}: restáurala a mano para no perder texto.`);
  if (i < 0) return `${texto.replace(/\s*$/, '')}\n\n${bloque}\n`;
  return texto.slice(0, i) + bloque + texto.slice(f + FIN.length);
}
