// Registro de comandos del CLI. Cada comando recibe { pos, op, vault } y devuelve { texto, datos }.
import { planInit, aplicarInit, describirPlan, actualizarAgents } from './init.mjs';
import { estado } from './estado.mjs';
import { notaNueva } from './notas.mjs';
import { bitacora, pendiente, indice, hot, cerrar } from './sistema.mjs';
import { commit } from './git.mjs';
import { buscar } from './buscar.mjs';
import { lint } from './lint.mjs';
import { hookInicio, hookInicioAntigravity, hookFin, sesionesAgy } from './sesiones.mjs';
import { preparar } from './bandeja.mjs';
import { adjuntar, archivar } from './archivos.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { instalarAntigravity, instalarObsidianSkills } from './instalar.mjs';
import { leerConfigVault, guardarConfigVault, sobrescribir } from './rutas.mjs';
import { temaNuevo, mover, procesar, brutoGuardar, brutoLimpiar } from './organizar.mjs';
import { preparar as reorganizarPreparar, aplicar as reorganizarAplicar } from './reorganizar.mjs';
import { sinEmoji } from './nombres.mjs';
import { basename } from 'node:path';
import { FORMATOS_DIARIO } from './estructura.mjs';
import { doctor } from './doctor.mjs';
import { migrar, renombrar } from './migrar.mjs';
import { importarNotion } from './importar-notion.mjs';
import { importarDrive } from './importar-drive.mjs';
import { importarUrl, importarEnlaces, lanzarSegundoPlano } from './importar-url.mjs';
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
  init [--areas "A,B"] [--proyectos "P@Área,…"] [--temas "Área/Tema,…"] [--perfil "<a qué te dedicas>"] [--aplicar]
                                         Crea el vault en la carpeta actual con lo que se pidió (sin --aplicar: vista previa)
  doctor [--completo]                    Qué herramientas y pasos faltan (--completo: verifica sesiones)
  estado                                 Áreas, proyectos, bandeja, pendientes y última actividad
  config [excluir|incluir <proyecto>]    Ver o cambiar la configuración del vault
  config poner <clave> <valor>           perfil, frescura_dias, delegar (agy|ninguno), respaldo,
                                         formato_diario (AAAA-MM-DD | DD/MM/YY)
  instalar antigravity [--aplicar]       Copia el plugin y las skills a Antigravity, con sus hooks y la tarea del IDE
  instalar obsidian-skills [--aplicar]   Skills de formato de Obsidian (kepano) para Antigravity
  migrar [--aplicar]                     Pasa un vault de una versión anterior a la estructura actual (sin --aplicar: vista previa)

Áreas, proyectos y temas (todo es carpeta con su nota principal; temas anidados sin límite)
  nota nueva area "<emoji> <nombre>"     Área (lo continuo)
  nota nueva proyecto "<emoji> <nombre>" [--area "<área>"]   Proyecto (lo que termina)
  tema nuevo "<área o proyecto>/<tema>[/<tema>]"   Carpeta de tema con su nota principal
  mover "<nota o tema>" "<carpeta>"      Mueve una nota o un tema entero (los enlaces no cambian)
  archivar "<ruta>" […]                  Mueve a la carpeta Archivo (nada se borra)
  reorganizar preparar [--carpeta "<área o proyecto>"]   Mapa compacto (árbol, resúmenes y enlaces) para rejerarquizar
  reorganizar aplicar <plan.json>        Aplica el plan aprobado (temas, mover, renombrar, archivar) en un solo commit

Notas
  nota nueva <tipo> "<título>" [--carpeta "<área o proyecto>/<tema>"]
                                         nota fuente articulo tema captura diario semanal (y area, proyecto)
                                         (--resumen --fuentes --origen --url --autor --publicado --tags)
                                         Sin --carpeta, nota y fuente van a la Bandeja. En nota, tema, proyecto
                                         y área pon un emoji temático al inicio del título
  procesar "<captura>" --a "<carpeta>" --titulo "<emoji> <título>" [--tipo nota|fuente|articulo] [--resumen]
                                         La captura de la Bandeja pasa a ser la nota (no queda copia)
  procesar "<captura>" --en "A,B"        Su contenido ya está en A y B: el original va a Archivo/📥 Bruto
  bruto guardar "<nota>"                 Copia el original a Bruto antes de reescribir una nota
  bruto limpiar [--dias 90] [--aplicar]  Lista (y con --aplicar borra) los originales viejos
  renombrar "<nota>" "<nombre nuevo>"     Cambia el nombre (y el emoji) y actualiza los enlaces
  buscar "<texto>" [--carpeta --tipo --limite]
  adjuntar "<archivo>" [--origen pdf]    Copia un archivo a los adjuntos (Sistema) sin duplicar

