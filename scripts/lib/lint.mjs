// okt lint: comprobaciones deterministas del contrato. Las contradicciones de fondo las revisa el
// modelo solo a pedido; aquí nada gasta tokens.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listarNotas, leerNota, extraerEnlaces, mapaDeNombres, esSistema } from './vault.mjs';
import { leerConfigVault } from './rutas.mjs';
import { leerBloque } from './bloques.mjs';
import { nombreValido, empiezaConEmoji, sinEmoji } from './nombres.mjs';
import { C, R } from './estructura.mjs';
import { diasEntre, fechaISO } from './fechas.mjs';
import { SENSIBLES } from './sensibles.mjs';

const CONOCIMIENTO = ['concepto', 'entidad', 'sintesis'];
const REQUERIDOS = {
  actualizado: ['concepto', 'entidad', 'sintesis', 'fuente', 'proyecto', 'area', 'nota'],
  resumen: ['concepto', 'entidad', 'sintesis', 'fuente', 'proyecto', 'area'],
  estado: ['concepto', 'entidad', 'sintesis', 'fuente', 'proyecto'],
};
const TIPOS = new Set(['concepto', 'entidad', 'sintesis', 'fuente', 'proyecto', 'area', 'diario', 'semanal', 'sesion', 'nota', 'sistema']);


export function lint(vault) {
  const hallazgos = [];
  const agregar = (nivel, regla, archivo, detalle, linea) => hallazgos.push({ nivel, regla, archivo, detalle, ...(linea ? { linea } : {}) });
  const cfg = leerConfigVault(vault);
  const nombres = mapaDeNombres(vault);
  const entrantes = new Map();
  const notas = listarNotas(vault).map((rel) => leerNota(vault, rel));
  const porBase = new Map(notas.map((n) => [sinEmoji(n.nombre).toLowerCase(), n.nombre]));

  for (const n of notas) {
    const sistema = esSistema(n.rel);
    const archivo = n.rel.startsWith(`${C.archivo}/`);
    const bandeja = n.rel.startsWith(`${C.bandeja}/`);

    // Datos sensibles: en todo el vault, incluida la bandeja.
    n.texto.split(/\r?\n/).forEach((l, i) => {
      for (const s of SENSIBLES) if (s.re.test(l)) agregar('error', 'datos_sensibles', n.rel, `Parece ${s.que}: el vault no guarda datos de pacientes ni de terceros.`, i + 1);
    });
    if (sistema) continue;

    // Enlaces.
    for (const e of extraerEnlaces(n.texto)) {
      const clave = e.destino.toLowerCase().replace(/\.md$/, '');
      const destinos = nombres.get(clave) || nombres.get(e.destino.toLowerCase());
      if (!destinos) {
        // [[Anemia]] cuando la nota se llama «🩸 Anemia»: Obsidian no resuelve el enlace por el alias.
        const parecida = porBase.get(sinEmoji(e.destino).toLowerCase());
        agregar(bandeja ? 'aviso' : 'error', 'enlace_roto', n.rel, `[[${e.destino}]] no existe${parecida ? `: ¿quisiste decir [[${parecida}]]?` : ''}`);
      }
      else for (const d of destinos) entrantes.set(d, (entrantes.get(d) || 0) + 1);
    }
    if (bandeja || archivo) continue;

    if (!nombreValido(n.nombre)) agregar('error', 'nombre_invalido', n.rel, 'El nombre lleva caracteres que rompen enlaces (: / \\ ? * " < > | # ^ [ ] — –).');
    if (!empiezaConEmoji(n.nombre)) agregar('aviso', 'sin_emoji', n.rel, 'El nombre no empieza con un emoji: usa okt renombrar (temático en conocimiento, proyectos y áreas; el del tipo en lo demás).');
    const tipo = n.datos.tipo;
    if (!n.tieneFrontmatter || !tipo) {
      agregar('error', 'frontmatter', n.rel, 'Falta el frontmatter o el campo tipo.');
      continue;
    }
    if (!TIPOS.has(tipo)) agregar('error', 'frontmatter', n.rel, `tipo desconocido: ${tipo}`);
    if (!n.datos.creado) agregar('error', 'frontmatter', n.rel, 'falta creado');
    for (const [campo, tipos] of Object.entries(REQUERIDOS)) {
      if (tipos.includes(tipo) && !String(n.datos[campo] ?? '').trim()) agregar('error', 'frontmatter', n.rel, `falta ${campo}`);
    }
    if ((n.datos.resumen || '').length > 200) agregar('aviso', 'resumen_largo', n.rel, `El resumen tiene ${n.datos.resumen.length} caracteres (máximo 200).`);
    if (CONOCIMIENTO.includes(tipo) && ![].concat(n.datos.fuentes || []).filter(Boolean).length) agregar('aviso', 'sin_fuentes', n.rel, 'No cita ninguna fuente en «fuentes».');

    // Frescura: sellos (al AAAA-MM-DD) más viejos que frescura_dias.
    const ventana = Number(n.datos.frescura_dias) || cfg.frescura_dias || 90;
    n.cuerpo.split(/\r?\n/).forEach((l) => {
      for (const m of l.matchAll(/\(al (\d{4}-\d{2}-\d{2})\)/g)) {
        const dias = diasEntre(m[1]);
        if (dias > ventana) agregar('aviso', 'sello_vencido', n.rel, `Dato con sello ${m[1]} (${dias} días; ventana ${ventana}): vuelve a verificarlo o cámbialo por un puntero.`);
      }
    });
  }

  // Huérfanas: conocimiento y fuentes sin enlaces entrantes (sin contar la carpeta del sistema).
  for (const n of notas) {
    if (!n.rel.startsWith(`${C.conocimiento}/`) && !n.rel.startsWith(`${C.fuentes}/`)) continue;
    if (!entrantes.get(n.rel)) agregar('aviso', 'huerfana', n.rel, 'Ninguna nota la enlaza.');
  }

  // Índice desactualizado.
  const rutaIndice = join(vault, R.indice);
  const enIndice = existsSync(rutaIndice) ? leerBloque(readFileSync(rutaIndice, 'utf8')) || '' : '';
  const faltan = notas.filter((n) => !esSistema(n.rel) && !enIndice.includes(`[[${n.nombre}]]`)).length;
  if (faltan) agregar('aviso', 'indice_desactualizado', R.indice, `${faltan} notas no están en el índice: ejecuta okt indice.`);

  // Bandeja sin procesar hace más de 14 días.
  const viejas = notas.filter((n) => n.rel.startsWith(`${C.bandeja}/`) && /^\d{4}-\d{2}-\d{2}$/.test(n.datos.creado || '') && diasEntre(n.datos.creado) > 14).length;
  if (viejas) agregar('aviso', 'bandeja_vieja', `${C.bandeja}/`, `${viejas} elementos llevan más de 14 días sin procesar.`);

  const errores = hallazgos.filter((h) => h.nivel === 'error').length;
  const avisos = hallazgos.length - errores;
  const texto = hallazgos.length
    ? `Lint ${fechaISO()}: ${errores} errores, ${avisos} avisos\n${hallazgos.map((h) => `- [${h.nivel}] ${h.regla} · ${h.archivo}${h.linea ? `:${h.linea}` : ''} · ${h.detalle}`).join('\n')}`
    : `Lint ${fechaISO()}: sin hallazgos.`;
  return { texto, datos: { errores, avisos, hallazgos } };
}
