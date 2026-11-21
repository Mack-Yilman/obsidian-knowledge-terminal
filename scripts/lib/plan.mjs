// Planificador puro del tutor de estudio: reglas resumidas en references/contrato-estudio.md (sección 6).
// Lo implementó agy (Gemini 4 Hydrogen High) desde las reglas y las pruebas de tests/plan.test.mjs.
import { crearFsrs } from './fsrs.mjs';
import { fechaISO } from './fechas.mjs';

const MS_DIA = 86400000;
const TOPE_REPASO = 0.3;
const UMBRAL_SALVABLE = 0.65;
const MAX_OLVIDADOS_DIA = 2;
const MIN_RECUERDO_INICIAL = 5;
const MIN_REPASO = 3;
const MIN_BANQUEO_PRE = 15;
const MIN_LECTURA_MIN = 30;
const MIN_LECTURA_MAX = 60;
const MIN_NOTEBOOKLM = 15;
const MIN_SIMULACRO = 120;
const MIN_INTERCALADO = 25;

function aUtc(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function sumarDias(fecha, dias) {
  const d = new Date(aUtc(fecha) + dias * MS_DIA);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function diffDias(desde, hasta) {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA);
}

function diaSemana(fecha) {
  return new Date(aUtc(fecha)).getUTCDay();
}

function minutosDelDia(fecha, perfil, diasLibres) {
  if (diasLibres.has(fecha)) return 0;
  const dow = diaSemana(fecha);
  return dow === 0 || dow === 6 ? perfil.minutos_fin : perfil.minutos_laborable;
}

function elegirMetaGuia(metas, hoy) {
  const lista = metas?.metas || [];
  const examenes = lista
    .filter((m) => m.activa && m.tipo === 'examen' && m.fecha >= hoy)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  if (examenes.length > 0) return examenes[0];
  const continua = lista.find((m) => m.activa && m.tipo === 'continuo');
  if (continua) return continua;
  throw Object.assign(
    new Error('No hay ninguna meta activa. Agrega una con: okt estudio meta agregar'),
    { codigo: 1 },
  );
}

function clonarBloque(b) {
  return {
    ...b,
    ...(b.temas ? { temas: [...b.temas] } : {}),
  };
}

function aplicarCheckins(planAnterior, eventos) {
  if (!planAnterior) return null;
  const checkins = new Map();
  for (const ev of eventos) {
    if (ev?.tipo === 'checkin' && ev.bloque && ev.estado) {
      checkins.set(ev.bloque, ev.estado);
    }
  }
  return {
    ...planAnterior,
    dias: (planAnterior.dias || []).map((d) => ({
      ...d,
      bloques: (d.bloques || []).map((b) => {
        const estado = checkins.get(b.id) ?? b.estado;
        return clonarBloque({ ...b, estado });
      }),
    })),
  };
}

function extraerHistorial(planClonado, hoy) {
  if (!planClonado) return [];
  const desde = sumarDias(hoy, -7);
  const hasta = sumarDias(hoy, -1);
  return planClonado.dias
    .filter((d) => d.fecha >= desde && d.fecha <= hasta)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    .map((d) => ({ fecha: d.fecha, minutos: d.minutos, bloques: d.bloques.map(clonarBloque) }));
}

function extraerConservadosHoy(planClonado, hoy) {
  const vacio = { bloques: [], maxN: 0, temasExcluidos: new Set(), clasesEnHoy: new Set() };
  if (!planClonado) return vacio;
  const diaHoy = planClonado.dias.find((d) => d.fecha === hoy);
  if (!diaHoy) return vacio;

  const bloques = [];
  let maxN = 0;
  const temasExcluidos = new Set();
  const clasesEnHoy = new Set();
  const prefijo = `${hoy}-`;

  for (const b of diaHoy.bloques) {
    // Solo lo ya marcado; lo arrastrado y pendiente se vuelve a ubicar en arrastrarPendientes (puede no caber hoy).
    const conservado = b.estado === 'hecho' || b.estado === 'saltado';
    if (!conservado) continue;
    bloques.push(clonarBloque(b));
    if (b.id?.startsWith(prefijo)) {
      const n = Number.parseInt(b.id.slice(prefijo.length), 10);
      if (Number.isInteger(n) && n > maxN) maxN = n;
    }
    if (b.tema && (b.herramienta === 'lectura' || b.herramienta === 'clase') && b.estado === 'hecho') {
      temasExcluidos.add(b.tema);
      clasesEnHoy.add(b.tema);
    }
  }
  return { bloques, maxN, temasExcluidos, clasesEnHoy };
}

function obtenerTemasMeta(metaGuia, temasObj) {
  const mapa = temasObj?.temas || {};
  const resultado = [];
  const vistos = new Set();

  if (Array.isArray(metaGuia.temario) && metaGuia.temario.length > 0) {
    for (const item of metaGuia.temario) {
      const t = mapa[item.tema];
      if (!t || t.retirado || vistos.has(item.tema)) continue;
      vistos.add(item.tema);
      resultado.push({ ...t, id: item.tema, peso: item.peso ?? 1, orden: resultado.length });
    }
  }

  // Los temas que dicen pertenecer a la meta sin estar en su temario entran con peso 1 (contrato, metas.temario).
  for (const [id, t] of Object.entries(mapa)) {
    if (!t || t.retirado || vistos.has(id) || !Array.isArray(t.metas) || !t.metas.includes(metaGuia.id)) continue;
    resultado.push({ ...t, id, peso: 1, orden: resultado.length });
  }
  return resultado;
}

function calcularErrores14(eventos, hoy) {
  const desde = sumarDias(hoy, -14);
  const conteo = new Map();
  const sumar = (id, cant) => {
    if (id && cant > 0) conteo.set(id, (conteo.get(id) ?? 0) + cant);
  };
  for (const ev of eventos) {
    // Día local del evento: un ts en UTC (p. ej. de Telegram) cae en otro día con slice.
    const fechaEv = ev?.ts ? fechaISO(new Date(ev.ts)) : null;
    if (!fechaEv || fechaEv < desde || fechaEv > hoy) continue;
    if (ev.tipo === 'error') sumar(ev.tema, 1);
    else if (ev.tipo === 'examen' && ev.por_tema) {
      for (const [id, st] of Object.entries(ev.por_tema)) {
        sumar(id, (st?.total ?? 0) - (st?.aciertos ?? 0));
      }
    }
  }
  return conteo;
}

function temasConCheckinLectura(eventos) {
  const set = new Set();
  for (const ev of eventos) {
    if (
      ev?.tipo === 'checkin' &&
      ev.estado === 'hecho' &&
      (ev.herramienta === 'lectura' || ev.herramienta === 'clase') &&
      ev.tema
    ) {
      set.add(ev.tema);
    }
  }
  return set;
}

function prioridadTema(tema, errores14) {
  const debilidad = 1 - ((tema.aciertos ?? 0) + 1) / ((tema.preguntas ?? 0) + 2);
  const err = errores14.get(tema.id) ?? 0;
  return tema.peso * debilidad * (1 + 0.2 * err);
}

function ordenarPorPrioridad(lista, errores14) {
  return [...lista].sort((a, b) => {
    const diff = prioridadTema(b, errores14) - prioridadTema(a, errores14);
    if (Math.abs(diff) > 1e-12) return diff;
    return a.orden - b.orden;
  });
}

function arrastrarPendientes(planClonado, hoy, diasVentana, usadosPorDia) {
  const arrastradosPorDia = diasVentana.map(() => []);
  const temasArrastrados = new Set();
  const clasesArrastradas = new Map();
  let movidos = 0;
  let descartados = 0;

  if (!planClonado || !planClonado.generado) {
    return { arrastradosPorDia, temasArrastrados, clasesArrastradas, movidos, descartados };
  }

  const fechaG = planClonado.generado.slice(0, 10);
  const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  // Lo ya arrastrado que sigue pendiente desde hoy se vuelve a ubicar sin sumar arrastre (si no, regenerar el mismo día
  // lo perdía, o lo dejaba en un hoy con menos minutos); lo pendiente de los días pasados se arrastra y suma uno.
  const yaArrastrados = planClonado.dias
    .filter((d) => d.fecha >= hoy)
    .sort(porFecha)
    .flatMap((d) => d.bloques.filter((b) => b.estado === 'pendiente' && (b.arrastres ?? 0) > 0).map((b) => ({ b, suma: 0 })));
  const deDiasPasados = planClonado.dias
    .filter((d) => d.fecha >= fechaG && d.fecha < hoy)
    .sort(porFecha)
    .flatMap((d) => d.bloques.map((b) => ({ b, suma: 1 })));

  for (const { b, suma } of [...yaArrastrados, ...deDiasPasados]) {
    {
      const esArrastrable =
        (b.estado === 'pendiente' || b.estado === 'saltado') &&
        b.herramienta !== 'remnote' &&
        b.herramienta !== 'repaso';
      if (!esArrastrable) continue;
      if (suma && (b.arrastres ?? 0) >= 2) {
        descartados += 1;
        continue;
      }
      const destino = diasVentana.findIndex((dia, idx) => dia.minutos - usadosPorDia[idx] >= b.minutos);
      if (destino === -1) continue;

      const copia = {
        accion: b.accion,
        herramienta: b.herramienta,
        ...(b.tema ? { tema: b.tema } : {}),
        ...(b.temas ? { temas: [...b.temas] } : {}),
        minutos: b.minutos,
        estado: 'pendiente',
        arrastres: (b.arrastres ?? 0) + suma,
      };
      arrastradosPorDia[destino].push(copia);
      usadosPorDia[destino] += b.minutos;
      movidos += suma;

      if (b.tema) {
        temasArrastrados.add(b.tema);
        if (b.herramienta === 'lectura' || b.herramienta === 'clase') {
          clasesArrastradas.set(b.tema, diasVentana[destino].fecha);
        }
      }
    }
  }
  return { arrastradosPorDia, temasArrastrados, clasesArrastradas, movidos, descartados };
}

function programarRemnote(dia, bloquesExistentes, perfil, restante) {
  const min = perfil.remnote_min ?? 0;
  if (min <= 0 || restante < min) return 0;
  if (bloquesExistentes.some((b) => b.herramienta === 'remnote')) return 0;
  dia.bloques.push({
    accion: `RemNote: ${min} min de tarjetas vencidas`,
    herramienta: 'remnote',
    minutos: min,
    estado: 'pendiente',
  });
  return min;
}

function programarRepasos(dia, ctx, restante) {
  const tope = Math.floor(TOPE_REPASO * dia.minutos);
  let usadosRepaso = dia.bloques
    .filter((b) => b.herramienta === 'repaso')
    .reduce((s, b) => s + b.minutos, 0);
  const repasadosHoy = new Set(
    dia.bloques.filter((b) => b.herramienta === 'repaso' && b.tema).map((b) => b.tema),
  );
  let consumido = 0;

  // 1. Recuerdo libre inicial (5 min) de temas visto sin repaso o con clase previa en ventana.
  const pendientesInicial = [];
  for (const id of ctx.colaInicial) {
    if (repasadosHoy.has(id)) continue;
    const fechaClase = ctx.fechaClasePorTema.get(id);
    if (fechaClase && fechaClase >= dia.fecha) continue;
    pendientesInicial.push(ctx.temaPorId.get(id));
  }

  for (const t of ordenarPorPrioridad(pendientesInicial, ctx.errores14)) {
    const id = t.id;
    if (usadosRepaso + MIN_RECUERDO_INICIAL > tope || restante - consumido < MIN_RECUERDO_INICIAL) break;
    dia.bloques.push({
      accion: `Recuerdo libre inicial: ${t.titulo}`,
      herramienta: 'repaso',
      tema: id,
      minutos: MIN_RECUERDO_INICIAL,
      estado: 'pendiente',
    });
    const res = ctx.fsrs.repasar(null, 3, 0);
    ctx.estadoFsrs.set(id, {
      estabilidad: res.estabilidad,
      dificultad: res.dificultad,
      repasos: res.repasos,
      lapsos: res.lapsos,
      ultimo: dia.fecha,
      vence: sumarDias(dia.fecha, res.intervalo),
    });
    ctx.colaInicial.delete(id);
    repasadosHoy.add(id);
    usadosRepaso += MIN_RECUERDO_INICIAL;
    consumido += MIN_RECUERDO_INICIAL;
  }

  // 2. Temas vencidos (fsrs.vence <= fecha).
  const salvables = [];
  const olvidados = [];
  for (const t of ctx.temasMeta) {
    if (repasadosHoy.has(t.id)) continue;
    const est = ctx.estadoFsrs.get(t.id);
    if (!est || est.vence > dia.fecha) continue;
    const dias = Math.max(0, diffDias(est.ultimo, dia.fecha));
    const r = ctx.fsrs.recuperabilidad(est, dias);
    const item = { tema: t, est, dias, r };
    if (r >= UMBRAL_SALVABLE) salvables.push(item);
    else olvidados.push(item);
  }

  salvables.sort((a, b) => {
    const score = b.tema.peso * (1 - b.r) - a.tema.peso * (1 - a.r);
    if (Math.abs(score) > 1e-12) return score;
    return a.tema.id < b.tema.id ? -1 : a.tema.id > b.tema.id ? 1 : 0;
  });
  olvidados.sort((a, b) => {
    if (b.tema.peso !== a.tema.peso) return b.tema.peso - a.tema.peso;
    return a.tema.id < b.tema.id ? -1 : a.tema.id > b.tema.id ? 1 : 0;
  });

  const candidatos = [...salvables, ...olvidados.slice(0, MAX_OLVIDADOS_DIA)];
  for (const item of candidatos) {
    if (usadosRepaso + MIN_REPASO > tope || restante - consumido < MIN_REPASO) break;
    dia.bloques.push({
      accion: `Repaso libre: ${item.tema.titulo} (${MIN_REPASO} min)`,
      herramienta: 'repaso',
      tema: item.tema.id,
      minutos: MIN_REPASO,
      estado: 'pendiente',
    });
    const res = ctx.fsrs.repasar(item.est, 3, item.dias);
    ctx.estadoFsrs.set(item.tema.id, {
      estabilidad: res.estabilidad,
      dificultad: res.dificultad,
      repasos: res.repasos,
      lapsos: res.lapsos,
      ultimo: dia.fecha,
      vence: sumarDias(dia.fecha, res.intervalo),
    });
    usadosRepaso += MIN_REPASO;
    consumido += MIN_REPASO;
  }

  return consumido;
}

function programarSimulacro(dia, ctx, restante) {
  if (ctx.metaGuia.tipo !== 'examen') return 0;
  const faltan = diffDias(dia.fecha, ctx.metaGuia.fecha);
  const enVentanaSim = faltan > 0 && faltan <= 56;
  const dow = diaSemana(dia.fecha);
  const esSabado = dow === 6;
  const esDomingo = dow === 0;

  if (!enVentanaSim || (!esSabado && !esDomingo)) {
    ctx.simulacroPendienteDomingo = false;
    return 0;
  }
  if (esDomingo && !ctx.simulacroPendienteDomingo) return 0;

  const yaTiene = dia.bloques.some((b) => b.herramienta === 'simulacro');
  if (yaTiene) {
    ctx.simulacroPendienteDomingo = false;
    return 0;
  }
  if (restante < MIN_SIMULACRO) {
    ctx.simulacroPendienteDomingo = esSabado;
    return 0;
  }

  dia.bloques.push({
    accion: 'Simulacro: 100 preguntas mezcladas del temario',
    herramienta: 'simulacro',
    temas: ctx.temasMeta.map((t) => t.id),
    minutos: MIN_SIMULACRO,
    estado: 'pendiente',
  });
  ctx.simulacroPendienteDomingo = false;
  return MIN_SIMULACRO;
}

function huboIntercaladoReciente(fecha, historial, generados, bloquesHoy) {
  const diasPrevios = new Set([sumarDias(fecha, -1), sumarDias(fecha, -2), fecha]);
  const esIntercalado = (b) => b.herramienta === 'banqueo' && Array.isArray(b.temas) && b.temas.length > 0;
  for (const d of historial) {
    if (diasPrevios.has(d.fecha) && d.bloques.some(esIntercalado)) return true;
  }
  for (const d of generados) {
    if (diasPrevios.has(d.fecha) && d.bloques.some(esIntercalado)) return true;
  }
  return bloquesHoy.some(esIntercalado);
}

function programarIntercalado(dia, ctx, restante) {
  if (restante < MIN_INTERCALADO) return 0;
  const vistos = ctx.temasMeta.filter((t) => {
    if (ctx.vistosIniciales.has(t.id)) return true;
    const fechaClase = ctx.fechaClasePorTema.get(t.id);
    return fechaClase !== undefined && fechaClase < dia.fecha;
  });
  if (vistos.length < 3) return 0;
  if (huboIntercaladoReciente(dia.fecha, ctx.historial, ctx.generados, dia.bloques)) return 0;

  // Rota: primero los que menos salieron en intercalados (historial y ventana); a igual uso, por prioridad.
  const usos = new Map();
  for (const d of [...ctx.historial, ...ctx.generados]) {
    for (const b of d.bloques) if (b.herramienta === 'banqueo' && Array.isArray(b.temas)) for (const id of b.temas) usos.set(id, (usos.get(id) ?? 0) + 1);
  }
  const porPrioridad = ordenarPorPrioridad(vistos, ctx.errores14);
  const top3 = porPrioridad
    .map((t, i) => ({ t, i, u: usos.get(t.id) ?? 0 }))
    .sort((a, b) => a.u - b.u || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.t);
  dia.bloques.push({
    accion: `Banqueo intercalado: 20 preguntas mezcladas de ${top3[0].titulo}, ${top3[1].titulo} y ${top3[2].titulo}`,
    herramienta: 'banqueo',
    temas: top3.map((t) => t.id),
    minutos: MIN_INTERCALADO,
    estado: 'pendiente',
  });
  return MIN_INTERCALADO;
}

function programarTemasNuevos(dia, ctx, restante) {
  if (ctx.metaGuia.tipo === 'examen') {
    if (dia.fecha > ctx.ultimoDiaNuevo || ctx.utilesTotal <= 0) return 0;
  }
  if (dia.minutos <= 0) return 0;

  ctx.indiceEstudio += 1;
  const i = ctx.indiceEstudio;
  const cuotaDia =
    ctx.metaGuia.tipo === 'examen'
      ? // ceil: el primer día útil ya trae un tema nuevo (con floor, 40 temas en 102 días empezaban el 3.er día).
        Math.ceil((ctx.totalNuevos * i) / ctx.utilesTotal) -
        Math.ceil((ctx.totalNuevos * (i - 1)) / ctx.utilesTotal)
      : Math.ceil((3 * i) / 7) - Math.ceil((3 * (i - 1)) / 7);

  ctx.pendientesCuota = Math.min(ctx.pendientesCuota + cuotaDia, ctx.nuevosDisponibles.length);

  let consumido = 0;
  const minBloqueTotal = MIN_BANQUEO_PRE + MIN_LECTURA_MIN + MIN_NOTEBOOKLM;

  while (ctx.pendientesCuota > 0 && ctx.nuevosDisponibles.length > 0) {
    const queda = restante - consumido;
    if (queda < minBloqueTotal) break;

    const tema = ctx.nuevosDisponibles.shift();
    const minLectura = Math.min(MIN_LECTURA_MAX, queda - MIN_BANQUEO_PRE - MIN_NOTEBOOKLM);

    dia.bloques.push(
      {
        accion: `Banqueo: 10 preguntas de ${tema.titulo} antes de estudiarla`,
        herramienta: 'banqueo',
        tema: tema.id,
        minutos: MIN_BANQUEO_PRE,
        estado: 'pendiente',
      },
      {
        accion: `Clase o lectura: ${tema.titulo}`,
        herramienta: 'lectura',
        tema: tema.id,
        minutos: minLectura,
        estado: 'pendiente',
      },
      {
        accion: `NotebookLM: quiz o audio de ${tema.titulo}`,
        herramienta: 'notebooklm',
        tema: tema.id,
        minutos: MIN_NOTEBOOKLM,
        estado: 'pendiente',
      },
    );

    ctx.fechaClasePorTema.set(tema.id, dia.fecha);
    ctx.colaInicial.add(tema.id);
    ctx.pendientesCuota -= 1;
    consumido += MIN_BANQUEO_PRE + minLectura + MIN_NOTEBOOKLM;
  }

  return consumido;
}

function contarDiasUtilesExamen(hoy, ultimoDiaNuevo, perfil, diasLibres) {
  if (ultimoDiaNuevo < hoy) return 0;
  const total = diffDias(hoy, ultimoDiaNuevo) + 1;
  let utiles = 0;
  for (let d = 0; d < total; d++) {
    if (minutosDelDia(sumarDias(hoy, d), perfil, diasLibres) > 0) utiles += 1;
  }
  return utiles;
}

function asignarIdsDia(dia, maxNInicial) {
  let n = maxNInicial;
  return {
    fecha: dia.fecha,
    minutos: dia.minutos,
    bloques: dia.bloques.map((b) => {
      if (b.id) return b;
      n += 1;
      return { id: `${dia.fecha}-${n}`, ...b };
    }),
  };
}

function construirAviso({ movidos, descartados, sinProgramar, diasEstudioVentana, perfil, esExamen, utilesTotal, hayNuevos }) {
  const partes = [];
  if (movidos > 0) partes.push(`Moví ${movidos} bloques pendientes.`);
  if (descartados > 0) partes.push(`Descarté ${descartados} que ya se habían movido 2 veces.`);
  if (sinProgramar > 0) {
    const base = Math.max(1, diasEstudioVentana);
    const m = perfil.minutos_laborable + Math.ceil((sinProgramar * 90) / base);
    partes.push(`No caben ${sinProgramar} temas nuevos en 14 días: sube a ${m} min por día laborable o quita temas del temario.`);
  }
  if (esExamen && utilesTotal <= 0 && hayNuevos) {
    partes.push('Ya no quedan días para temas nuevos antes del repaso final.');
  }
  return partes.join(' ');
}

export function generarPlan({ metas, perfil, temas, eventos = [], planAnterior = null, hoy, generado, fsrs }) {
  const motorFsrs = fsrs ?? crearFsrs({ retencion: perfil?.retencion_deseada ?? 0.9 });
  const metaGuia = elegirMetaGuia(metas, hoy);
  // Antes del inicio de la meta no se estudia: esos días cuentan como libres (0 minutos, fuera de la cuota).
  const libres = new Set(perfil?.dias_libres || []);
  const diasLibres = { has: (fecha) => libres.has(fecha) || fecha < (metaGuia.inicio ?? '') };

  const planClonado = aplicarCheckins(planAnterior, eventos);
  const historial = extraerHistorial(planClonado, hoy);
  const conservadosHoy = extraerConservadosHoy(planClonado, hoy);

  const diasVentana = Array.from({ length: 14 }, (_, k) => {
    const fecha = sumarDias(hoy, k);
    return {
      fecha,
      minutos: minutosDelDia(fecha, perfil, diasLibres),
      bloques: k === 0 ? [...conservadosHoy.bloques] : [],
    };
  });

  const usadosPorDia = diasVentana.map((d) => d.bloques.reduce((s, b) => s + b.minutos, 0));
  const arrastre = arrastrarPendientes(planClonado, hoy, diasVentana, usadosPorDia);

  const temasMeta = obtenerTemasMeta(metaGuia, temas);
  const temaPorId = new Map(temasMeta.map((t) => [t.id, t]));
  const errores14 = calcularErrores14(eventos, hoy);
  const conCheckin = temasConCheckinLectura(eventos);

  const vistosIniciales = new Set();
  const colaInicial = new Set();
  const estadoFsrs = new Map();
  const nuevosSinFiltrar = [];

  for (const t of temasMeta) {
    const visto = t.fsrs != null || conCheckin.has(t.id);
    if (visto) {
      vistosIniciales.add(t.id);
      if (t.fsrs) estadoFsrs.set(t.id, { ...t.fsrs });
      else colaInicial.add(t.id);
    } else if (!arrastre.temasArrastrados.has(t.id) && !conservadosHoy.temasExcluidos.has(t.id)) {
      nuevosSinFiltrar.push(t);
    }
  }

  const fechaClasePorTema = new Map();
  for (const id of conservadosHoy.clasesEnHoy) fechaClasePorTema.set(id, hoy);
  for (const [id, fecha] of arrastre.clasesArrastradas) {
    fechaClasePorTema.set(id, fecha);
    colaInicial.add(id);
  }

  // Si un tema tenía clase conservada hoy (por ej. marcada hecha directamente), necesita recuerdo inicial desde mañana.
  for (const id of conservadosHoy.clasesEnHoy) {
    if (!estadoFsrs.has(id)) colaInicial.add(id);
  }

  const nuevosDisponibles = ordenarPorPrioridad(nuevosSinFiltrar, errores14);
  const ultimoDiaNuevo = metaGuia.tipo === 'examen' ? sumarDias(metaGuia.fecha, -8) : '';
  const utilesTotal =
    metaGuia.tipo === 'examen' ? contarDiasUtilesExamen(hoy, ultimoDiaNuevo, perfil, diasLibres) : 0;

  const ctx = {
    metaGuia,
    temasMeta,
    temaPorId,
    errores14,
    fsrs: motorFsrs,
    vistosIniciales,
    colaInicial,
    estadoFsrs,
    fechaClasePorTema,
    historial,
    generados: [],
    simulacroPendienteDomingo: false,
    ultimoDiaNuevo,
    utilesTotal,
    totalNuevos: nuevosDisponibles.length,
    nuevosDisponibles,
    indiceEstudio: 0,
    pendientesCuota: 0,
  };

  for (let idx = 0; idx < diasVentana.length; idx++) {
    const dia = diasVentana[idx];
    const conservados = [...dia.bloques];
    const arrastrados = arrastre.arrastradosPorDia[idx];
    dia.bloques = [...conservados, ...arrastrados];

    if (dia.minutos > 0) {
      let restante = dia.minutos - dia.bloques.reduce((s, b) => s + b.minutos, 0);
      restante -= programarRemnote(dia, conservados, perfil, restante);
      restante -= programarRepasos(dia, ctx, restante);
      restante -= programarSimulacro(dia, ctx, restante);
      restante -= programarIntercalado(dia, ctx, restante);
      restante -= programarTemasNuevos(dia, ctx, restante);
    } else {
      programarSimulacro(dia, ctx, 0);
    }

    const maxN = idx === 0 ? conservadosHoy.maxN : 0;
    ctx.generados.push(asignarIdsDia(dia, maxN));
  }

  const diasEstudioVentana = diasVentana.filter((d) => d.minutos > 0).length;
  const aviso = construirAviso({
    movidos: arrastre.movidos,
    descartados: arrastre.descartados,
    sinProgramar: ctx.pendientesCuota,
    diasEstudioVentana,
    perfil,
    esExamen: metaGuia.tipo === 'examen',
    utilesTotal,
    hayNuevos: ctx.totalNuevos > 0,
  });

  return {
    version: 1,
    generado,
    meta: metaGuia.id,
    ...(aviso ? { aviso } : {}),
    dias: [...historial, ...ctx.generados],
  };
}