Sistema (las skills se comunican por aquí)
  bitacora <skill> "<texto>" [--notas "A,B"]
  pendiente agregar "<texto>" [--para usuario|ia] [--de <skill>] [--nota] | cerrar <n> | listar [--cerrados]
  indice | hot [--aprendizaje "<texto>"] | lint | commit "<mensaje>"
  cerrar <skill> "<texto>" [--notas "A,B"]   bitácora + índices + hot + commit

Bandeja y sesiones
  bandeja preparar | bandeja archivar <rutas>
  sesiones agy                           Fichas de las sesiones de Antigravity (sin el texto de los pedidos)
  hook inicio|fin                        Hooks de Claude Code (leen JSON por stdin)
  hook inicio --formato antigravity      SessionStart de Antigravity (responde injectSteps en JSON)

Importar (solo a pedido; va a la Bandeja salvo --carpeta)
  importar notion "<enlace>" [--seleccion 1,3|todo] [--aplicar] [--carpeta]
  importar drive "<enlace>"  [--seleccion 1,3|todo] [--aplicar] [--carpeta]
  importar url "<enlace>" [--carpeta]   Página web completa (con imágenes) o transcripción de YouTube, sin el modelo
  importar enlaces [--reintentar]        Completa las capturas de la Bandeja que solo traen un enlace (p. ej. de Telegram)
  notebooklm cuadernos | vincular <carpeta> "<cuaderno>" | notas [--seleccion]
  notebooklm preguntar "<pregunta>" | estado | crear <tipo> | descargar <tipo> [--id]
             (--cuaderno "<título>"; tipos: infografia presentacion audio video mapa informe tabla)

Telegram (bot okt-telegram: el celular encola, aquí se baja)
  telegram config [--url <worker> --token <token>]   Guarda la conexión en ~/.config/okt/telegram.json
  telegram bajar [--silencioso]          Baja la cola a la Bandeja (también al iniciar sesión)
  telegram descartar <id…>               Quita elementos de la cola sin escribirlos

