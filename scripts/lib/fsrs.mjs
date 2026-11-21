// Port de FSRS-6 de ts-fsrs 6.0.0 (https://github.com/open-spaced-repetition/ts-fsrs), MIT, Copyright (c) 2026 Open Spaced Repetition; aviso completo en ATTRIBUTION.md.

const S_MIN = 0.001;
const S_MAX = 36500;
const D_MIN = 1;
const D_MAX = 10;

export const PARAMS_FSRS6 = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
  0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

const clamp = (valor, min, max) => Math.min(Math.max(valor, min), max);
const roundTo = (num, decimales) => {
  const factor = 10 ** decimales;
  return Math.round(num * factor) / factor;
};

function validarDias(dias) {
  if (typeof dias !== 'number' || !Number.isFinite(dias) || dias < 0) {
    throw new Error(`Los días deben ser un número mayor o igual que 0 (recibido: ${dias})`);
  }
}

function validarNota(nota) {
  if (!Number.isInteger(nota) || nota < 1 || nota > 4) {
    throw new Error(`La nota debe ser un entero entre 1 y 4 (recibido: ${nota})`);
  }
}

export function crearFsrs({ retencion = 0.9, maximoDias = S_MAX, w = PARAMS_FSRS6 } = {}) {
  if (!Number.isFinite(retencion) || retencion <= 0 || retencion > 1) {
    throw new Error(`La retención deseada debe estar en (0, 1] (recibido: ${retencion})`);
  }
  if (!Number.isFinite(maximoDias) || maximoDias < 1) {
    throw new Error(`maximoDias debe ser al menos 1 (recibido: ${maximoDias})`);
  }
  if (!Array.isArray(w) || w.length !== 21 || w.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new Error('Se requieren exactamente 21 pesos numéricos finitos para FSRS-6');
  }

  const decay = -w[20];
  const factor = roundTo(Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1, 8);
  const escalaIntervalo = Math.pow(retencion, 1 / decay) - 1;

  const initEstabilidad = (g) => clamp(w[g - 1], S_MIN, S_MAX);
  const initDificultad = (g) => roundTo(w[4] - Math.exp((g - 1) * w[5]) + 1, 8);

  const curvaOlvido = (dias, s) => {
    if (dias === 0) return 1;
    return roundTo(Math.pow(1 + (factor * dias) / s, decay), 8);
  };

  const intervalo = (estabilidad) => {
    const crudo = Math.round((estabilidad / factor) * escalaIntervalo);
    return clamp(crudo, 1, maximoDias);
  };

  const siguienteDificultad = (d, g) => {
    const deltaD = -w[6] * (g - 3);
    const amortiguada = d + roundTo((deltaD * (10 - d)) / 9, 8);
    const revertida = roundTo(w[7] * initDificultad(4) + (1 - w[7]) * amortiguada, 8);
    return clamp(revertida, D_MIN, D_MAX);
  };

  const estabilidadRecuerdo = (d, s, r, g) => {
    const penHard = g === 2 ? w[15] : 1;
    const bonoEasy = g === 4 ? w[16] : 1;
    const crecimiento =
      1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * penHard * bonoEasy;
    return roundTo(clamp(s * crecimiento, S_MIN, S_MAX), 8);
  };

  const estabilidadOlvido = (d, s, r) => {
    const cruda = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
    return roundTo(clamp(cruda, S_MIN, S_MAX), 8);
  };

  const siguienteEstado = (estado, dias, g, r) => {
    if (estado === null) {
      return {
        estabilidad: initEstabilidad(g),
        dificultad: clamp(initDificultad(g), D_MIN, D_MAX),
      };
    }
    const { estabilidad: s, dificultad: d } = estado;
    const nuevaS =
      g === 1
        ? clamp(roundTo(s, 8), S_MIN, estabilidadOlvido(d, s, r))
        : estabilidadRecuerdo(d, s, r, g);
    return {
      estabilidad: nuevaS,
      dificultad: siguienteDificultad(d, g),
    };
  };

  function recuperabilidad(estado, dias) {
    validarDias(dias);
    if (estado === null) return 0;
    return curvaOlvido(dias, estado.estabilidad);
  }

  function repasar(estado, nota, dias = 0) {
    validarNota(nota);
    const t = estado === null && dias === null ? 0 : dias;
    validarDias(t);

    const r = estado === null ? 0 : curvaOlvido(t, estado.estabilidad);
    const candidatos = [1, 2, 3, 4].map((g) => siguienteEstado(estado, t, g, r));

    // Planificador de largo plazo: intervalos estrictamente crecientes entre notas, acotados por maximoDias.
    const ivls = candidatos.map((c) => intervalo(c.estabilidad));
    for (let i = 1; i < ivls.length; i++) {
      ivls[i] = Math.min(Math.max(ivls[i], ivls[i - 1] + 1), maximoDias);
    }

    const elegido = candidatos[nota - 1];
    return {
      estabilidad: elegido.estabilidad,
      dificultad: elegido.dificultad,
      repasos: estado === null ? 1 : estado.repasos + 1,
      lapsos: estado === null ? 0 : estado.lapsos + (nota === 1 ? 1 : 0),
      intervalo: ivls[nota - 1],
    };
  }

  return { repasar, recuperabilidad, intervalo };
}
