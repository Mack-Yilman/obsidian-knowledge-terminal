// Flujo de clase viva con NotebookLM:
//   okt clase preparar "<curso>" --audio <archivo> [--diapos <pdf>] [--video <url|archivo>] [--tema "<título>"]
//   okt clase recurso "<nota>" <tipo> [--id <id>]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { errorUso, escribirImportada } from './importacion.mjs';
import { resolverCarpeta } from './estructura.mjs';
import { sinEmoji } from './nombres.mjs';
import { fechaISO } from './fechas.mjs';
import { adjuntar } from './archivos.mjs';
import { encontrarNota, brutoGuardar } from './organizar.mjs';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { sobrescribir } from './rutas.mjs';
import { preparar as redactarPreparar } from './redactar.mjs';
import {
  resolverCuaderno,
  cuadernoCrear,
  fuenteAgregar,
  fuenteContenido,
  crear as nlmCrear,
  descargar as nlmDescargar,
  TIPOS_ESTUDIO,
} from './notebooklm.mjs';

export async function preparar(vault, cursoRef, op = {}) {
  if (!cursoRef) throw errorUso('Uso: okt clase preparar "<curso>" --audio <archivo> [--diapos <pdf>] [--video <url|archivo>] [--tema "<título>"]');
  if (!op.audio && !op.video) throw errorUso('Falta --audio (o --video) con la grabación de la clase.');
  if (op.audio && !existsSync(resolve(op.audio))) throw errorUso(`No existe el archivo de audio: ${op.audio}`);
  if (op.diapos && !existsSync(resolve(op.diapos))) throw errorUso(`No existe el archivo de diapositivas: ${op.diapos}`);
  if (op.video && !/^https?:\/\//i.test(op.video) && !existsSync(resolve(op.video))) throw errorUso(`No existe el archivo de video: ${op.video}`);
  const curso = resolverCarpeta(vault, cursoRef);
  if (!existsSync(join(vault, curso))) throw errorUso(`No existe la carpeta del curso: ${cursoRef}`);

  let c;
  try {
    c = resolverCuaderno(vault, { carpeta: curso });
  } catch {
    c = cuadernoCrear(vault, sinEmoji(basename(curso)), { vincular: curso }).datos;
  }

  let fuenteAudio = null;
  let fuenteVideo = null;
  if (op.audio) fuenteAudio = fuenteAgregar(vault, op.audio, { _cuaderno: c }).datos;
  if (op.diapos) fuenteAgregar(vault, op.diapos, { _cuaderno: c });
  if (op.video) fuenteVideo = fuenteAgregar(vault, op.video, { _cuaderno: c }).datos;
  const fuentePrincipal = fuenteAudio || fuenteVideo;
  const transcripcion = fuenteContenido(fuentePrincipal.source_id);

  const pdf = op.diapos ? adjuntar(vault, op.diapos, { origen: 'pdf' }).datos : null;
  const titulo = op.tema || `Clase ${fechaISO()}`;
  const datos = {
    origen: 'clase',
    curso: `[[${basename(curso)}]]`,
    notebooklm: c.id,
    ...(pdf ? { diapositivas: `[[${pdf.nombre}]]` } : {}),
  };
  const res = escribirImportada(vault, {
    clave: `notebooklm:clase:${fuentePrincipal.source_id}`,
    titulo,
    contenido: transcripcion,
    datos,
    op: { carpeta: curso },
  });

  const bruto = brutoGuardar(vault, res.ruta);
  const red = redactarPreparar(vault, res.ruta);
  const nombreNota = basename(res.ruta, '.md');
  const texto = [
    `Clase lista: ${res.ruta} (cuaderno «${c.titulo}»)`,
    bruto.texto,
    red.texto,
    `📍 Pásala a limpio con la skill redactar (perfil clase); después: okt redactar indice "${nombreNota}" y okt redactar verificar "${nombreNota}"`,
  ].join('\n');
  return { texto, datos: { ruta: res.ruta, cuaderno: c, bruto: bruto.datos, redactar: red.datos } };
}

export async function recurso(vault, notaRef, tipo, op = {}) {
  if (!notaRef || !tipo) throw errorUso('Uso: okt clase recurso "<nota>" <tipo> [--id <id>]');
  if (!TIPOS_ESTUDIO.includes(tipo)) throw errorUso(`Tipo desconocido: ${tipo}. Tipos: ${TIPOS_ESTUDIO.join(', ')}`);
  const rel = encontrarNota(vault, notaRef);
  const abs = join(vault, rel);
  const { datos: fm, cuerpo } = leerFrontmatter(readFileSync(abs, 'utf8'));
  if (!fm.notebooklm) throw errorUso(`La nota «${basename(rel, '.md')}» no tiene propiedad notebooklm.`);

  const c = { id: fm.notebooklm, titulo: sinEmoji(basename(rel, '.md')) };
  const r = op.id
    ? nlmDescargar(vault, tipo, { ...op, _cuaderno: c, _sinNota: true })
    : await nlmCrear(vault, tipo, { ...op, _cuaderno: c, _sinNota: true });

  if (r.datos?.pendiente) {
    const nombre = basename(rel, '.md');
    return {
      texto: `El ${tipo} sigue en proceso en NotebookLM. Cuando esté listo: okt clase recurso "${nombre}" ${tipo} --id ${r.datos.id}`,
      datos: r.datos,
    };
  }

  const tituloTipo = `${tipo[0].toUpperCase()}${tipo.slice(1)}`;
  const bloque = `### ${tituloTipo} (${fechaISO()})\n\n${r.datos.convertido}`;
  const tieneSeccion = /^## 🧪 Recursos de estudio\s*$/m.test(cuerpo);
  const cuerpoBase = cuerpo.replace(/\s+$/, '');
  const cuerpoNuevo = tieneSeccion
    ? `${cuerpoBase}\n\n${bloque}\n`
    : `${cuerpoBase}\n\n## 🧪 Recursos de estudio\n\n${bloque}\n`;
  sobrescribir(abs, escribirFrontmatter(fm, cuerpoNuevo));
  return {
    texto: `Recurso agregado a ${rel}: ${tituloTipo}.`,
    datos: { nota: rel, tipo, ...r.datos },
  };
}