Opciones comunes: --vault <ruta>  --json
--carpeta acepta la ruta desde un área o un proyecto, sin emojis: "Medicina/Cardiología", "proyectos/Tesis", "bandeja".
`;

export const COMANDOS = {
  init: {
    vault: 'crear',
    correr({ op, vault }) {
      const plan = planInit(vault, { areas: op.areas, proyectos: op.proyectos, temas: op.temas, perfil: op.perfil });
      const aviso = plan.ocupada ? `\nAviso: la carpeta ya tiene archivos y no es un vault de OKT. Se agregará la estructura sin tocar lo existente.\n` : '';
      if (!op.aplicar) {
        return {
          texto: `Vista previa de okt init en ${plan.vault}\nÁreas: ${plan.areas.join(', ') || 'ninguna (pídelas en la entrevista: --areas)'}\nProyectos: ${plan.proyectos.map((p) => p.nombre).join(', ') || 'ninguno'}\n${describirPlan(plan)}${aviso}\nPara crearlo: repite el comando con --aplicar.`,
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
      const r = notaNueva(vault, tipo, titulo.join(' '), op);
      // Un área nueva entra a la configuración y al bloque de AGENTS.md.
      if (tipo === 'area' && r.datos.creada) {
        const nombre = basename(r.datos.ruta, '.md');
        const areas = leerConfigVault(vault).areas || [];
        if (!areas.some((a) => sinEmoji(a).toLowerCase() === sinEmoji(nombre).toLowerCase())) guardarConfigVault(vault, { areas: [...areas, nombre] });
        actualizarAgents(vault);
      }
      return r;
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
    async correr({ pos, op }) {
      let entrada = '';
      if (!process.stdin.isTTY) for await (const trozo of process.stdin) entrada += trozo;
      const salida =
        pos[0] === 'inicio' ? await (op.formato === 'antigravity' ? hookInicioAntigravity(entrada) : hookInicio(entrada)) : pos[0] === 'fin' ? hookFin(entrada) : '';
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
        const permitidas = { perfil: (v) => v.trim() || null, frescura_dias: Number, delegar: (v) => (v === 'ninguno' ? null : v), respaldo: (v) => v, formato_diario: (v) => v };
        if (!permitidas[clave]) throw Object.assign(new Error(`Claves que se pueden cambiar: ${Object.keys(permitidas).join(', ')}`), { codigo: 2 });
        if (clave === 'formato_diario' && !FORMATOS_DIARIO[valor.join(' ')]) throw Object.assign(new Error(`Formatos de la nota diaria: ${Object.keys(FORMATOS_DIARIO).join(', ')}`), { codigo: 2 });
        guardarConfigVault(vault, { [clave]: permitidas[clave](valor.join(' ')) });
        if (clave === 'perfil') actualizarAgents(vault);
        // El botón «Nota diaria» de Obsidian usa el mismo nombre que OKT: si no, habría dos notas por día.
        const diaria = join(vault, '.obsidian', 'daily-notes.json');
        if (clave === 'formato_diario' && existsSync(diaria)) {
          const d = JSON.parse(readFileSync(diaria, 'utf8'));
          sobrescribir(diaria, `${JSON.stringify({ ...d, format: FORMATOS_DIARIO[valor.join(' ')].obsidian }, null, 2)}\n`);
        }
        return { texto: `${clave} = ${valor.join(' ')}` };
      }
      return { texto: JSON.stringify(cfg, null, 2), datos: cfg };
    },
  },
  adjuntar: { correr: ({ pos, op, vault }) => adjuntar(vault, pos.join(' '), op) },
  tema: {
    correr({ pos, op, vault }) {
      if (pos.shift() !== 'nuevo') throw Object.assign(new Error('Uso: okt tema nuevo "<área o proyecto>/<tema>"'), { codigo: 2 });
      return temaNuevo(vault, pos.join(' '), op);
    },
  },
  mover: { correr: ({ pos, vault }) => mover(vault, pos[0], pos.slice(1).join(' ')) },
  procesar: { correr: ({ pos, op, vault }) => procesar(vault, pos.join(' '), op) },
  bruto: {
    correr({ pos, op, vault }) {
      const accion = pos.shift();
      if (accion === 'guardar') return brutoGuardar(vault, pos.join(' '));
      if (accion === 'limpiar') return brutoLimpiar(vault, op);
      throw Object.assign(new Error('Uso: okt bruto guardar "<nota>" | bruto limpiar [--dias 90] [--aplicar]'), { codigo: 2 });
    },
  },
  archivar: { correr: ({ pos, vault }) => archivar(vault, pos) },
  reorganizar: {
    correr({ pos, op, vault }) {
      const accion = pos.shift();
      if (accion === 'preparar') return reorganizarPreparar(vault, op);
      if (accion === 'aplicar') return reorganizarAplicar(vault, pos.join(' '));
      throw Object.assign(new Error('Uso: okt reorganizar preparar [--carpeta "<área o proyecto>"] | reorganizar aplicar <plan.json>'), { codigo: 2 });
    },
  },
  instalar: {
    vault: false,
    correr({ pos, op }) {
      if (pos[0] === 'obsidian-skills') return instalarObsidianSkills(op);
      if (pos[0] !== 'antigravity') throw Object.assign(new Error('Uso: okt instalar antigravity|obsidian-skills [--aplicar]'), { codigo: 2 });
      return instalarAntigravity(op);
    },
  },
  doctor: { vault: 'opcional', correr: ({ op, vault }) => doctor(vault, op) },
  importar: {
    async correr({ pos, op, vault }) {
      const [fuente, ...ref] = pos;
      if (fuente === 'notion') return importarNotion(vault, ref.join(' '), op);
      if (fuente === 'drive') return importarDrive(vault, ref.join(' '), op);
      if (fuente === 'url') return importarUrl(vault, ref.join(' '), op);
      if (fuente === 'enlaces') return importarEnlaces(vault, op);
      throw Object.assign(new Error('Uso: okt importar notion|drive|url <enlace> [--seleccion …] [--aplicar] | importar enlaces. Para NotebookLM: okt notebooklm …'), { codigo: 2 });
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
      if (accion !== 'bajar' && accion !== 'descartar') throw Object.assign(new Error('Uso: okt telegram config [--url <worker> --token <token>] | bajar [--silencioso] | descartar <id…>'), { codigo: 2 });
      if (!vault) {
        if (op.silencioso) return 0;
        throw Object.assign(new Error('No encontré un vault de OKT aquí ni en la configuración.'), { codigo: 1 });
      }
      if (accion === 'descartar') return tgDescartar(vault, pos);
      const r = await tgBajar(vault, op);
      // --silencioso es la tarea del IDE al abrir el vault: como los hooks, deja trayendo los enlaces en segundo plano.
      if (op.silencioso) lanzarSegundoPlano(vault);
      return r;
    },
  },
  migrar: { correr: ({ op, vault }) => migrar(vault, op) },
  renombrar: { correr: ({ pos, vault }) => renombrar(vault, pos[0], pos.slice(1).join(' ')) },
  commit: {
    correr({ pos, vault }) {
      const r = commit(vault, pos.join(' ') || 'okt: cambios');
      const texto = r.hecho ? 'Commit hecho.' : r.sinCambios ? 'Sin cambios.' : r.sinRepo ? 'El vault no tiene git (okt init lo crea).' : r.omitido ? 'Git desactivado.' : `Git: ${r.error}`;
      return { texto, datos: r };
    },
  },
};
