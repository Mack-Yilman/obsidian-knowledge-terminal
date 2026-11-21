// Datos del tutor de estudio (.cerebro/estudio/): formatos, validación y la única vía de escritura.
// El formato lo define references/contrato-estudio.md; tests/estudio-contrato.test.mjs valida sus ejemplos aquí.
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { sobrescribir } from './rutas.mjs';
import { ahora, fechaISO } from './fechas.mjs';

export const DIR_ESTUDIO = join('.cerebro', 'estudio');
export const ARCHIVOS = { metas: 'metas.json', perfil: 'perfil.json', temas: 'temas.json', plan: 'plan.json', eventos: 'eventos.jsonl' };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TIPO_ERROR = /^C-[A-Z]{3}-\d{2}$/;

// Tipos de campo: «?» al final = opcional. Un objeto = subestructura; [x] = lista de x; Set = valores permitidos.
const T = {
  texto: (v) => typeof v === 'string',
  id: (v) => typeof v === 'string' && ID.test(v),
  fecha: (v) => typeof v === 'string' && FECHA.test(v),
  instante: (v) => typeof v === 'string' && INSTANTE.test(v),
  entero: (v) => Number.isInteger(v) && v >= 0,
  numero: (v) => typeof v === 'number' && Number.isFinite(v),
  positivo: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  bool: (v) => typeof v === 'boolean',
  objeto: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  tipo_error: (v) => typeof v === 'string' && TIPO_ERROR.test(v),
  confianza: (v) => v === null || [90, 70, 50, 25].includes(v),
};
const uno = (...valores) => new Set(valores);
const ORIGEN = uno('cli', 'telegram', 'remnote', 'notebooklm');
const HERRAMIENTAS = uno('remnote', 'repaso', 'banqueo', 'clase', 'lectura', 'notebooklm', 'simulacro');

const FSRS = { estabilidad: 'positivo', dificultad: 'numero', repasos: 'entero', lapsos: 'entero', ultimo: 'fecha', vence: 'fecha' };

const COMUNES_EVENTO = { id: 'texto', ts: 'instante', origen: ORIGEN, 'nota?': 'texto' };
export const EVENTOS = {
  sesion: { minutos: 'entero', 'tema?': 'id', actividad: uno('lectura', 'clase', 'banqueo', 'repaso', 'remnote', 'notebooklm', 'otro') },
  examen: { nombre: 'texto', aciertos: 'entero', total: 'entero', 'por_tema?': 'objeto', 'fuente?': 'texto' },
  error: { tema: 'id', 'tipo_error?': 'tipo_error', 'pregunta?': 'texto', 'flashcard?': uno('remnote', 'pegar', 'no') },
  repaso: { tema: 'id', paquete: 'texto', confianza: 'confianza', recibo: 'objeto', reintento: 'bool' },
  checkin: { bloque: 'texto', estado: uno('hecho', 'saltado'), herramienta: HERRAMIENTAS, 'tema?': 'id', minutos: 'entero' },
};

const RECIBO = {
  version: uno(1),
  paquete: 'texto',
  calificacion: uno('recordado', 'parcial', 'fallado'),
  criterios: [{ criterio: 'texto', cumple: 'bool', nota: 'texto' }],
  errores: ['texto'],
  pregunta_incompleta: ['entero'],
  comentario: 'texto',
  evaluador: uno('agy', 'subagente', 'agente'),
};

export const ESQUEMAS = {
  metas: {
    version: uno(1),
    metas: [{ id: 'id', titulo: 'texto', tipo: uno('examen', 'continuo'), 'fecha?': 'fecha', inicio: 'fecha', temario: [{ tema: 'id', peso: 'positivo' }], activa: 'bool' }],
  },
  perfil: {
    version: uno(1),
    minutos_laborable: 'entero',
    minutos_fin: 'entero',
    dias_libres: ['fecha'],
    retencion_deseada: 'numero',
    remnote_min: 'entero',
    cuestionario: 'objeto',
    diagnostico: [{ pregunta: 'texto', hallazgo: 'texto', recomendacion: 'texto', citas: ['entero'] }],
    actualizado: 'fecha',
  },
  temas: { version: uno(1), temas: 'objeto' },
  tema: {
    titulo: 'texto',
    'nota?': 'texto',
    metas: ['id'],
    pregunta: 'texto',
    canonica: 'texto',
    rubrica: ['texto'],
    fsrs: 'fsrs',
    aciertos: 'entero',
    preguntas: 'entero',
    contrasta_con: ['id'],
    retirado: 'bool',
  },
  paquete: { version: uno(1), id: 'texto', concepto: 'texto', pregunta: 'texto', canonica: 'texto', rubrica: ['texto'], respuesta: 'texto' },
  recibo: RECIBO,
  plan: {
    version: uno(1),
    generado: 'instante',
    meta: 'id',
    'aviso?': 'texto',
    dias: [{ fecha: 'fecha', minutos: 'entero', bloques: [{ id: 'texto', accion: 'texto', herramienta: HERRAMIENTAS, 'tema?': 'id', 'temas?': ['id'], minutos: 'entero', estado: uno('pendiente', 'hecho', 'saltado'), 'arrastres?': 'entero' }] }],
  },
};

// Nombres de todos los campos (para la prueba que exige que el contrato los nombre).
export const CAMPOS = (() => {
  const s = new Set();
  const recorrer = (e) => {
    if (Array.isArray(e)) return recorrer(e[0]);
    if (e && typeof e === 'object' && !(e instanceof Set)) for (const [k, v] of Object.entries(e)) s.add(k.replace('?', '')), recorrer(v);
  };
  Object.values(ESQUEMAS).forEach(recorrer);
  Object.values(EVENTOS).forEach(recorrer);
  Object.keys(COMUNES_EVENTO).forEach((k) => s.add(k.replace('?', '')));
  Object.keys(FSRS).forEach((k) => s.add(k));
  return s;
})();

