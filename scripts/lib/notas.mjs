// okt nota nueva <tipo> "<título>": crea la nota en su carpeta con el frontmatter y las secciones
// del contrato. El modelo solo rellena el contenido.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { escribirFrontmatter } from './frontmatter.mjs';
import { fechaISO, semanaISO } from './fechas.mjs';
import { limpiarNombre } from './nombres.mjs';
import { mapaDeNombres } from './vault.mjs';

export const TIPOS = {
  concepto: { carpeta: '30-Conocimiento/conceptos', estado: 'borrador', resumen: true, fuentes: true, cuerpo: ['Lo esencial', 'Relacionado', 'Historial'] },
  entidad: { carpeta: '30-Conocimiento/entidades', estado: 'borrador', resumen: true, fuentes: true, cuerpo: ['Qué es', 'Relacionado', 'Historial'] },
  sintesis: { carpeta: '30-Conocimiento/sintesis', estado: 'borrador', resumen: true, fuentes: true, cuerpo: ['Pregunta', 'Respuesta', 'Evidencia', 'Contradicciones', 'Relacionado', 'Historial'] },
  fuente: { carpeta: '40-Fuentes', estado: 'borrador', resumen: true, cuerpo: ['TL;DR', 'Qué aporta', 'Puntos clave', 'Notas'] },
  articulo: { tipo: 'fuente', carpeta: '40-Fuentes', estado: 'borrador', resumen: true, cuerpo: ['TL;DR', 'Pregunta', 'Método', 'Resultados', 'Limitaciones', 'Qué aporta', 'Notas'] },
  proyecto: { carpeta: '10-Proyectos', propia: true, estado: 'activo', resumen: true, cuerpo: ['Objetivo', 'Próximos pasos', 'Decisiones', 'Relacionado', 'Historial'] },
  area: { carpeta: '20-Areas', resumen: true, cuerpo: ['Proyectos', 'Conocimiento', 'Notas'] },
  diario: { carpeta: '50-Diario', sinActualizado: true, titulo: () => fechaISO(), cuerpo: ['Foco del día', 'Notas', 'Tareas', 'Lo que aprendí'] },
  semanal: { carpeta: '50-Diario', sinActualizado: true, titulo: () => semanaISO(), cuerpo: ['Qué pasó', 'Proyectos', 'Lo aprendido', 'Pendientes', 'Próxima semana'] },
  nota: { carpeta: '00-Bandeja/notas', cuerpo: [] },
  sesion: { carpeta: '00-Bandeja/sesiones', sinActualizado: true, cuerpo: [] },
};

const lista = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
const wiki = (n) => `[[${n.replace(/^\[\[|\]\]$/g, '')}]]`;

export function notaNueva(vault, tipoPedido, tituloPedido, op = {}) {
  const def = TIPOS[tipoPedido];
  if (!def) {
    const e = new Error(`Tipo desconocido: ${tipoPedido}. Tipos: ${Object.keys(TIPOS).join(', ')}`);
    e.codigo = 2;
    throw e;
  }
  const titulo = limpiarNombre(tituloPedido || (def.titulo ? def.titulo() : ''));
  if (!titulo) {
    const e = new Error('Falta el título: okt nota nueva <tipo> "<título>"');
    e.codigo = 2;
    throw e;
  }
  const carpeta = op.carpeta || (def.propia ? `${def.carpeta}/${titulo}` : def.carpeta);
  const rel = `${carpeta}/${titulo}.md`;

  const iguales = mapaDeNombres(vault).get(titulo.toLowerCase());
  if (iguales?.length) {
    if (def.titulo) return { texto: `Ya existía: ${iguales[0]}`, datos: { ruta: iguales[0], creada: false } };
    const e = new Error(`Ya existe una nota llamada «${titulo}»: ${iguales[0]}. Actualízala en vez de duplicarla, o elige otro título.`);
    e.codigo = 3;
    throw e;
  }

  const hoy = fechaISO();
  const datos = { tipo: def.tipo || tipoPedido, creado: hoy };
  if (!def.sinActualizado) datos.actualizado = hoy;
  if (def.estado) datos.estado = op.estado || def.estado;
  if (def.resumen) datos.resumen = op.resumen || '';
  if (datos.tipo === 'fuente') {
    datos.origen = op.origen || '';
    if (op.url) datos.url = op.url;
    if (op.autor) datos.autor = op.autor;
    if (op.publicado) datos.publicado = op.publicado;
    if (op['id-externo']) datos.id_externo = op['id-externo'];
    if (op.adjunto) datos.adjunto = wiki(op.adjunto);
  }
  if (def.fuentes) datos.fuentes = lista(op.fuentes).map(wiki);
  if (op.area) datos.area = wiki(op.area);
  if (op.proyecto) datos.proyecto = wiki(op.proyecto);
  if (op.tags) datos.tags = lista(op.tags);

  const secciones = def.cuerpo.map((s) => (s === 'Historial' ? `## Historial\n\n- ${hoy}: creada.` : `## ${s}\n`));
  const cuerpo = `\n# ${titulo}\n\n${secciones.join('\n')}\n`;
  const abs = join(vault, rel);
  mkdirSync(dirname(abs), { recursive: true });
  if (existsSync(abs)) throw new Error(`Ya existe: ${rel}`);
  writeFileSync(abs, escribirFrontmatter(datos, cuerpo));
  return { texto: `Creada: ${rel}`, datos: { ruta: rel, creada: true } };
}
