// Registro de comandos del CLI. Cada comando recibe { pos, op, vault } y devuelve { texto, datos }.
import { planInit, aplicarInit, describirPlan } from './init.mjs';
import { estado } from './estado.mjs';
import { notaNueva } from './notas.mjs';
import { bitacora, pendiente, indice, hot, cerrar } from './sistema.mjs';
import { commit } from './git.mjs';
import { buscar } from './buscar.mjs';
import { lint } from './lint.mjs';
import { hookInicio, hookFin, sesionesAgy } from './sesiones.mjs';
import { preparar } from './bandeja.mjs';
import { adjuntar, archivar } from './archivos.mjs';
import { instalarAntigravity } from './instalar.mjs';
import { leerConfigVault, guardarConfigVault } from './rutas.mjs';
import { doctor } from './doctor.mjs';
import { importarNotion } from './importar-notion.mjs';
import { importarDrive } from './importar-drive.mjs';
import { configurar as tgConfigurar, bajar as tgBajar, descartar as tgDescartar } from './telegram.mjs';
import {
  cuadernos as nlmCuadernos,
  vincular as nlmVincular,
  notas as nlmNotas,
  preguntar as nlmPreguntar,
  estado as nlmEstado,
  crear as nlmCrear,
  descargar as nlmDescargar,
  TIPOS_ESTUDIO,
} from './notebooklm.mjs';

export const AYUDA = `okt: CLI de obsidian-knowledge-terminal (segundo cerebro en Obsidian)

Configuración
  init [--areas "A,B"] [--aplicar]       Crea el vault en la carpeta actual (sin --aplicar: vista previa)
  doctor [--completo]                    Qué herramientas y pasos faltan (--completo: verifica sesiones)
  estado                                 Notas, bandeja, pendientes y última actividad
  config [excluir|incluir <proyecto>]    Ver o cambiar la configuración del vault
  config poner <clave> <valor>           frescura_dias, delegar (agy|ninguno), respaldo
  instalar antigravity [--aplicar]       Copia el plugin y las skills a Antigravity

Notas
  nota nueva <tipo> "<título>"           concepto entidad sintesis fuente articulo proyecto area
                                         diario semanal nota sesion  (--resumen --fuentes --area
                                         --proyecto --origen --url --autor --carpeta --tags)
  buscar "<texto>" [--carpeta --tipo --limite]
  adjuntar "<archivo>" [--origen pdf]    Copia un archivo a 40-Fuentes/adjuntos sin duplicar
  archivar "<ruta>" […]                  Mueve a 90-Archivo (nada se borra)

Sistema (las skills se comunican por aquí)
  bitacora <skill> "<texto>" [--notas "A,B"]
  pendiente agregar "<texto>" [--de --para --nota] | cerrar <n> | listar [--cerrados]
  indice | hot [--aprendizaje "<texto>"] | lint | commit "<mensaje>"
  cerrar <skill> "<texto>" [--notas "A,B"]   bitácora + índice + hot + commit

Bandeja y sesiones
  bandeja preparar | bandeja archivar <rutas>
  sesiones agy                           Fichas de las sesiones de Antigravity (sin el texto de los pedidos)
  hook inicio|fin                        Hooks de Claude Code (leen JSON por stdin)

Importar (solo a pedido)
  importar notion "<enlace>" [--seleccion 1,3|todo] [--aplicar] [--carpeta]
  importar drive "<enlace>"  [--seleccion 1,3|todo] [--aplicar] [--carpeta]
  notebooklm cuadernos | vincular <carpeta> "<cuaderno>" | notas [--seleccion]
  notebooklm preguntar "<pregunta>" | estado | crear <tipo> | descargar <tipo> [--id]
             (--cuaderno "<título>"; tipos: infografia presentacion audio video mapa informe tabla)

Telegram (bot okt-telegram: el celular encola, aquí se baja)
  telegram config [--url <worker> --token <token>]   Guarda la conexión en ~/.config/okt/telegram.json
  telegram bajar [--forzar]              Baja la cola a 00-Bandeja/telegram/ (también al iniciar sesión)
  telegram descartar <id…>               Quita elementos de la cola sin escribirlos

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
      const salida = pos[0] === 'inicio' ? await hookInicio(entrada) : pos[0] === 'fin' ? hookFin(entrada) : '';
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
        const permitidas = { frescura_dias: Number, delegar: (v) => (v === 'ninguno' ? null : v), respaldo: (v) => v };
        if (!permitidas[clave]) throw Object.assign(new Error(`Claves que se pueden cambiar: ${Object.keys(permitidas).join(', ')}`), { codigo: 2 });
        guardarConfigVault(vault, { [clave]: permitidas[clave](valor.join(' ')) });
        return { texto: `${clave} = ${valor.join(' ')}` };
      }
      return { texto: JSON.stringify(cfg, null, 2), datos: cfg };
    },
  },
  adjuntar: { correr: ({ pos, op, vault }) => adjuntar(vault, pos.join(' '), op) },
  archivar: { correr: ({ pos, vault }) => archivar(vault, pos) },
  instalar: {
    vault: false,
    correr({ pos, op }) {
      if (pos[0] !== 'antigravity') throw Object.assign(new Error('Uso: okt instalar antigravity [--aplicar]'), { codigo: 2 });
      return instalarAntigravity(op);
    },
  },
  doctor: { vault: 'opcional', correr: ({ op, vault }) => doctor(vault, op) },
  importar: {
    async correr({ pos, op, vault }) {
      const [fuente, ...ref] = pos;
      if (fuente === 'notion') return importarNotion(vault, ref.join(' '), op);
      if (fuente === 'drive') return importarDrive(vault, ref.join(' '), op);
      throw Object.assign(new Error('Uso: okt importar notion|drive <enlace> [--seleccion …] [--aplicar]. Para NotebookLM: okt notebooklm …'), { codigo: 2 });
    },
  },
  notebooklm: {
    async correr({ pos, op, vault }) {
      const accion = pos.shift();
      if (accion === 'cuadernos') return nlmCuadernos();
      if (accion === 'vincular') return nlmVincular(vault, pos[0], pos.slice(1).join(' '));
      if (accion === 'notas') return nlmNotas(vault, op);
      if (accion === 'preguntar') return nlmPreguntar(vault, pos.join(' '), op);
      if (accion === 'estado') return nlmEstado(vault, op);
      if (accion === 'crear') return nlmCrear(vault, pos[0], op);
      if (accion === 'descargar') return nlmDescargar(vault, pos[0], op);
      throw Object.assign(new Error(`Uso: okt notebooklm cuadernos | vincular <carpeta> "<cuaderno>" | notas | preguntar "<pregunta>" | estado | crear <tipo> | descargar <tipo>\nTipos de Studio: ${TIPOS_ESTUDIO.join(', ')}`), { codigo: 2 });
    },
  },
  telegram: {
    vault: 'opcional',
    async correr({ pos, op, vault }) {
      const accion = pos.shift();
      if (accion === 'config') return tgConfigurar(op);
      if (accion !== 'bajar' && accion !== 'descartar') throw Object.assign(new Error('Uso: okt telegram config [--url <worker> --token <token>] | bajar [--forzar] | descartar <id…>'), { codigo: 2 });
      if (!vault) throw Object.assign(new Error('No encontré un vault de OKT aquí ni en la configuración.'), { codigo: 1 });
      return accion === 'bajar' ? tgBajar(vault, op) : tgDescartar(vault, pos);
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
