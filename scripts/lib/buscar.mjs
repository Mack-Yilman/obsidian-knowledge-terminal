// okt buscar "<texto>": búsqueda por palabras sin embeddings. Pondera título > alias > resumen >
// etiquetas > cuerpo y devuelve el fragmento con la coincidencia, para no abrir notas enteras.
import { listarNotas, leerNota, esSistema, esArchivado } from './vault.mjs';
import { resolverCarpeta } from './estructura.mjs';

export const normalizar = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PALABRAS_VACIAS = new Set('de la el los las un una y o en con por para que del al se su sus es lo como'.split(' '));

function terminos(consulta) {
  return normalizar(consulta)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !PALABRAS_VACIAS.has(t));
}

const contar = (texto, t) => (texto.match(new RegExp(`(^|[^\\p{L}\\p{N}])${t}`, 'gu')) || []).length;

function fragmento(cuerpo, ts) {
  const lineas = cuerpo.split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const n = normalizar(lineas[i]);
    if (!lineas[i].startsWith('#') && ts.some((t) => n.includes(t))) {
      return lineas.slice(Math.max(0, i - 1), i + 2).filter((l) => l.trim()).map((l) => l.trim());
    }
  }
  return [];
}

export function buscar(vault, consulta, op = {}) {
  const ts = terminos(consulta || '');
  if (!ts.length) throw Object.assign(new Error('Uso: okt buscar "<texto>" [--carpeta <carpeta>] [--tipo <tipo>] [--limite N]'), { codigo: 2 });
  const limite = Number(op.limite) || 10;
  // --carpeta acepta «Medicina/Cardiología» sin la carpeta raíz ni los emojis. Lo archivado (y los originales en
  // bruto) solo aparece si se pide esa carpeta.
  const carpeta = op.carpeta && op.carpeta !== true ? resolverCarpeta(vault, op.carpeta) : null;
  const resultados = [];
  for (const rel of listarNotas(vault)) {
    if (esSistema(rel)) continue;
    if (carpeta ? !(rel === carpeta || rel.startsWith(`${carpeta}/`)) : esArchivado(rel)) continue;
    const n = leerNota(vault, rel);
    if (op.tipo && n.datos.tipo !== op.tipo) continue;
    const campos = {
      titulo: normalizar(n.nombre),
      alias: normalizar([].concat(n.datos.aliases || []).join(' ')),
      resumen: normalizar(n.datos.resumen || ''),
      tags: normalizar([].concat(n.datos.tags || []).join(' ')),
      cuerpo: normalizar(n.cuerpo),
    };
    let puntaje = 0;
    let presentes = 0;
    for (const t of ts) {
      const p = contar(campos.titulo, t) * 10 + contar(campos.alias, t) * 8 + contar(campos.resumen, t) * 4 + contar(campos.tags, t) * 3 + Math.min(contar(campos.cuerpo, t), 5);
      if (p) presentes++;
      puntaje += p;
    }
    if (!puntaje) continue;
    puntaje *= presentes / ts.length; // premia las notas que tienen todos los términos
    resultados.push({ nombre: n.nombre, ruta: rel, puntaje: Math.round(puntaje * 10) / 10, tipo: n.datos.tipo || '', estado: n.datos.estado || '', resumen: n.datos.resumen || '', fragmento: fragmento(n.cuerpo, ts) });
  }
  resultados.sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre));
  const top = resultados.slice(0, limite);
  const texto = top.length
    ? top
        .map((r, i) => {
          const cab = `${i + 1}. [[${r.nombre}]] · ${r.ruta}${r.estado ? ` · ${r.estado}` : ''}`;
          const res = r.resumen ? `\n   ${r.resumen}` : '';
          const frag = i < 5 && r.fragmento.length ? `\n${r.fragmento.map((l) => `   > ${l}`).join('\n')}` : '';
          return cab + res + frag;
        })
        .join('\n')
    : `Sin resultados para «${consulta}».`;
  return { texto, datos: top };
}
