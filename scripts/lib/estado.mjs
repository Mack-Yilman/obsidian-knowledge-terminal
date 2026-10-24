// okt estado: lo que la skill cerebro necesita para decir «dónde estás y qué sigue».
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { listarNotas, leerNota, esSistema, esArchivado } from './vault.mjs';
import { leerBloque } from './bloques.mjs';
import { leerConfigVault } from './rutas.mjs';
import { C, R, necesitaMigrar, AVISO_MIGRAR } from './estructura.mjs';
import { pendientesAbiertos } from './sistema.mjs';

export function lineasDeBloque(vault, rel) {
  const ruta = join(vault, rel);
  if (!existsSync(ruta)) return [];
  return (leerBloque(readFileSync(ruta, 'utf8')) || '').split('\n').filter((l) => l.startsWith('- '));
}

// Lo deja okt telegram bajar en .cerebro/telegram.json: la fecha de la última bajada con novedades.
function estadoTelegram(vault) {
  try {
    const { ultima } = JSON.parse(readFileSync(join(vault, '.cerebro', 'telegram.json'), 'utf8'));
    return { ultima };
  } catch {
    return null;
  }
}

export function estado(vault) {
  const notas = listarNotas(vault).filter((r) => !esSistema(r));
  const porCarpeta = {};
  for (const rel of notas) {
    const top = rel.includes('/') ? rel.split('/')[0] : '(raíz)';
    porCarpeta[top] = (porCarpeta[top] || 0) + 1;
  }
  const bandeja = notas.filter((r) => r.startsWith(`${C.bandeja}/`));
  const principal = (raiz) => notas.filter((r) => dirname(dirname(r)) === raiz && basename(dirname(r)) === basename(r, '.md')).map((r) => basename(r, '.md'));
  const areas = principal(C.areas);
  const proyectos = principal(C.proyectos).filter((p) => (leerNota(vault, `${C.proyectos}/${p}/${p}.md`).datos.estado || 'activo') === 'activo');
  const borradores = notas.filter((r) => !esArchivado(r) && !r.startsWith(`${C.bandeja}/`) && leerNota(vault, r).datos.estado === 'borrador').length;
  const pendientes = pendientesAbiertos(vault);
  const bitacora = lineasDeBloque(vault, R.bitacora).slice(0, 5);
  const cfg = leerConfigVault(vault);
  const telegram = estadoTelegram(vault);
  const migrar = necesitaMigrar(vault);

  const datos = { vault, porCarpeta, areas, proyectos, bandeja: bandeja.length, borradores, pendientes, bitacora, telegram, migrar, config: cfg };
  const texto = [
    ...(migrar ? [`AVISO: ${AVISO_MIGRAR}`] : []),
    `Vault: ${vault}`,
    `Áreas (${areas.length}): ${areas.join(', ') || 'ninguna'}`,
    `Proyectos activos (${proyectos.length}): ${proyectos.join(', ') || 'ninguno'}`,
    `Notas: ${notas.length} (${Object.entries(porCarpeta).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ninguna'})`,
    `Bandeja sin procesar: ${bandeja.length}`,
    `Notas en borrador (sin revisar): ${borradores}`,
    ...(telegram?.ultima ? [`Telegram: última bajada con novedades ${telegram.ultima}.`] : []),
    `Pendientes abiertos: ${pendientes.length}`,
    ...pendientes.slice(0, 5).map((p) => `  ${p.linea}${p.para === 'usuario' ? ' (para ti)' : ''}`),
    'Última actividad:',
    ...(bitacora.length ? bitacora.map((l) => `  ${l}`) : ['  (ninguna)']),
  ].join('\n');
  return { texto, datos };
}
