// okt estudio: tutor de estudio (metas, perfil, temas, repasos FSRS, calificación a ciegas, plan y resumen).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { leer, guardar, agregarEvento, validar, instante } from './estudio-datos.mjs';
import { crearFsrs } from './fsrs.mjs';
import { fechaISO, diasEntre } from './fechas.mjs';
import { sobrescribir, RAIZ_PLUGIN } from './rutas.mjs';
import { generarPlan } from './plan.mjs';

const CONFIANZAS = new Set([90, 70, 50, 25]);
const ESTADOS_BLOQUE = new Set(['hecho', 'saltado']);

function uso(mensaje) {
  throw Object.assign(new Error(mensaje), { codigo: 2 });
}

function fallo(mensaje) {
  throw Object.assign(new Error(mensaje), { codigo: 1 });
}

function salida(texto, siguiente, datos) {
  const limpio = String(texto).replace(/\n+$/, '');
  return { texto: `${limpio}\n📍 siguiente: okt estudio ${siguiente}`, datos };
}

function aId(texto) {
  const id = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!id) uso('El nombre debe tener al menos una letra o número.');
  return id;
}

function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function fechaLocal(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function temaVacio(titulo, nota) {
  const t = {
    titulo,
    metas: [],
    pregunta: '',
    canonica: '',
    rubrica: [],
    fsrs: null,
    aciertos: 0,
    preguntas: 0,
    contrasta_con: [],
    retirado: false,
  };
  if (nota) t.nota = nota;
  return t;
}

function obtenerMetaGuia(metas, hoy) {
  const activas = (metas?.metas || []).filter((m) => m.activa);
  const examenes = activas
    .filter((m) => m.tipo === 'examen' && m.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (examenes.length) return examenes[0];
  return activas.find((m) => m.tipo === 'continuo') || null;
}

function pesosDeMeta(meta) {
  const mapa = new Map();
  for (const item of meta?.temario || []) mapa.set(item.tema, item.peso);
  return mapa;
}

function cargarDiagnosticoTabla() {
  const ruta = join(RAIZ_PLUGIN, 'references', 'diagnostico-habitos.json');
  return JSON.parse(readFileSync(ruta, 'utf8'));
}

// --- Subcomandos: meta ---

function cmdMeta(vault, pos, op, hoy) {
  const accion = pos[0];
  if (accion === 'agregar') {
    const titulo = pos.slice(1).join(' ').trim();
    if (!titulo) uso('Uso: okt estudio meta agregar "<título>" --tipo examen|continuo [--fecha AAAA-MM-DD] [--temario "Tema:peso,…"]');
    const tipo = op.tipo;
    if (tipo !== 'examen' && tipo !== 'continuo') {
      uso('Especifica --tipo examen o --tipo continuo. Ejemplo: okt estudio meta agregar "ENCAPS" --tipo examen --fecha 2027-04-10');
    }
    if (tipo === 'examen' && !op.fecha) {
      uso(`Una meta de tipo examen necesita --fecha AAAA-MM-DD. Ejemplo: okt estudio meta agregar "${titulo}" --tipo examen --fecha 2027-04-10`);
    }
    const id = aId(titulo);
    const metas = leer(vault, 'metas');
    if (metas.metas.some((m) => m.id === id)) {
      uso(`Ya existe una meta con id "${id}". Lista las metas con: okt estudio meta listar`);
    }
    const temas = leer(vault, 'temas');
    const temario = [];
    let tocoTemas = false;

    if (op.temario) {
      for (const bruto of String(op.temario).split(',')) {
        const parte = bruto.trim();
        if (!parte) continue;
        const idx = parte.lastIndexOf(':');
        const nombre = (idx > 0 ? parte.slice(0, idx) : parte).trim();
        const peso = idx > 0 ? Number(parte.slice(idx + 1).trim()) : 1;
        if (!nombre || !Number.isFinite(peso) || peso <= 0) {
          uso(`Temario inválido en "${parte}". Usa "Tema:peso" con peso > 0.`);
        }
        const tid = aId(nombre);
        temario.push({ tema: tid, peso });
        if (!temas.temas[tid]) {
          temas.temas[tid] = temaVacio(nombre);
        }
        if (!temas.temas[tid].metas.includes(id)) {
          temas.temas[tid].metas.push(id);
        }
        tocoTemas = true;
      }
    }

    const nueva = {
      id,
      titulo,
      tipo,
      ...(tipo === 'examen' ? { fecha: op.fecha } : {}),
      inicio: op.inicio || hoy,
      temario,
      activa: true,
    };
    metas.metas.push(nueva);
    guardar(vault, 'metas', metas);
    if (tocoTemas) guardar(vault, 'temas', temas);

    return salida(
      `Meta "${titulo}" (${id}) agregada con ${temario.length} temas.`,
      'perfil --minutos-laborable 150 --minutos-fin 240',
      { meta: nueva },
    );
  }

  if (accion === 'listar') {
    const metas = leer(vault, 'metas');
    const lineas = metas.metas.length
      ? metas.metas.map((m) => `- ${m.id}: ${m.titulo} [${m.tipo}${m.fecha ? `, ${m.fecha}` : ''}] (${m.activa ? 'activa' : 'cerrada'})`)
      : ['No hay metas registradas.'];
    const sig = metas.metas.some((m) => m.activa) ? 'plan hoy' : 'meta agregar "<título>" --tipo examen --fecha AAAA-MM-DD';
    return salida(lineas.join('\n'), sig, { metas: metas.metas });
  }

  if (accion === 'cerrar') {
    const id = pos[1];
    if (!id) uso('Uso: okt estudio meta cerrar <id>');
    const metas = leer(vault, 'metas');
    const meta = metas.metas.find((m) => m.id === id);
    if (!meta) uso(`No existe la meta "${id}". Lista las metas con: okt estudio meta listar`);
    meta.activa = false;
    guardar(vault, 'metas', metas);
    return salida(`Meta "${meta.titulo}" (${id}) cerrada.`, 'meta listar', { meta });
  }

  uso('Uso: okt estudio meta agregar|listar|cerrar');
}

// --- Subcomando: perfil ---

function cmdPerfil(vault, op, hoy) {
  const perfil = leer(vault, 'perfil');
  const tieneOpciones =
    op['minutos-laborable'] !== undefined ||
    op['minutos-fin'] !== undefined ||
    op.remnote !== undefined ||
    op['dias-libres'] !== undefined ||
    op.retencion !== undefined ||
    op.cuestionario !== undefined;

  if (!tieneOpciones) {
    const texto = [
      `Perfil de estudio (actualizado ${perfil.actualizado}):`,
      `- Laborable: ${perfil.minutos_laborable} min | Fin de semana: ${perfil.minutos_fin} min | RemNote: ${perfil.remnote_min} min`,
      `- Retención deseada: ${perfil.retencion_deseada}`,
      `- Días libres: ${perfil.dias_libres.length ? perfil.dias_libres.join(', ') : '(ninguno)'}`,
      `- Diagnóstico: ${perfil.diagnostico.length} hallazgo(s)`,
    ].join('\n');
    return salida(texto, 'plan generar', { perfil });
  }

  if (op['minutos-laborable'] !== undefined) perfil.minutos_laborable = Number(op['minutos-laborable']);
  if (op['minutos-fin'] !== undefined) perfil.minutos_fin = Number(op['minutos-fin']);
  if (op.remnote !== undefined) perfil.remnote_min = Number(op.remnote);
  if (op.retencion !== undefined) perfil.retencion_deseada = Number(op.retencion);
  if (op['dias-libres'] !== undefined) {
    perfil.dias_libres = String(op['dias-libres'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (op.cuestionario !== undefined) {
    const cuestionario = { ...(perfil.cuestionario || {}) };
    for (const bruto of String(op.cuestionario).split(',')) {
      const parte = bruto.trim();
      if (!parte) continue;
      const m = /^(\d+)([a-d])$/i.exec(parte);
      const n = m ? Number(m[1]) : 0;
      if (!m || n < 1 || n > 10) {
        uso(`Respuesta de cuestionario inválida: "${parte}". Usa pregunta 1-10 y opción a-d (ej. "3a,5b").`);
      }
      cuestionario[`p${n}`] = m[2].toLowerCase();
    }
    perfil.cuestionario = cuestionario;

    const tabla = cargarDiagnosticoTabla();
    const diagnostico = [];
    for (let i = 1; i <= 10; i++) {
      const p = `p${i}`;
      const resp = cuestionario[p];
      if (!resp) continue;
      const entrada = tabla[p]?.[resp];
      if (entrada) {
        diagnostico.push({
          pregunta: p,
          hallazgo: entrada.hallazgo,
          recomendacion: entrada.recomendacion,
          citas: entrada.citas,
        });
      }
    }
    perfil.diagnostico = diagnostico;
  }

  perfil.actualizado = hoy;
  guardar(vault, 'perfil', perfil);

  return salida(
    `Perfil actualizado (${perfil.minutos_laborable}/${perfil.minutos_fin} min, retención ${perfil.retencion_deseada}, ${perfil.diagnostico.length} hallazgo(s)).`,
    'plan generar',
    { perfil },
  );
}

// --- Subcomando: tema ---

function cmdTema(vault, pos, op) {
  const accion = pos[0];
  const temas = leer(vault, 'temas');

  if (accion === 'agregar') {
    const titulo = pos.slice(1).join(' ').trim();
    if (!titulo) uso('Uso: okt estudio tema agregar "<título>" [--meta <id>] [--nota "[[…]]"]');
    const id = aId(titulo);
    if (temas.temas[id]) uso(`Ya existe el tema "${id}". Edítalo con: okt estudio tema editar ${id}`);
    const nuevo = temaVacio(titulo, op.nota);
    if (op.meta) nuevo.metas.push(op.meta);
    temas.temas[id] = nuevo;
    guardar(vault, 'temas', temas);
    return salida(`Tema "${titulo}" (${id}) creado.`, `tema editar ${id} --pregunta "…" --canonica "…" --rubrica "a|b|c"`, { id, tema: nuevo });
  }

  if (accion === 'editar') {
    const id = pos[1];
    if (!id || !temas.temas[id]) uso(`No existe el tema "${id || ''}". Lista los temas con: okt estudio tema listar`);
    const t = temas.temas[id];
    if (op.meta && !t.metas.includes(op.meta)) t.metas.push(op.meta);
    if (op.nota !== undefined) t.nota = op.nota;
    if (op.pregunta !== undefined) t.pregunta = op.pregunta;
    if (op.canonica !== undefined) t.canonica = op.canonica;
    if (op.rubrica !== undefined) {
      t.rubrica = String(op.rubrica)
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    guardar(vault, 'temas', temas);
    return salida(`Tema "${id}" actualizado.`, `calificar preparar --tema ${id} --respuesta <archivo>`, { id, tema: t });
  }

  if (accion === 'retirar') {
    const id = pos[1];
    if (!id || !temas.temas[id]) uso(`No existe el tema "${id || ''}". Lista los temas con: okt estudio tema listar`);
    temas.temas[id].retirado = true;
    guardar(vault, 'temas', temas);
    return salida(`Tema "${id}" retirado del circuito de repasos.`, 'tema listar', { id, tema: temas.temas[id] });
  }

  if (accion === 'listar') {
    const entradas = Object.entries(temas.temas);
    const lineas = entradas.length
      ? entradas.map(([id, t]) => `- ${id}: ${t.titulo}${t.retirado ? ' [retirado]' : ''}${t.fsrs ? ` (vence ${t.fsrs.vence})` : ' (nuevo)'}`)
      : ['No hay temas registrados.'];
    return salida(lineas.join('\n'), 'plan hoy', { temas: temas.temas });
  }

  uso('Uso: okt estudio tema agregar|editar|retirar|listar');
}

// --- Subcomando: registrar ---

function cmdRegistrar(vault, pos, op) {
  const tipo = pos[0];
  const origen = op.origen || 'cli';
  const extraNota = op.nota !== undefined ? { nota: op.nota } : {};

  if (tipo === 'sesion') {
    if (op.minutos === undefined || !op.actividad) {
      uso('Uso: okt estudio registrar sesion --minutos N --actividad <lectura|clase|banqueo|repaso|remnote|notebooklm|otro> [--tema <id>]');
    }
    const minutos = Number(op.minutos);
    if (!Number.isInteger(minutos) || minutos < 0) uso('Los minutos deben ser un entero mayor o igual que 0.');
    if (op.tema) {
      const temas = leer(vault, 'temas');
      if (!temas.temas[op.tema]) uso(`No existe el tema "${op.tema}". Créalo con: okt estudio tema agregar "<título>"`);
    }
    const ev = agregarEvento(vault, {
      tipo: 'sesion',
      origen,
      minutos,
      actividad: op.actividad,
      ...(op.tema ? { tema: op.tema } : {}),
      ...extraNota,
    });
    return salida(`Sesión registrada (${minutos} min, ${op.actividad}).`, 'resumen', { evento: ev });
  }

  if (tipo === 'examen') {
    const nombre = pos.slice(1).join(' ').trim();
    if (!nombre || op.aciertos === undefined || op.total === undefined) {
      uso('Uso: okt estudio registrar examen "<nombre>" --aciertos A --total N [--por-tema "id:a/n,…"]');
    }
    const aciertos = Number(op.aciertos);
    const total = Number(op.total);
    if (!Number.isInteger(aciertos) || !Number.isInteger(total) || aciertos < 0 || total < 0 || aciertos > total) {
      uso('Aciertos y total deben ser enteros no negativos con aciertos <= total.');
    }

    let porTema;
    if (op['por-tema']) {
      const temas = leer(vault, 'temas');
      porTema = {};
      for (const bruto of String(op['por-tema']).split(',')) {
        const parte = bruto.trim();
        if (!parte) continue;
        const m = /^([^:]+):(\d+)\/(\d+)$/.exec(parte);
        if (!m) uso(`Formato inválido en --por-tema: "${parte}". Usa "id:aciertos/total".`);
        const tid = m[1].trim();
        const a = Number(m[2]);
        const n = Number(m[3]);
        if (!temas.temas[tid]) uso(`No existe el tema "${tid}" en temas.json.`);
        if (a > n) uso(`En "${tid}", los aciertos (${a}) no pueden superar el total (${n}).`);
        porTema[tid] = { aciertos: a, total: n };
        temas.temas[tid].aciertos += a;
        temas.temas[tid].preguntas += n;
      }
      guardar(vault, 'temas', temas);
    }

    const ev = agregarEvento(vault, {
      tipo: 'examen',
      origen,
      nombre,
      aciertos,
      total,
      ...(porTema ? { por_tema: porTema } : {}),
      ...(op.fuente ? { fuente: op.fuente } : {}),
      ...extraNota,
    });
    return salida(`Examen "${nombre}" registrado (${aciertos}/${total}).`, 'resumen', { evento: ev });
  }

  if (tipo === 'error') {
    if (!op.tema) uso('Uso: okt estudio registrar error --tema <id> [--tipo C-XXX-NN] [--pregunta "…"] [--flashcard remnote|pegar|no]');
    const temas = leer(vault, 'temas');
    if (!temas.temas[op.tema]) uso(`No existe el tema "${op.tema}". Créalo con: okt estudio tema agregar "<título>"`);
    const ev = agregarEvento(vault, {
      tipo: 'error',
      origen,
      tema: op.tema,
      ...(op.tipo ? { tipo_error: op.tipo } : {}),
      ...(op.pregunta ? { pregunta: op.pregunta } : {}),
      ...(op.flashcard ? { flashcard: op.flashcard } : {}),
      ...extraNota,
    });
    return salida(`Error registrado en "${op.tema}"${op.tipo ? ` (${op.tipo})` : ''}.`, 'resumen', { evento: ev });
  }

  if (tipo === 'checkin') {
    return marcarBloque(vault, pos[1], pos[2], origen, op.nota);
  }

  uso('Uso: okt estudio registrar sesion|examen|error|checkin');
}

// --- Subcomando: repasos ---

function cmdRepasos(vault, op, hoy) {
  const temas = leer(vault, 'temas');
  const metas = leer(vault, 'metas');
  const perfil = leer(vault, 'perfil');
  const pesos = pesosDeMeta(obtenerMetaGuia(metas, hoy));
  const fsrs = crearFsrs({ retencion: perfil.retencion_deseada });

  const vencidos = [];
  for (const [id, t] of Object.entries(temas.temas)) {
    if (t.retirado || !t.fsrs || t.fsrs.vence > hoy) continue;
    const dias = Math.max(0, diasEntre(t.fsrs.ultimo));
    const r = fsrs.recuperabilidad(t.fsrs, dias);
    const peso = pesos.get(id) ?? 1;
    vencidos.push({ tema: id, titulo: t.titulo, r, vence: t.fsrs.vence, peso });
  }

  const salvables = vencidos
    .filter((x) => x.r >= 0.65)
    .sort((a, b) => b.peso * (1 - b.r) - a.peso * (1 - a.r));
  const olvidados = vencidos
    .filter((x) => x.r < 0.65)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 2);

  let lista = [...salvables, ...olvidados];
  if (op.max !== undefined) {
    const max = Number(op.max);
    if (!Number.isInteger(max) || max < 0) uso('La opción --max debe ser un entero no negativo.');
    lista = lista.slice(0, max);
  }

  const repasos = lista.map(({ tema, titulo, r, vence }) => ({ tema, titulo, r, vence }));
  const texto = repasos.length
    ? repasos.map((x) => `- ${x.tema} (${x.titulo}): R=${Math.round(x.r * 100)}%, vence ${x.vence}`).join('\n')
    : 'No hay repasos vencidos para hoy.';
  const sig = repasos.length ? `calificar preparar --tema ${repasos[0].tema} --respuesta <archivo>` : 'plan hoy';
  return salida(texto, sig, { repasos });
}

// --- Subcomando: calificar ---

function siguienteIdCalificar(dirBase, hoy) {
  const dia = hoy.replace(/-/g, '');
  for (let n = 1; ; n++) {
    const id = `cal-${dia}-${String(n).padStart(4, '0')}`;
    if (!existsSync(join(dirBase, `${id}.json`)) && !existsSync(join(dirBase, id))) return id;
  }
}

function cmdCalificar(vault, pos, op, hoy) {
  const accion = pos[0];
  const dirBase = join(vault, '.cerebro', 'cache', 'estudio', 'calificar');

  if (accion === 'preparar') {
    if (!op.tema || !op.respuesta) {
      uso('Uso: okt estudio calificar preparar --tema <id> --respuesta <archivo> [--confianza 90|70|50|25]');
    }
    const temas = leer(vault, 'temas');
    const t = temas.temas[op.tema];
    if (!t) uso(`No existe el tema "${op.tema}". Lista los temas con: okt estudio tema listar`);
    if (!t.pregunta || !t.canonica || !Array.isArray(t.rubrica) || t.rubrica.length === 0) {
      uso(`El tema "${op.tema}" necesita pregunta, canónica y rúbrica. Edítalo con: okt estudio tema editar ${op.tema} --pregunta "…" --canonica "…" --rubrica "a|b|c"`);
    }

    let confianza = null;
    if (op.confianza !== undefined) {
      const c = Number(op.confianza);
      if (!CONFIANZAS.has(c)) uso('La confianza debe ser 90, 70, 50 o 25.');
      confianza = c;
    }

    const rutaResp = resolve(process.cwd(), op.respuesta);
    if (!existsSync(rutaResp)) uso(`No se encuentra el archivo de respuesta: ${op.respuesta}`);
    const respuesta = readFileSync(rutaResp, 'utf8');

    mkdirSync(dirBase, { recursive: true });
    const id = siguienteIdCalificar(dirBase, hoy);
    const carpeta = join(dirBase, id);
    mkdirSync(carpeta, { recursive: true });
    const rutaPaquete = join(carpeta, 'paquete.json');

    const paquete = {
      version: 1,
      id,
      concepto: t.titulo,
      pregunta: t.pregunta,
      canonica: t.canonica,
      rubrica: t.rubrica,
      respuesta,
    };
    const errs = validar('paquete', paquete);
    if (errs.length) fallo(`Paquete inválido: ${errs.join('; ')}`);

    sobrescribir(rutaPaquete, `${JSON.stringify(paquete, null, 2)}\n`);
    sobrescribir(join(dirBase, `${id}.json`), `${JSON.stringify({ tema: op.tema, confianza, preparado: hoy }, null, 2)}\n`);

    return salida(
      `Paquete ${id} preparado para "${op.tema}" en ${rutaPaquete}.`,
      `calificar aplicar ${id} --recibo <archivo>`,
      { id, paquete: resolve(rutaPaquete), carpeta: resolve(carpeta) },
    );
  }

  if (accion === 'aplicar') {
    const id = pos[1];
    if (!id || !op.recibo) uso('Uso: okt estudio calificar aplicar <id> --recibo <archivo>');

    const rutaMeta = join(dirBase, `${id}.json`);
    if (!existsSync(rutaMeta)) uso(`No existe el paquete preparado "${id}". Prepáralo con: okt estudio calificar preparar --tema <id> --respuesta <archivo>`);
    const meta = JSON.parse(readFileSync(rutaMeta, 'utf8'));

    const rutaRecibo = resolve(process.cwd(), op.recibo);
    if (!existsSync(rutaRecibo)) uso(`No se encuentra el archivo de recibo: ${op.recibo}`);
    let recibo;
    try {
      recibo = JSON.parse(readFileSync(rutaRecibo, 'utf8'));
    } catch {
      fallo(`El recibo "${op.recibo}" no es un JSON válido.`);
    }

    const errs = validar('recibo', recibo);
    if (errs.length) fallo(`Recibo inválido: ${errs.join('; ')}`);
    if (recibo.paquete !== id) {
      uso(`El recibo pertenece al paquete "${recibo.paquete}", no a "${id}". Usa el recibo correcto.`);
    }

    const eventos = leer(vault, 'eventos');
    if (eventos.some((e) => e.tipo === 'repaso' && e.paquete === id)) {
      return salida(`El paquete ${id} ya estaba aplicado; no se hicieron cambios.`, 'plan hoy', { ya_aplicado: true });
    }

    let calificacion = recibo.calificacion;
    let bajado = false;
    if (calificacion === 'recordado' && Array.isArray(recibo.errores) && recibo.errores.length > 0) {
      calificacion = 'parcial';
      bajado = true;
    }
    const reciboFinal = bajado ? { ...recibo, calificacion } : recibo;

    const nota =
      calificacion === 'recordado'
        ? (meta.confianza !== null && meta.confianza >= 70 ? 4 : 3)
        : calificacion === 'parcial'
          ? 2
          : 1;

    const temas = leer(vault, 'temas');
    const t = temas.temas[meta.tema];
    if (!t) uso(`No existe el tema "${meta.tema}" en temas.json.`);

    const perfil = leer(vault, 'perfil');
    const reintento = t.fsrs !== null && t.fsrs.ultimo === hoy;
    let vence;

    if (reintento) {
      vence = t.fsrs.vence;
    } else {
      const fsrs = crearFsrs({ retencion: perfil.retencion_deseada });
      const dias = t.fsrs === null ? 0 : Math.max(0, diasEntre(t.fsrs.ultimo));
      const res = fsrs.repasar(t.fsrs, nota, dias);
      vence = sumarDias(hoy, res.intervalo);
      t.fsrs = {
        estabilidad: res.estabilidad,
        dificultad: res.dificultad,
        repasos: res.repasos,
        lapsos: res.lapsos,
        ultimo: hoy,
        vence,
      };
      guardar(vault, 'temas', temas);
    }

    agregarEvento(vault, {
      tipo: 'repaso',
      origen: op.origen || 'cli',
      tema: meta.tema,
      paquete: id,
      confianza: meta.confianza,
      recibo: reciboFinal,
      reintento,
    });

    const avisos = [];
    if (bajado) avisos.push('Calificación bajada de recordado a parcial por errores en el recibo.');
    if (reintento) avisos.push('Reintento del mismo día: registrado sin modificar FSRS.');
    avisos.push(`Tema "${meta.tema}": ${calificacion} (nota ${nota}), próximo repaso ${vence}.`);

    return salida(avisos.join('\n'), 'repasos', {
      tema: meta.tema,
      calificacion,
      nota,
      vence,
      reintento,
    });
  }

  uso('Uso: okt estudio calificar preparar --tema <id> --respuesta <archivo> [--confianza 90|70|50|25] | calificar aplicar <id> --recibo <archivo>');
}

// --- Subcomando: plan y checkin ---

function generarYGuardarPlan(vault, hoy) {
  const metas = leer(vault, 'metas');
  const metaGuia = obtenerMetaGuia(metas, hoy);
  if (!metaGuia) {
    fallo('No hay ninguna meta activa. Agrega una primero con: okt estudio meta agregar "<título>" --tipo examen --fecha AAAA-MM-DD');
  }
  const perfil = leer(vault, 'perfil');
  const temas = leer(vault, 'temas');
  const eventos = leer(vault, 'eventos');
  const planAnterior = leer(vault, 'plan');
  const fsrs = crearFsrs({ retencion: perfil.retencion_deseada });

  const plan = generarPlan({
    metas,
    perfil,
    temas,
    eventos,
    planAnterior,
    hoy,
    generado: instante(),
    fsrs,
  });
  return guardar(vault, 'plan', plan);
}

function marcarBloque(vault, bloqueId, estado, origen = 'cli', nota) {
  if (!bloqueId || !ESTADOS_BLOQUE.has(estado)) {
    uso('Uso: okt estudio plan marcar <bloque> hecho|saltado');
  }
  const plan = leer(vault, 'plan');
  if (!plan) fallo('No hay un plan generado. Genera uno con: okt estudio plan generar');

  let bloque = null;
  for (const dia of plan.dias || []) {
    bloque = (dia.bloques || []).find((b) => b.id === bloqueId);
    if (bloque) break;
  }
  if (!bloque) uso(`No existe el bloque "${bloqueId}". Consulta los bloques de hoy con: okt estudio plan hoy`);

  bloque.estado = estado;
  guardar(vault, 'plan', plan);

  const ev = agregarEvento(vault, {
    tipo: 'checkin',
    origen,
    bloque: bloque.id,
    estado,
    herramienta: bloque.herramienta,
    ...(bloque.tema ? { tema: bloque.tema } : {}),
    minutos: bloque.minutos,
    ...(nota !== undefined ? { nota } : {}),
  });

  return salida(`Bloque ${bloque.id} marcado como ${estado}.`, 'plan hoy', { bloque, evento: ev });
}

function cmdPlan(vault, pos, op, hoy) {
  const accion = pos[0];

  if (accion === 'generar') {
    const plan = generarYGuardarPlan(vault, hoy);
    const bloquesHoy = plan.dias.find((d) => d.fecha === hoy)?.bloques || [];
    const lineas = [`Plan generado para la meta "${plan.meta}" (${bloquesHoy.length} bloques hoy).`];
    if (plan.aviso) lineas.push(plan.aviso);
    return salida(lineas.join('\n'), 'plan hoy', { plan });
  }

  if (accion === 'hoy') {
    let plan = leer(vault, 'plan');
    if (!plan || !plan.generado || plan.generado.slice(0, 10) !== hoy) {
      plan = generarYGuardarPlan(vault, hoy);
    }
    const dia = plan.dias.find((d) => d.fecha === hoy);
    const bloques = dia?.bloques || [];
    const lineas = bloques.length
      ? bloques.map((b) => `[${b.id}] ${b.accion} (${b.minutos} min) ${b.estado}`)
      : ['No hay bloques programados para hoy.'];
    if (plan.aviso) lineas.push(plan.aviso);
    const pendiente = bloques.find((b) => b.estado === 'pendiente');
    const sig = pendiente ? `plan marcar ${pendiente.id} hecho` : 'resumen';
    return salida(lineas.join('\n'), sig, { fecha: hoy, bloques, aviso: plan.aviso || null });
  }

  if (accion === 'marcar') {
    return marcarBloque(vault, pos[1], pos[2], op.origen || 'cli', op.nota);
  }

  uso('Uso: okt estudio plan generar|hoy|marcar <bloque> hecho|saltado');
}

// --- Subcomando: resumen ---

function cmdResumen(vault, hoy) {
  const metas = leer(vault, 'metas');
  const temas = leer(vault, 'temas');
  const plan = leer(vault, 'plan');
  const eventos = leer(vault, 'eventos');

  const metaGuia = obtenerMetaGuia(metas, hoy);
  const meta = metaGuia
    ? {
        id: metaGuia.id,
        titulo: metaGuia.titulo,
        ...(metaGuia.tipo === 'examen' ? { dias_restantes: diasEntre(hoy, fechaLocal(metaGuia.fecha)) } : {}),
      }
    : null;

  const hace6 = sumarDias(hoy, -6);
  const bloques7d = (plan?.dias || [])
    .filter((d) => d.fecha >= hace6 && d.fecha <= hoy)
    .flatMap((d) => d.bloques || []);
  const planeados = bloques7d.length;
  const hechos = bloques7d.filter((b) => b.estado === 'hecho').length;
  const cumplimiento_7d = {
    hechos,
    planeados,
    tasa: planeados > 0 ? Math.round((hechos / planeados) * 100) / 100 : 0,
  };

  const minutos_7d = eventos
    .filter((e) => e.tipo === 'sesion' && e.ts.slice(0, 10) >= hace6 && e.ts.slice(0, 10) <= hoy)
    .reduce((acc, e) => acc + e.minutos, 0);

  const activos = Object.entries(temas.temas).filter(([, t]) => !t.retirado);
  const vistos = activos.filter(([, t]) => t.fsrs !== null).length;
  const vencidos = activos.filter(([, t]) => t.fsrs !== null && t.fsrs.vence <= hoy).length;
  const resumenTemas = { total: activos.length, vistos, nuevos: activos.length - vistos };

  const aciertos_por_tema = Object.entries(temas.temas)
    .filter(([, t]) => t.preguntas > 0)
    .map(([id, t]) => ({
      tema: id,
      aciertos: t.aciertos,
      preguntas: t.preguntas,
      tasa: Math.round((t.aciertos / t.preguntas) * 100) / 100,
    }));

  const errores_por_tipo = {};
  for (const e of eventos) {
    if (e.tipo === 'error' && e.tipo_error) {
      errores_por_tipo[e.tipo_error] = (errores_por_tipo[e.tipo_error] || 0) + 1;
    }
  }

  const calibracion = {
    '90': { n: 0, recordados: 0 },
    '70': { n: 0, recordados: 0 },
    '50': { n: 0, recordados: 0 },
    '25': { n: 0, recordados: 0 },
  };
  for (const e of eventos) {
    if (e.tipo === 'repaso' && !e.reintento && e.confianza !== null && calibracion[String(e.confianza)]) {
      const c = calibracion[String(e.confianza)];
      c.n += 1;
      if (e.recibo?.calificacion === 'recordado') c.recordados += 1;
    }
  }

  const lineas = [
    meta
      ? `Meta guía: ${meta.titulo}${meta.dias_restantes !== undefined ? ` (faltan ${meta.dias_restantes} días)` : ''}`
      : 'Meta guía: ninguna activa',
    `Cumplimiento 7d: ${hechos}/${planeados} bloques (${Math.round(cumplimiento_7d.tasa * 100)}%)`,
    `Tiempo 7d: ${minutos_7d} min`,
    `Temas: ${resumenTemas.total} activos (${vistos} vistos, ${resumenTemas.nuevos} nuevos, ${vencidos} vencidos)`,
    `Aciertos: ${aciertos_por_tema.length ? aciertos_por_tema.map((a) => `${a.tema} ${a.aciertos}/${a.preguntas}`).join(', ') : 'sin registros'}`,
    `Errores por tipo: ${Object.keys(errores_por_tipo).length ? Object.entries(errores_por_tipo).map(([k, v]) => `${k}:${v}`).join(', ') : 'ninguno'}`,
    `Calibración: ${Object.entries(calibracion).map(([k, v]) => `${k}% ${v.recordados}/${v.n}`).join(' | ')}`,
  ];

  const datos = {
    meta,
    cumplimiento_7d,
    minutos_7d,
    vencidos,
    temas: resumenTemas,
    aciertos_por_tema,
    errores_por_tipo,
    calibracion,
  };

  return salida(lineas.join('\n'), 'plan hoy', datos);
}

// --- Entrada principal ---

export function estudio(vault, pos = [], op = {}) {
  const hoy = fechaISO();
  const [sub, ...resto] = pos;

  if (sub === 'meta') return cmdMeta(vault, resto, op, hoy);
  if (sub === 'perfil') return cmdPerfil(vault, op, hoy);
  if (sub === 'tema') return cmdTema(vault, resto, op);
  if (sub === 'registrar') return cmdRegistrar(vault, resto, op);
  if (sub === 'repasos') return cmdRepasos(vault, op, hoy);
  if (sub === 'calificar') return cmdCalificar(vault, resto, op, hoy);
  if (sub === 'plan') return cmdPlan(vault, resto, op, hoy);
  if (sub === 'resumen') return cmdResumen(vault, hoy);

  uso('Uso: okt estudio meta|perfil|tema|registrar|repasos|calificar|plan|resumen (consulta okt --help)');
}
