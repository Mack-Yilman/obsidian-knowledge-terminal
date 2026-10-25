// Frontmatter YAML plano (el del contrato): escalares, listas en bloque o en línea. Sin objetos anidados.

const RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function quitarComillas(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"');
  }
  return t;
}

export function leerFrontmatter(texto) {
  const m = texto.match(RE);
  if (!m) return { datos: {}, cuerpo: texto, tiene: false };
  const datos = {};
  let clave = null;
  for (const linea of m[1].split(/\r?\n/)) {
    if (!linea.trim() || linea.trim().startsWith('#')) continue;
    const item = linea.match(/^\s+-\s*(.*)$/);
    if (item && clave) {
      if (!Array.isArray(datos[clave])) datos[clave] = [];
      if (item[1].trim()) datos[clave].push(quitarComillas(item[1]));
      continue;
    }
    const par = linea.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!par) continue;
    clave = par[1];
    const valor = par[2].trim();
    if (valor.startsWith('[') && valor.endsWith(']') && !valor.startsWith('[[')) {
      datos[clave] = valor.slice(1, -1).split(',').map((s) => quitarComillas(s)).filter(Boolean);
    } else {
      datos[clave] = quitarComillas(valor);
    }
  }
  return { datos, cuerpo: texto.slice(m[0].length), tiene: true };
}

function escalar(v) {
  // Un salto de línea (un autor o un error que llega de afuera) cerraría el frontmatter o inyectaría otra clave.
  const s = String(v).replace(/[\r\n]+/g, ' ');
  if (s === '') return '';
  if (/^[\[{>|*&!%@`'"]|: | #|^-\s|^\s|\s$|^(true|false|null|yes|no)$/i.test(s) || s.includes('[[')) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function escribirFrontmatter(datos, cuerpo = '') {
  const lineas = ['---'];
  for (const [k, v] of Object.entries(datos)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      lineas.push(`${k}:`);
      for (const x of v) lineas.push(`  - ${escalar(x)}`);
    } else {
      const e = escalar(v);
      lineas.push(e === '' ? `${k}:` : `${k}: ${e}`);
    }
  }
  lineas.push('---');
  return `${lineas.join('\n')}\n${cuerpo}`;
}
