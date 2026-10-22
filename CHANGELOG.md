# Cambios

## 0.2.2 — 2026-10-22

- **Antigravity con hook de inicio:** `okt instalar antigravity --aplicar` deja en `<vault>/.agents/hooks.json`
  un hook **SessionStart** (`okt hook inicio --formato antigravity`) que, al abrir `agy` en el vault, baja
  Telegram y carga `hot.md`, igual que en Claude Code. Formato verificado en agy 1.4.5:
  `{"injectSteps":[{"systemMessage":{"systemMessage":"…"}}]}`, comando sin comillas. Avisa si el vault aún no
  es una carpeta de confianza de agy, que no usa los hooks hasta entonces. No pisa otros hooks.
- La bajada a mano ya no termina en error si hay muchos archivos: tope de 3 min, y los archivos que no alcanzan
  quedan en la cola para la próxima vez.
- `cerebro` y `mantener` reconocen «baja lo de Telegram», «qué llegó de Telegram» y «conecta Telegram».
- `AGENTS.md` del vault: cómo se baja Telegram en cada agente.
- El hook de Claude Code hace commit de `AGENTS.md` cuando renueva la ruta del CLI (antes lo dejaba modificado).

## 0.2.1 — 2026-10-22

Tras la prueba real contra el Worker desplegado:

- En el hook, un archivo solo se baja si quedan 6 s del tope (cada uno tarda ~5 s: Telegram → Worker → PC);
  los demás esperan a `okt telegram bajar` y el hook lo avisa.
- Una foto sin leyenda se titula «foto», sin la extensión ni la fecha repetida.
- README: `/tarea` sola (desde el menú del bot) pregunta y toma el siguiente mensaje.

## 0.2.0 — 2026-10-22

- Comando `okt telegram config|bajar|descartar` para gestionar y sincronizar la cola del bot okt-telegram.
- El hook de inicio baja la cola al abrir Claude Code en el vault (tope de 10 s, nunca frena la sesión).
- Retención de lo sensible: los elementos con posibles datos de pacientes requieren `--forzar` para descargarse o se descartan con `okt telegram descartar`.
- `/tarea` va a `## Tareas` de la nota diaria de hoy.
- Idempotencia con `.cerebro/telegram.json` para no duplicar elementos si la confirmación falla.
- La skill cerebro suma el paso 9 «Telegram» y el cierre pasa a 10.
- La skill mantener baja la cola al procesar la bandeja.
- Una sola bajada a la vez (candado en `.cerebro/telegram.lock`), y lo ya escrito se confirma aunque la bajada
  se corte por tiempo.
- Datos de pacientes: el patrón de nombres detecta también los escritos en mayúsculas («Paciente JUAN
  PÉREZ») en el lint, las importaciones y Telegram; en Telegram se revisa además el nombre del archivo.

## 0.1.1 — 2026-10-22

- `okt init` ya no falla con EPERM en Windows cuando `.obsidian/app.json` tiene el atributo Oculto
  (como lo deja Obsidian): los archivos existentes se sobrescriben abriéndolos con `r+`.

## 0.1.0 — 2026-10-22

Primera versión.

- Cinco skills: `cerebro` (guía y configuración), `capturar`, `consultar`, `mantener` y `notebooklm`.
- CLI `okt` sin dependencias:
  - vault: `init`, `doctor`, `estado`, `nota nueva`, `buscar`, `lint`, `indice`, `hot`;
  - sistema: `bitacora`, `pendiente`, `cerrar`, `commit`, `config`;
  - bandeja y archivos: `bandeja`, `adjuntar`, `archivar`;
  - importaciones: `importar notion|drive`, `notebooklm …`;
  - sesiones e instalación: `sesiones agy`, `hook`, `instalar antigravity`.
- Hooks de Claude Code sin modelo:
  - el contexto del vault al iniciar;
  - una ficha de sesión al cerrar.
- Importaciones solo a pedido y con selección. Bloquean el contenido con aparentes datos de
  pacientes.
- **Notion:**
  - las propiedades no se copian;
  - se navega por las relaciones (curso → módulos → capítulos);
  - el Markdown enriquecido se convierte a Obsidian (plegables, tablas, marcadores).
- **NotebookLM:**
  - las respuestas guardan sus referencias numeradas, con el texto citado;
  - la descarga de Studio se revisa en caché antes de entrar al vault.
- **`init` sobre un vault de Obsidian existente:** agrega los ajustes que faltan sin cambiar los del
  usuario.
