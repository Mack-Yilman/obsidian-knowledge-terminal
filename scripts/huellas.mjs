// Calcula y verifica las huellas SHA-256 de los archivos del plugin.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { posix, sobrescribir } from './lib/rutas.mjs';

const CARPETAS = ['scripts', 'skills', 'references', 'plantillas'];

function listarArchivos(dir) {
  const res = [];
  if (!existsSync(dir)) return res;
  const entradas = readdirSync(dir, { withFileTypes: true });
  for (const e of entradas) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      res.push(...listarArchivos(ruta));
    } else if (e.isFile()) {
      res.push(ruta);
    }
  }
  return res;
}

export function calcularHuellas(raiz) {
  let version = null;
  const pkgPath = join(raiz, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      version = JSON.parse(readFileSync(pkgPath, 'utf8')).version || null;
    } catch {}
  }

  const archivos = {};
  for (const carpeta of CARPETAS) {
    const dir = join(raiz, carpeta);
    const lista = listarArchivos(dir);
    for (const ruta of lista) {
      const rel = posix(relative(raiz, ruta));
      if (rel === 'scripts/huellas.json') continue;
      const buf = readFileSync(ruta);
      const esTexto = !buf.includes(0);
      const hash = createHash('sha256');
      if (esTexto) {
        hash.update(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
      } else {
        hash.update(buf);
      }
      archivos[rel] = hash.digest('hex');
    }
  }

  const ordenado = {};
  for (const k of Object.keys(archivos).sort()) {
    ordenado[k] = archivos[k];
  }
  return { version, archivos: ordenado };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const raiz = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
  const resultado = calcularHuellas(raiz);
  const destino = join(raiz, 'scripts', 'huellas.json');
  sobrescribir(destino, `${JSON.stringify(resultado, null, 2)}\n`);
}
