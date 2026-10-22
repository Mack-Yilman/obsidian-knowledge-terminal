# Cambios

## 0.3.0 — 2026-10-22

**Carpetas y notas con emojis.** Cambia la estructura del vault: un vault 0.2.x se migra con `okt migrar`.

- **Carpetas:** `00 │ 📥 Bandeja` … `99 │ ⚙️ Sistema`, con subcarpetas (`📲 telegram`, `💡 conceptos`, `📕 pdf`…). El
  separador es `│` (U+2502): `|` está prohibido en los nombres de Windows y en Obsidian separa el alias.
- **Notas:** emoji temático elegido por la IA en conceptos, entidades, síntesis, proyectos y áreas
  (`🩸 Anemia ferropénica`); emoji fijo del tipo en lo demás (📄 fuente, 🔬 artículo, 📅 diario, 📲 Telegram,
  💻 sesión, 🗒️ Notion, ☁️ Drive, 🤖 NotebookLM). El nombre sin emoji queda como alias. «💡 Anemia» y «🩸 Anemia»
  cuentan como la misma nota y no se duplican.
- **`okt migrar [--aplicar]`:** vista previa y migración reanudable de un vault 0.2.x: mueve carpetas y notas (nada se
  borra), reescribe los enlaces, actualiza los registros de `.cerebro`, la configuración de Obsidian, `AGENTS.md` y el
  `.gitignore`, y hace un commit. Si dos nombres chocarían, no toca nada. Hasta migrar, los comandos que escriben se
  detienen y el hook de inicio lo avisa.
- **`okt renombrar "<nota>" "<nombre nuevo>"`:** cambia el nombre o el emoji, el título, el alias y los enlaces de
  todo el vault (y la carpeta, si es la nota principal de un proyecto).
- **`--carpeta`** (y `archivar`, `notebooklm vincular`) acepta nombres cortos (`proyectos/Tesis`), rutas antiguas y
  nombres sin emoji.
- **Lint:** aviso `sin_emoji`, y un enlace roto como `[[Anemia]]` sugiere `[[🩸 Anemia]]`.

Correcciones de la auditoría:

- NotebookLM: la tabla de datos se lee como CSV de verdad (celdas con comas, saltos de línea o comillas ya no se
  descuadran).
- Telegram: `--forzar` escribe solo los ids que se nombran (`--forzar todo` para todos); `okt estado` muestra los
  retenidos y la última bajada con novedades.
- Ficha de sesión: el primer archivo modificado perdía su primer carácter (git devolvía « M archivo» y se recortaba
  el espacio), y los nombres con tildes o emojis salían escapados. Ahora usa `git status --porcelain -z` y
  `core.quotepath=false`.
- Todas las escrituras sobre archivos existentes del vault usan `sobrescribir()`: un archivo oculto ya no da EPERM.
- Los cortes de nombres ya no parten un emoji en dos.
- `.gitignore` del vault: `.tmp.drivedownload/` de Google Drive.
- `okt doctor`: respeta `OKT_AGY_SKILLS`, avisa si el vault no es carpeta de confianza en agy y si falta migrar.
- Contrato: `actualizado` no se exige en `semanal` ni `sistema`. La guía de configuración ya no dice que Antigravity
  no tiene hooks.
- README para usuarios nuevos: requisitos por sistema, instalación paso a paso, actualizar, migrar y problemas
  frecuentes.

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
