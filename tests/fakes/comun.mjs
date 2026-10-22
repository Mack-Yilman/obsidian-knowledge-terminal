// Base de los fakes: datos desde OKT_FAKE_DATOS (JSON) y registro de llamadas en OKT_FAKE_LOG.
import { readFileSync, appendFileSync } from 'node:fs';

export const datos = () => JSON.parse(readFileSync(process.env.OKT_FAKE_DATOS, 'utf8'));

export function registrar(cli, args) {
  if (process.env.OKT_FAKE_LOG) appendFileSync(process.env.OKT_FAKE_LOG, `${JSON.stringify({ cli, args, cwd: process.cwd() })}\n`);
}

export function fallar(mensaje, codigo = 1) {
  process.stderr.write(`${mensaje}\n`);
  process.exit(codigo);
}

export const opcion = (args, nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
