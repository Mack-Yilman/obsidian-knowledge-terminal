// Patrones de posibles datos de pacientes o de terceros. Se usan para avisar (lint) y para no copiar
// nada sospechoso en las fichas automáticas. Nunca se repite el dato encontrado.

export const SENSIBLES = [
  { re: /\bDNI\b\D{0,6}\d{8}\b/i, que: 'un DNI' },
  { re: /\b(historia\s+cl[ií]nica|H\.?\s?C\.?)\s*(n[°ºo.]*\s*)?:?\s*\d{4,}/i, que: 'un número de historia clínica' },
  { re: /(?<!\d|\d[.,])9\d{8}(?!\d|[.,]\d)/, que: 'un número de celular' },
  // Nombres en mayúsculas («Paciente JUAN PÉREZ») también, como suelen escribirse en registros clínicos.
  { re: /\b[Pp]aciente\s+[A-ZÁÉÍÓÚÑ](?:[a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]+)\s+[A-ZÁÉÍÓÚÑ](?:[a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]+)/, que: 'el nombre de un paciente' },
];

export function patronSensible(texto) {
  return SENSIBLES.find((s) => s.re.test(texto)) || null;
}

// Para nombres de archivo y mensajes de commit en las fichas: más estricto.
export function pareceSensible(texto) {
  return Boolean(patronSensible(texto)) || /paciente|historia.?cl[ií]nica|\bdni\b/i.test(texto);
}
