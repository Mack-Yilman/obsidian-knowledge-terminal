// Registro de mejoras: errores del plugin, scripts improvisados e ideas.
// Vive en .cerebro/mejoras.jsonl y se refleja en R.mejoras (05 │ ⚙️ Sistema/🛠️ Mejoras OKT.md).
import { existsSync, readFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, extname, basename, resolve, isAbsolute } from 'node:path';
import { R } from './estructura.mjs';
import { esVault, sobrescribir } from './rutas.mjs';
import { reemplazarBloque } from './bloques.mjs';
import { leerFrontmatter, escribirFrontmatter } from './frontmatter.mjs';
import { fechaISO } from './fechas.mjs';

const TIPOS_VALIDOS = new Set(['error', 'script', 'idea']);
const PARRAFO_SISTEMA = 'Lo escribe OKT: errores del plugin y scripts que un agente improvisó. Para llevarlos al plugin: okt mejoras exportar.';

function rutaJsonl(vault) {
  return join(vault, '.cerebro', 'mejoras.jsonl');
}

function recortar(texto, max) {
  const t = String(texto || '').trim().replace(/[\r\n]+/g, ' ');
  return t.length > max ? t.slice(0, max) : t;
}

export function calcularHuella(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[A-Za-z]:[\\/]\S+/g, '')
    .replace(/\/\S+\/\S+/g, '')
    .replace(/«[^»]*»/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leerEntradas(vault) {
  const ruta = rutaJsonl(vault);
  if (!existsSync(ruta)) return [];
  const lineas = readFileSync(ruta, 'utf8').split(/\r?\n/);
  const entradas = [];
  for (const l of lineas) {
    const t = l.trim();
    if (!t) continue;
    try {
      entradas.push(JSON.parse(t));
    } catch {
      // Ignora líneas dañadas sin fallar
    }
  }
  return entradas;
}

function guardarEntradas(vault, entradas) {
  const ruta = rutaJsonl(vault);
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  const contenido = entradas.length ? `${entradas.map((e) => JSON.stringify(e)).join('\n')}\n` : '';
  sobrescribir(ruta, contenido);
}

function construirBloqueNota(entradas) {
  const abiertas = entradas.filter((e) => e.estado === 'abierta');
  const cerradas = entradas.filter((e) => e.estado === 'cerrada');
  const ultimasCerradas = cerradas.slice(-10).reverse();

  let contenido = '';

  if (abiertas.length) {
    const filas = abiertas.map((e) => {
      const txt = recortar(e.texto, 120);
      const celda = e.script ? `${txt} \`${e.script}\`` : txt;
      return `| ${e.n} | ${e.fecha} | ${e.tipo} | ${e.veces || 1} | ${e.skill || '-'} | ${celda.replace(/\|/g, '\\|')} |`;
    });
    contenido += ['| # | Fecha | Tipo | Veces | Skill | Texto |', '|---|---|---|---|---|---|', ...filas].join('\n');
  } else {
    contenido += 'No hay mejoras abiertas.';
  }

  if (ultimasCerradas.length) {
    const filasCerradas = ultimasCerradas.map((e) => {
      const sol = e.solucion ? ` — ${e.solucion}` : '';
      return `- #${e.n} (${e.cerrada || e.fecha}) · ${e.tipo} · ${recortar(e.texto, 120)}${sol}`;
    });
    contenido += `\n\n### Últimas cerradas\n\n${filasCerradas.join('\n')}`;
  }

  return contenido;
}

export function regenerarNota(vault, entradas) {
  const rutaNota = join(vault, R.mejoras);
  mkdirSync(join(vault, R.mejoras, '..'), { recursive: true });
  const hoy = fechaISO();
  const contenidoBloque = construirBloqueNota(entradas);

  if (!existsSync(rutaNota)) {
    const cuerpoInicial = `# 🛠️ Mejoras OKT\n\n${PARRAFO_SISTEMA}\n`;
    const conBloque = reemplazarBloque(cuerpoInicial, contenidoBloque);
    const textoCompleto = escribirFrontmatter({ tipo: 'sistema', creado: hoy, actualizado: hoy }, `\n${conBloque}`);
    sobrescribir(rutaNota, textoCompleto);
    return;
  }

  const textoPrevio = readFileSync(rutaNota, 'utf8');
  const { datos, cuerpo } = leerFrontmatter(textoPrevio);
  const nuevoCuerpo = reemplazarBloque(cuerpo, contenidoBloque);
  const textoActualizado = escribirFrontmatter(
    { ...datos, tipo: 'sistema', creado: datos.creado || hoy, actualizado: hoy },
    nuevoCuerpo.startsWith('\n') ? nuevoCuerpo : `\n${nuevoCuerpo}`
  );
  sobrescribir(rutaNota, textoActualizado);
}

export function registrar(vault, { tipo, texto, skill = null, comando = null, archivo = null } = {}) {
  if (!tipo || !TIPOS_VALIDOS.has(tipo)) {
    throw Object.assign(new Error(`Tipo «${tipo}» inválido: usa error, script o idea.`), { codigo: 2 });
  }
  const limpio = recortar(texto, 500);
  if (!limpio) {
    throw Object.assign(new Error('El texto es obligatorio (máx. 500 caracteres).'), { codigo: 2 });
  }

  let rutaRelativaScript = null;
  if (tipo === 'script') {
    if (!archivo) {
      throw Object.assign(new Error('El tipo script exige indicar la ruta del archivo.'), { codigo: 2 });
    }
    const abs = isAbsolute(archivo)
      ? archivo
      : existsSync(archivo)
      ? resolve(archivo)
      : resolve(vault, archivo);

    if (!existsSync(abs)) {
      throw Object.assign(new Error(`El archivo «${archivo}» no existe.`), { codigo: 2 });
    }
    const st = statSync(abs);
    if (st.size > 200 * 1024) {
      throw Object.assign(new Error(`El archivo supera el máximo de 200 KB (${Math.round(st.size / 1024)} KB).`), { codigo: 2 });
    }

    const dirImprovisados = join(vault, '.cerebro', 'improvisados');
    mkdirSync(dirImprovisados, { recursive: true });
    const hoy = fechaISO();
    const nombreOriginal = basename(archivo);
    const ext = extname(nombreOriginal);
    const base = ext ? nombreOriginal.slice(0, -ext.length) : nombreOriginal;

    let destNombre = `${hoy}-${nombreOriginal}`;
    let contador = 2;
    while (existsSync(join(dirImprovisados, destNombre))) {
      destNombre = ext ? `${hoy}-${base}-${contador}${ext}` : `${hoy}-${base}-${contador}`;
      contador++;
    }
    copyFileSync(abs, join(dirImprovisados, destNombre));
    rutaRelativaScript = `.cerebro/improvisados/${destNombre}`;
  }

  const hoy = fechaISO();
  const huella = calcularHuella(limpio);
  const entradas = leerEntradas(vault);

  let entrada = null;
  let nueva = false;

  if (tipo === 'error') {
    entrada = entradas.find((e) => e.estado === 'abierta' && e.tipo === 'error' && e.huella === huella);
  }

  if (entrada) {
    entrada.veces = (entrada.veces || 1) + 1;
    entrada.ultima = hoy;
    if (skill && !entrada.skill) entrada.skill = skill;
    if (comando && !entrada.comando) entrada.comando = comando;
    nueva = false;
  } else {
    const maxN = entradas.reduce((max, e) => Math.max(max, e.n || 0), 0);
    entrada = {
      n: maxN + 1,
      tipo,
      texto: limpio,
      skill: skill || null,
      comando: comando || null,
      huella,
      veces: 1,
      fecha: hoy,
      ultima: hoy,
      estado: 'abierta',
      ...(rutaRelativaScript ? { script: rutaRelativaScript } : {}),
    };
    entradas.push(entrada);
    nueva = true;
  }

  guardarEntradas(vault, entradas);
  regenerarNota(vault, entradas);

  const mensajeTexto = nueva
    ? `Registrado ${tipo} #${entrada.n}: ${entrada.texto}`
    : `Error repetido (#${entrada.n}, ${entrada.veces} veces): ${entrada.texto}`;

  return { texto: mensajeTexto, datos: { entrada, nueva } };
}

export function registrarFalloCli(vault, { comando, mensaje } = {}) {
  try {
    if (!vault || !esVault(vault)) return null;
    const cmd = String(comando || '').trim();
    const cmdFinal = cmd.startsWith('okt ') ? cmd : `okt ${cmd}`;
    return registrar(vault, {
      tipo: 'error',
      texto: mensaje,
      skill: null,
      comando: cmdFinal,
    });
  } catch {
    return null;
  }
}

export function listar(vault, { todas = false } = {}) {
  const entradas = leerEntradas(vault);
  const lista = todas ? entradas : entradas.filter((e) => e.estado === 'abierta');

  if (!lista.length) {
    const vacio = todas ? 'No hay mejoras registradas.' : 'No hay mejoras abiertas.';
    return { texto: vacio, datos: { mejoras: [] } };
  }

  const filas = lista.map((e) => {
    const txt = recortar(e.texto, 120);
    const celda = e.script ? `${txt} \`${e.script}\`` : txt;
    return `| ${e.n} | ${e.fecha} | ${e.tipo} | ${e.veces || 1} | ${e.skill || '-'} | ${celda.replace(/\|/g, '\\|')} |`;
  });

  const texto = ['| # | Fecha | Tipo | Veces | Skill | Texto |', '|---|---|---|---|---|---|', ...filas].join('\n');
  return { texto, datos: { mejoras: lista } };
}

export function cerrar(vault, n, solucion = '') {
  const id = Number(n);
  const entradas = leerEntradas(vault);
  const entrada = entradas.find((e) => e.n === id);

  if (!entrada) {
    throw Object.assign(new Error(`No existe la mejora #${n}.`), { codigo: 2 });
  }

  entrada.estado = 'cerrada';
  entrada.cerrada = fechaISO();
  if (solucion) entrada.solucion = String(solucion).trim();

  guardarEntradas(vault, entradas);
  regenerarNota(vault, entradas);

  return { texto: `Mejora #${id} cerrada.`, datos: { entrada } };
}

export function exportar(vault) {
  const entradas = leerEntradas(vault);
  const abiertas = entradas.filter((e) => e.estado === 'abierta');
  const hoy = fechaISO();

  const agrupadas = {
    error: abiertas.filter((e) => e.tipo === 'error'),
    script: abiertas.filter((e) => e.tipo === 'script'),
    idea: abiertas.filter((e) => e.tipo === 'idea'),
  };

  const lineas = [`# 🛠️ Mejoras OKT (exportadas el ${hoy})\n`];

  const secciones = [
    ['Errores', agrupadas.error],
    ['Scripts improvisados', agrupadas.script],
    ['Ideas', agrupadas.idea],
  ];

  for (const [titulo, lista] of secciones) {
    lineas.push(`## ${titulo} (${lista.length})\n`);
    if (!lista.length) {
      lineas.push('_Ninguna abierta._\n');
      continue;
    }
    for (const e of lista) {
      lineas.push(`### #${e.n}: ${e.texto}\n`);
      lineas.push(`- Fecha: ${e.fecha} (última: ${e.ultima}, veces: ${e.veces || 1})`);
      if (e.skill) lineas.push(`- Skill: ${e.skill}`);
      if (e.comando) lineas.push(`- Comando: ${e.comando}`);
      if (e.script) {
        lineas.push(`- Script: \`${e.script}\``);
        const rutaScriptAbs = join(vault, e.script);
        if (existsSync(rutaScriptAbs)) {
          const raw = readFileSync(rutaScriptAbs, 'utf8');
          const scriptLineas = raw.split(/\r?\n/).slice(0, 300).join('\n');
          const ext = extname(e.script).replace(/^\./, '') || 'text';
          lineas.push(`\n\`\`\`${ext}\n${scriptLineas}\n\`\`\``);
        }
      }
      lineas.push('');
    }
  }

  const dirCache = join(vault, '.cerebro', 'cache');
  mkdirSync(dirCache, { recursive: true });
  const rutaRel = `.cerebro/cache/mejoras-${hoy}.md`;
  const rutaAbs = join(vault, rutaRel);
  sobrescribir(rutaAbs, `${lineas.join('\n').trim()}\n`);

  return { texto: `Mejoras exportadas a ${rutaRel}`, datos: { ruta: rutaRel, rutaAbsoluta: rutaAbs } };
}