function revisar(valor, esquema, ruta, errores) {
  if (esquema === 'fsrs') {
    if (valor !== null) revisar(valor, FSRS, ruta, errores);
  } else if (esquema instanceof Set) {
    if (!esquema.has(valor)) errores.push(`${ruta}: «${valor}» no es ${[...esquema].join(' | ')}`);
  } else if (Array.isArray(esquema)) {
    if (!Array.isArray(valor)) return errores.push(`${ruta}: debe ser una lista`);
    valor.forEach((v, i) => revisar(v, esquema[0], `${ruta}[${i}]`, errores));
  } else if (typeof esquema === 'object') {
    if (!T.objeto(valor)) return errores.push(`${ruta || 'raíz'}: debe ser un objeto`);
    for (const [clave, sub] of Object.entries(esquema)) {
      const opcional = clave.endsWith('?');
      const k = clave.replace('?', '');
      if (valor[k] === undefined) {
        if (!opcional) errores.push(`${ruta ? ruta + '.' : ''}${k}: falta`);
      } else revisar(valor[k], sub, ruta ? `${ruta}.${k}` : k, errores);
    }
  } else if (!T[esquema](valor)) errores.push(`${ruta}: «${JSON.stringify(valor)}» no es ${esquema}`);
  return errores;
}

// Devuelve la lista de errores (vacía si el dato es válido). tipo: metas, perfil, temas, evento, paquete, recibo, plan.
export function validar(tipo, dato) {
  if (tipo === 'evento') {
    const esq = EVENTOS[dato?.tipo];
    if (!esq) return [`tipo de evento desconocido: «${dato?.tipo}»`];
    return revisar(dato, { ...COMUNES_EVENTO, tipo: 'texto', ...esq }, '', []);
  }
  if (!ESQUEMAS[tipo]) return [`formato desconocido: «${tipo}»`];
  const errores = revisar(dato, ESQUEMAS[tipo], '', []);
  if (tipo === 'temas' && T.objeto(dato?.temas)) {
    for (const [id, t] of Object.entries(dato.temas)) {
      if (!ID.test(id)) errores.push(`temas: id «${id}» inválido`);
      revisar(t, ESQUEMAS.tema, `temas.${id}`, errores);
    }
  }
  if (tipo === 'metas' && Array.isArray(dato?.metas)) {
    for (const m of dato.metas) if (m?.tipo === 'examen' && !m.fecha) errores.push(`metas.${m.id}: un examen necesita fecha`);
  }
  if (tipo === 'perfil' && typeof dato?.retencion_deseada === 'number' && (dato.retencion_deseada < 0.7 || dato.retencion_deseada > 0.97)) {
    errores.push('retencion_deseada: debe estar entre 0.7 y 0.97');
  }
  return errores;
}

const VACIOS = {
  metas: () => ({ version: 1, metas: [] }),
  temas: () => ({ version: 1, temas: {} }),
  perfil: () => ({ version: 1, minutos_laborable: 120, minutos_fin: 180, dias_libres: [], retencion_deseada: 0.9, remnote_min: 0, cuestionario: {}, diagnostico: [], actualizado: fechaISO() }),
};

const ruta = (vault, tipo) => join(vault, DIR_ESTUDIO, ARCHIVOS[tipo]);

// Lee un archivo de estudio; si no existe, devuelve su valor vacío (plan: null). eventos: lista de objetos.
export function leer(vault, tipo) {
  const r = ruta(vault, tipo);
  if (!existsSync(r)) return tipo === 'eventos' ? [] : VACIOS[tipo] ? VACIOS[tipo]() : null;
  const texto = readFileSync(r, 'utf8');
  if (tipo === 'eventos') return texto.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  return JSON.parse(texto);
}

function fallar(tipo, errores) {
  throw Object.assign(new Error(`Datos de estudio inválidos (${tipo}): ${errores.slice(0, 5).join('; ')}`), { codigo: 1 });
}

// Valida y escribe; nunca deja un archivo inválido.
export function guardar(vault, tipo, dato) {
  const errores = validar(tipo, dato);
  if (errores.length) fallar(tipo, errores);
  const r = ruta(vault, tipo);
  mkdirSync(dirname(r), { recursive: true });
  sobrescribir(r, JSON.stringify(dato, null, 2) + '\n');
  return dato;
}

const dos = (n) => String(n).padStart(2, '0');
// Instante local con zona: 2026-12-22T20:15:00-05:00.
export function instante(d = ahora()) {
  const off = -d.getTimezoneOffset();
  const z = `${off >= 0 ? '+' : '-'}${dos(Math.floor(Math.abs(off) / 60))}:${dos(Math.abs(off) % 60)}`;
  return `${fechaISO(d)}T${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}${z}`;
}

// Agrega un evento con id (ev-AAAAMMDD-NNNN) y ts; lo valida antes de escribir.
export function agregarEvento(vault, evento) {
  const d = ahora();
  const dia = fechaISO(d).replace(/-/g, '');
  const previos = leer(vault, 'eventos').filter((e) => e.id?.startsWith(`ev-${dia}-`)).length;
  const ev = { id: `ev-${dia}-${String(previos + 1).padStart(4, '0')}`, ts: instante(d), origen: 'cli', ...evento };
  const errores = validar('evento', ev);
  if (errores.length) fallar('evento', errores);
  const r = ruta(vault, 'eventos');
  mkdirSync(dirname(r), { recursive: true });
  appendFileSync(r, JSON.stringify(ev) + '\n');
  return ev;
}
