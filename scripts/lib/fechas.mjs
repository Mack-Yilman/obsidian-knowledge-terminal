// Fechas en hora local: toISOString() da UTC y en Perú (UTC-5) adelanta el día después de las 19:00.
// OKT_FECHA (p. ej. "2026-10-22T10:30") fija la hora para las pruebas.

export function ahora() {
  const fija = process.env.OKT_FECHA;
  if (fija) {
    const [f, h = '00:00'] = fija.split('T');
    const [a, m, d] = f.split('-').map(Number);
    const [hh, mm] = h.split(':').map(Number);
    return new Date(a, m - 1, d, hh, mm);
  }
  return new Date();
}

const dos = (n) => String(n).padStart(2, '0');

export function fechaISO(d = ahora()) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function horaCorta(d = ahora()) {
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function semanaISO(d = ahora()) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diaSemana = (t.getDay() + 6) % 7; // lunes = 0
  t.setDate(t.getDate() - diaSemana + 3); // el jueves de esa semana decide el año
  const anio = t.getFullYear();
  const primerJueves = new Date(anio, 0, 4);
  const semana = 1 + Math.round(((t - primerJueves) / 86400000 - 3 + ((primerJueves.getDay() + 6) % 7)) / 7);
  return `${anio}-W${dos(semana)}`;
}

export function diasEntre(desdeISO, hasta = ahora()) {
  const [a, m, d] = desdeISO.split('-').map(Number);
  const desde = new Date(a, m - 1, d);
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((fin - desde) / 86400000);
}
