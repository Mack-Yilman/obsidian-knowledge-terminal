// Registro de comandos del CLI. Cada comando recibe { pos, op, vault } y devuelve { texto, datos }.
import { planInit, aplicarInit, describirPlan } from './init.mjs';
import { estado } from './estado.mjs';
import { notaNueva } from './notas.mjs';
import { bitacora, pendiente, indice, hot, cerrar } from './sistema.mjs';
import { commit } from './git.mjs';
import { buscar } from './buscar.mjs';
import { lint } from './lint.mjs';
import { hookInicio, hookFin, sesionesAgy } from './sesiones.mjs';
import { preparar, archivar } from './bandeja.mjs';
import { leerConfigVault, guardarConfigVault } from './rutas.mjs';

export const AYUDA = `okt: CLI de obsidian-knowledge-terminal (segundo cerebro en Obsidian)

Configuración
  init [--areas "A,B"] [--aplicar]   Crea el vault en la carpeta actual (sin --aplicar: vista previa)
  doctor                             Qué herramientas y pasos de configuración faltan
  estado                             Resumen del vault: notas, bandeja, pendientes, última actividad

Opciones comunes: --vault <ruta>  --json
`;

export const COMANDOS = {
  init: {
    vault: 'crear',
    correr({ op, vault }) {
      const plan = planInit(vault, { areas: op.areas });
      const aviso = plan.ocupada ? `\nAviso: la carpeta ya tiene archivos y no es un vault de OKT. Se agregará la estructura sin tocar lo existente.\n` : '';
      if (!op.aplicar) {
        return {
          texto: `Vista previa de okt init en ${plan.vault}\nÁreas: ${plan.areas.join(', ')}\n${describirPlan(plan)}${aviso}\nPara crearlo: okt init --aplicar${op.areas ? ` --areas "${op.areas}"` : ''}`,
          datos: plan,
        };
      }
      const r = aplicarInit(plan);
      const git = r.git.error ? `\nGit: no se pudo iniciar (${r.git.error}).` : '';
      return { texto: `Vault listo en ${plan.vault} (${plan.acciones.length} pasos).${aviso}${git}`, datos: { ...plan, ...r } };
    },
  },
  estado: { correr: ({ vault }) => estado(vault) },
  nota: {
    correr({ pos, op, vault }) {
      const accion = pos.shift();
      if (accion !== 'nueva') throw Object.assign(new Error('Uso: okt nota nueva <tipo> "<título>" [opciones]'), { codigo: 2 });
      const [tipo, ...titulo] = pos;
      return notaNueva(vault, tipo, titulo.join(' '), op);
    },
  },
  bitacora: { correr: ({ pos, op, vault }) => bitacora(vault, pos[0], pos.slice(1).join(' '), op.notas) },
  pendiente: { correr: ({ pos, op, vault }) => pendiente(vault, pos.shift(), pos, op) },
  indice: { correr: ({ vault }) => indice(vault) },
  buscar: { correr: ({ pos, op, vault }) => buscar(vault, pos.join(' '), op) },
  lint: { correr: ({ vault }) => lint(vault) },
  hot: { correr: ({ op, vault }) => hot(vault, op) },
  cerrar: { correr: ({ pos, op, vault }) => cerrar(vault, pos[0], pos.slice(1).join(' '), op) },
  hook: {
    vault: false,
    async correr({ pos }) {
      let entrada = '';
      if (!process.stdin.isTTY) for await (const trozo of process.stdin) entrada += trozo;
      const salida = pos[0] === 'inicio' ? hookInicio(entrada) : pos[0] === 'fin' ? hookFin(entrada) : '';
      if (salida) process.stdout.write(salida);
      return 0;
    },
  },
  sesiones: {
    correr({ pos, vault }) {
      if (pos[0] !== 'agy') throw Object.assign(new Error('Uso: okt sesiones agy'), { codigo: 2 });
      return sesionesAgy(vault);
    },
  },
  bandeja: {
    correr({ pos, vault }) {
      const accion = pos.shift();
      if (accion === 'preparar' || !accion) return preparar(vault);
      if (accion === 'archivar') return archivar(vault, pos);
      throw Object.assign(new Error('Uso: okt bandeja preparar|archivar <rutas>'), { codigo: 2 });
    },
  },
  config: {
    correr({ pos, vault }) {
      const [accion, ...resto] = pos;
      const cfg = leerConfigVault(vault);
      if (accion === 'excluir' || accion === 'incluir') {
        const lista = new Set(cfg.excluir_proyectos || []);
        for (const p of resto) accion === 'excluir' ? lista.add(p) : lista.delete(p);
        guardarConfigVault(vault, { excluir_proyectos: [...lista] });
        return { texto: `Proyectos excluidos de las fichas de sesión: ${[...lista].join(', ') || '(ninguno)'}`, datos: [...lista] };
      }
      if (accion === 'poner') {
        const [clave, ...valor] = resto;
        const permitidas = { frescura_dias: Number, delegar: (v) => (v === 'ninguno' ? null : v) };
        if (!permitidas[clave]) throw Object.assign(new Error(`Claves que se pueden cambiar: ${Object.keys(permitidas).join(', ')}`), { codigo: 2 });
        guardarConfigVault(vault, { [clave]: permitidas[clave](valor.join(' ')) });
        return { texto: `${clave} = ${valor.join(' ')}` };
      }
      return { texto: JSON.stringify(cfg, null, 2), datos: cfg };
    },
  },
  commit: {
    correr({ pos, vault }) {
      const r = commit(vault, pos.join(' ') || 'okt: cambios');
      const texto = r.hecho ? 'Commit hecho.' : r.sinCambios ? 'Sin cambios.' : r.sinRepo ? 'El vault no tiene git (okt init lo crea).' : r.omitido ? 'Git desactivado.' : `Git: ${r.error}`;
      return { texto, datos: r };
    },
  },
};
