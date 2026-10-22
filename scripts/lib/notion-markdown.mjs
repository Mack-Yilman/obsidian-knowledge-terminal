// Convierte el Markdown «enriquecido» que devuelve ntn (Notion) a Markdown que Obsidian muestra bien.
// Notion indenta con tabulador el contenido de los bloques plegables: en Obsidian eso se vería como
// código. También usa etiquetas propias (<details>, <table>, <callout>, <unknown …/>).

const escaparCelda = (t) => t.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();

// Cada bloque convertido conserva la indentación de su primera línea en todas sus líneas: así, dentro
// de un encabezado plegable, el desindentado sigue funcionando después del bloque.
function tablas(md) {
  return md.replace(/^([ \t]*)<table[^>]*>([\s\S]*?)<\/table>/gm, (_, sangria, interior) => {
    const filas = [...interior.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((f) => [...f[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => escaparCelda(c[1])));
    if (!filas.length) return '';
    const ancho = Math.max(...filas.map((f) => f.length));
    const completar = (f) => [...f, ...Array(ancho - f.length).fill('')];
    const [cab, ...resto] = filas.map(completar);
    return [`| ${cab.join(' | ')} |`, `| ${cab.map(() => '---').join(' | ')} |`, ...resto.map((f) => `| ${f.join(' | ')} |`)].map((l) => sangria + l).join('\n');
  });
}

const quitarTab = (l) => l.replace(/^\t/, '');

function bloquesPlegables(md) {
  // <details><summary>Título</summary> contenido </details> → callout plegable de Obsidian.
  const quitarSangria = (l, s) => (s && l.startsWith(s) ? l.slice(s.length) : l);
  md = md.replace(/^([ \t]*)<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gm, (_, sangria, titulo, cuerpo) => {
    const lineas = cuerpo.split('\n').map((l) => quitarTab(quitarSangria(l, sangria))).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
    return [`> [!note]- ${titulo.trim()}`, ...lineas.map((l) => (l.trim() ? `> ${l}` : '>'))].map((l) => sangria + l).join('\n');
  });
  // <callout icon="💡"> contenido </callout> → callout.
  md = md.replace(/^([ \t]*)<callout(?:\s+icon="([^"]*)")?[^>]*>([\s\S]*?)<\/callout>/gm, (_, sangria, icono, cuerpo) => {
    const lineas = cuerpo.split('\n').map((l) => quitarTab(quitarSangria(l, sangria))).filter((l) => l.trim());
    return [`> [!note]${icono ? ` ${icono}` : ''}`, ...lineas.map((l) => `> ${l}`)].map((l) => sangria + l).join('\n');
  });
  return md;
}

function encabezadosPlegables(md) {
  // "## Título {toggle="true"}" y debajo su contenido con un tabulador: se quita el atributo y el tab.
  const salida = [];
  let dentro = false;
  for (const linea of md.split('\n')) {
    if (/^#{1,6}\s.*\{toggle="true"\}\s*$/.test(linea)) {
      salida.push(linea.replace(/\s*\{toggle="true"\}\s*$/, ''));
      dentro = true;
      continue;
    }
    if (dentro && linea.startsWith('\t')) {
      salida.push(quitarTab(linea));
      continue;
    }
    if (linea.trim()) dentro = false;
    salida.push(linea);
  }
  return salida.join('\n');
}

function etiquetasSueltas(md) {
  return md
    .replace(/^\s*<unknown [^>]*alt="button"[^>]*\/>\s*$/gm, '')
    .replace(/<unknown url="([^"]+)"[^>]*alt="bookmark"[^>]*\/>/g, '[Marcador (ver en Notion)]($1)')
    .replace(/<unknown url="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/>/g, '[$2 (ver en Notion)]($1)')
    .replace(/<page url="([^"]+)"[^>]*>([\s\S]*?)<\/page>/g, '[$2]($1)')
    .replace(/<mention-page url="([^"]+)"[^>]*\/>/g, '[página de Notion]($1)')
    .replace(/<mention-date start="([^"]+)"[^>]*\/>/g, '$1')
    .replace(/<\/?(columns|column)[^>]*>/g, '')
    .replace(/<empty-block\s*\/>/g, '')
    .replace(/\s*\{(color|toggle)="[^"]*"\}/g, '');
}

export function notionAObsidian(md) {
  let t = md.replace(/\r\n/g, '\n');
  t = tablas(t);
  t = bloquesPlegables(t);
  t = encabezadosPlegables(t);
  t = etiquetasSueltas(t);
  return t
    .replace(/^(---\n)(---\n)+/gm, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
