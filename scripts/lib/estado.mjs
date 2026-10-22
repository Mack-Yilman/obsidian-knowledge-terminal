// okt estado: lo que la skill cerebro necesita para decir «dónde estás y qué sigue».
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listarNotas, leerNota } from './vault.mjs';
import { leerBloque } from './bloques.mjs';
import { leerConfigVault } from './rutas.mjs';
import { C, R, necesitaMigrar, AVISO_MIGRAR } from './estructura.mjs';

export function lineasDeBloque(vault, rel) {
  const ruta = join(vault, rel);
  if (!existsSync(ruta)) return [];
  return (leerBloque(readFileSync(ruta, 'utf8')) || '').split('\n').filter((l) => l.startsWith('- '));
}

// Lo deja okt telegram bajar en .cerebro/telegram.json: fecha de la última bajada y elementos retenidos.
function estadoTelegram(vault) {
  try {
    const { ultima, retenidos = [] } = JSON.parse(readFileSync(join(vault, '.cerebro', 'telegram.json'), 'utf8'));
    return { ultima, retenidos };
  } catch {
    return null;
  }
}

export function estado(vault) {
  const notas = listarNotas(vault);
  const porCarpeta = {};
  for (const rel of notas) {
    const top = rel.includes('/') ? rel.split('/')[0] : '(raíz)';
    porCarpeta[top] = (porCarpeta[top] || 0) + 1;
  }
  const bandeja = notas.filter((r) => r.startsWith(`${C.bandeja}/`));
  const borradores = notas.filter((r) => r.startsWith(`${C.conocimiento}/`) && leerNota(vault, r).datos.estado === 'borrador').length;
  const pendientes = lineasDeBloque(vault, R.pendientes).filter((l) => l.startsWith('- [ ]'));
  const bitacora = lineasDeBloque(vault, R.bitacora).slice(0, 5);
  const cfg = leerConfigVault(vault);
  const telegram = estadoTelegram(vault);
  const migrar = necesitaMigrar(vault);

  const datos = { vault, porCarpeta, bandeja: bandeja.length, borradores, pendientes, bitacora, telegram, migrar, config: cfg };
  const lineasTelegram = telegram?.retenidos?.length
    ? [`Telegram: ${telegram.retenidos.length} retenidos por parecer datos de pacientes (${telegram.retenidos.map((r) => r.id).join(', ')}). Decide: okt telegram descartar <id> o, si no lo son, okt telegram bajar --forzar <id>.`]
    : telegram?.ultima ? [`Telegram: última bajada con novedades ${telegram.ultima}, sin retenidos.`] : [];
  const texto = [
    ...(migrar ? [`AVISO: ${AVISO_MIGRAR}`] : []),
    `Vault: ${vault}`,
    `Notas: ${notas.length} (${Object.entries(porCarpeta).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ninguna'})`,
    `Bandeja sin procesar: ${bandeja.length}`,
    `Conocimiento en borrador: ${borradores}`,
    ...lineasTelegram,
    `Pendientes abiertos: ${pendientes.length}`,
    ...pendientes.slice(0, 5).map((l) => `  ${l}`),
    'Última actividad:',
    ...(bitacora.length ? bitacora.map((l) => `  ${l}`) : ['  (ninguna)']),
  ].join('\n');
  return { texto, datos };
}
