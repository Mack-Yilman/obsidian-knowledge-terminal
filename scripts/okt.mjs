#!/usr/bin/env node
// okt: CLI de obsidian-knowledge-terminal. Hace todo lo mecánico del vault sin gastar tokens.
// Uso: node okt.mjs <comando> [argumentos] [--vault <ruta>] [--json]
import { resolve } from 'node:path';
import { resolverVault, buscarVaultArriba, posix } from './lib/rutas.mjs';
import { COMANDOS, AYUDA } from './lib/comandos.mjs';
import { necesitaMigrar, AVISO_MIGRAR } from './lib/estructura.mjs';

// Comandos que escriben en el vault: con la estructura anterior (0.2.x) se detienen hasta migrar, para no dejar
// carpetas nuevas junto a las viejas. telegram se revisa aparte (config no toca el vault).
const ESCRIBEN = new Set(['init', 'nota', 'bitacora', 'pendiente', 'indice', 'hot', 'cerrar', 'sesiones', 'bandeja', 'adjuntar', 'archivar', 'importar', 'notebooklm', 'commit', 'renombrar']);

const BOOLEANOS = new Set(['aplicar', 'json', 'todo', 'ayuda', 'help', 'forzar', 'cerrados', 'seco', 'silencioso', 'nuevo', 'completo']);

export function parsear(argv) {
  const pos = [];
  const op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) op[k] = v;
      else if (BOOLEANOS.has(k) || i + 1 >= argv.length) op[k] = true;
      else op[k] = argv[++i];
    } else pos.push(a);
  }
  return { pos, op };
}

async function main() {
  const { pos, op } = parsear(process.argv.slice(2));
  const nombre = pos.shift();
  if (!nombre || op.ayuda || op.help || nombre === 'ayuda') {
    process.stdout.write(AYUDA);
    return 0;
  }
  const cmd = COMANDOS[nombre];
  if (!cmd) {
    process.stderr.write(`Comando desconocido: ${nombre}. Ejecuta «okt ayuda».\n`);
    return 2;
  }
  let vault = null;
  if (cmd.vault !== false) {
    // init crea en la carpeta actual (o en la del vault que la contiene); nunca usa la config global.
    vault = cmd.vault === 'crear' ? (op.vault ? resolve(op.vault) : buscarVaultArriba() || process.cwd()) : resolverVault(op.vault);
    if (!vault && cmd.vault !== 'opcional') {
      process.stderr.write('No encontré un vault de OKT aquí ni en la configuración. Abre tu agente en la carpeta de tus notas y ejecuta «okt init».\n');
      return 1;
    }
  }
  if (vault && (ESCRIBEN.has(nombre) || (nombre === 'telegram' && pos[0] === 'bajar')) && necesitaMigrar(vault)) {
    process.stderr.write(`${AVISO_MIGRAR}\n`);
    return 2;
  }
  try {
    const r = await cmd.correr({ pos, op, vault, posix });
    if (r === undefined) return 0;
    if (typeof r === 'number') return r;
    if (op.json) process.stdout.write(`${JSON.stringify(r.datos ?? r, null, 2)}\n`);
    else if (r.texto) process.stdout.write(`${r.texto.replace(/\n?$/, '\n')}`);
    return r.codigo ?? 0;
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return e.codigo ?? 1;
  }
}

main().then((c) => {
  process.exitCode = c;
});
