// okt estado: lo que la skill cerebro necesita para decir «dónde estás y qué sigue».
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { listarNotas, leerNota } from './vault.mjs';
import { leerBloque } from './bloques.mjs';
import { leerConfigVault } from './rutas.mjs';

export function lineasDeBloque(vault, rel) {
  const ruta = join(vault, rel);
  if (!existsSync(ruta)) return [];
  return (leerBloque(readFileSync(ruta, 'utf8')) || '').split('\n').filter((l) => l.startsWith('- '));
}

export function estado(vault) {
  const notas = listarNotas(vault);
  const porCarpeta = {};
  for (const rel of notas) {
    const top = rel.includes('/') ? rel.split('/')[0] : '(raíz)';
    porCarpeta[top] = (porCarpeta[top] || 0) + 1;
  }
  const bandeja = notas.filter((r) => r.startsWith('00-Bandeja/'));
  const borradores = notas.filter((r) => r.startsWith('30-Conocimiento/') && leerNota(vault, r).datos.estado === 'borrador').length;
  const pendientes = lineasDeBloque(vault, '99-Sistema/pendientes.md').filter((l) => l.startsWith('- [ ]'));
  const bitacora = lineasDeBloque(vault, '99-Sistema/bitacora.md').slice(0, 5);
  const cfg = leerConfigVault(vault);

  const datos = { vault, porCarpeta, bandeja: bandeja.length, borradores, pendientes, bitacora, config: cfg };
  const texto = [
    `Vault: ${vault}`,
    `Notas: ${notas.length} (${Object.entries(porCarpeta).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ninguna'})`,
    `Bandeja sin procesar: ${bandeja.length}`,
    `Conocimiento en borrador: ${borradores}`,
    `Pendientes abiertos: ${pendientes.length}`,
    ...pendientes.slice(0, 5).map((l) => `  ${l}`),
    'Última actividad:',
    ...(bitacora.length ? bitacora.map((l) => `  ${l}`) : ['  (ninguna)']),
  ].join('\n');
  return { texto, datos };
}
