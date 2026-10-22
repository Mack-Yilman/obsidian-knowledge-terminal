// Nombres de nota: legibles, con tildes y espacios, pero sin lo que rompe enlaces o rutas.

const PROHIBIDOS = /[—–:/\\?*"<>|#^[\]]/;

export function nombreValido(nombre) {
  return Boolean(nombre.trim()) && !PROHIBIDOS.test(nombre) && !/^\.|\.$/.test(nombre.trim());
}

export function limpiarNombre(nombre) {
  return nombre
    .replace(/\[\[|\]\]/g, '')
    .replace(/\s*[—–:/\\|]\s*/g, ' - ')
    .replace(/[?*"<>#^[\]]/g, '')
    .replace(/(?:\s+-){2,}\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '')
    .slice(0, 120);
}
