# Cambios

## 0.6.2 — 2026-10-24

- **Videos de YouTube en español, transcritos en español.** Un video con idioma `es-US` y doblaje automático al inglés
  salía con la transcripción del doblaje (`en-orig`). Ahora se elige primero la pista en español (subtítulos manuales o
  la voz en español, también la de un doblaje automático, que el encabezado señala) y luego la del idioma del video.
- **Todo en español al procesar:** las webs y los videos en otro idioma llevan la propiedad `idioma` (Defuddle y
  yt-dlp lo dicen), y al procesar la Bandeja la nota se escribe en español, con el original en `📥 Bruto`. En Claude
  Code con `delegar: agy` la traduce Gemini Flash; en Antigravity o sin agy, el mismo agente. `redactar` también
  traduce («tradúcela», «pásala al español»).
- **Memoria de los agentes por proyecto:** cuenta la carpeta con memoria más cercana y las subcarpetas inmediatas con
  memoria propia (una carpeta que agrupa proyectos), ya no todas las carpetas de arriba, que suelen ser reglas
  generales y dejaban capturas que confundían. Una carpeta de arriba que vinculas a mano se sigue sincronizando en las
  sesiones de los proyectos de abajo.

## 0.6.1 — 2026-10-24

- **OKT se instala en Antigravity como plugin**, no como skills sueltas: `okt instalar antigravity --aplicar` lo deja en
  `~/.gemini/config/plugins/obsidian-knowledge-terminal/` con un `plugin.json` en la raíz (el formato de agy), así que
  `agy plugin list` lo muestra con su versión y sus 6 skills. Quita las skills `okt-*` y la copia en `~/.okt/plugin` de
  la instalación anterior. Los hooks de inicio y la tarea del IDE apuntan al CLI del plugin.
- `okt doctor` revisa el plugin de Antigravity y avisa si quedaron skills `okt-*` viejas.

## 0.6.0 — 2026-10-24

**La memoria de tus agentes entra al vault.** Reemplaza las fichas de sesión (commits y archivos tocados) por lo que el
agente aprendió: el `CLAUDE.md`, `AGENTS.md` o `GEMINI.md` de cada carpeta de trabajo.

- **Detectar:** los hooks de inicio y fin de Claude Code y el de inicio de Antigravity ven la carpeta de trabajo y sus
  carpetas superiores. La primera vez que una tiene memoria de agente, deja en la Bandeja `🛠️ Carpeta nueva - <nombre>`, que pregunta dónde seguirla. Nada se copia hasta que el usuario responde.
- **Vincular:** `okt agentes vincular "<carpeta>" "<destino>"` crea en esa carpeta del vault (un proyecto, un área o
  un tema) la nota `🛠️ <carpeta> - memoria del agente`, con el archivo completo entre marcas `okt`, y archiva la
  captura que preguntaba. `okt agentes ignorar "<carpeta>"` deja de preguntar; `okt agentes` lista las que sigue.
- **Cada sesión:** si la memoria cambió (huella SHA-256) o hay commits nuevos, el espejo se actualiza y la Bandeja
  recibe `💻 <fecha> <carpeta>` con solo lo nuevo: las líneas agregadas y quitadas, y los asuntos de los commits. Al
  abrir el vault se sincronizan todas (`okt agentes sincronizar`).
- **Se quitan** `okt sesiones agy` (contaba los pedidos de agy) y la lista de archivos tocados.
- La skill `mantener` propone el destino de cada carpeta nueva y pasa lo aprendido a las notas de su área, citando el
  espejo.

Correcciones de una revisión independiente del código de la 0.5.0 y la 0.6.0:

- Una página, una transcripción o un `CLAUDE.md` que contengan las marcas `<!-- okt:inicio -->` o `<!-- okt:fin -->`
  ya no cortan el bloque al reimportar; un salto de línea en un autor o un error ya no rompe el frontmatter.
- Si una captura con enlace se procesa o se archiva mientras su contenido se descarga, no se crea otra nota en su
  lugar. Al traerla bien, se borra un `importar_error` anterior.
- Un enlace a una **carpeta** de Drive en la Bandeja queda con `importar_error` (antes se reintentaba en cada inicio).
- Los candados viven en `.cerebro/cache/`: antes el commit del vault se llevaba el candado (pasaba también con el de
  Telegram).
- `okt reorganizar aplicar` rechaza antes de tocar nada un destino fuera de las áreas y proyectos, un nombre ya
  renombrado antes en el plan y un choque de nombres.
- Los commits nuevos de una carpeta de agente se cuentan desde el último visto (por hash): uno hecho en el mismo
  segundo ya no sale dos veces. Volver a vincular a otro destino mueve el espejo y conserva lo ya visto.

## 0.5.0 — 2026-10-24

**Enlaces e ingesta sin tokens, temas sin límite de niveles y reorganización asistida del vault.**

- **Enlaces sin el modelo (sin gastar tokens):** `okt importar url "<enlace>" [--carpeta <destino>]` detecta el tipo:
  - **Web:** con **Defuddle** (`npm install -g defuddle`, el motor de Obsidian Web Clipper) descarga la página completa en Markdown y sus imágenes (hasta 40) en `99 │ ⚙️ Sistema/📎 adjuntos/🌐 web/`, reescritas como `![[imagen]]`. La nota se titula `🌐 <título>` con `url`, `autor` y `publicado`.
  - **YouTube:** con **yt-dlp** (`uv tool install yt-dlp`, usa Node para los retos de YouTube) obtiene solo los subtítulos (manuales antes que automáticos y en el idioma original). El video **no se descarga**: la nota `▶️ <título>` incrusta el reproductor arriba (`![](url)`) e incluye la transcripción en bruto por capítulos o en párrafos de un minuto con marcas de tiempo enlazadas. Si no tiene subtítulos, lo avisa y sugiere NotebookLM.
  - **Drive:** pasa por `okt importar drive`.
  Sin `--carpeta` va a la Bandeja como captura; con `--carpeta` queda como fuente en esa carpeta. Reimportar el mismo enlace actualiza la misma nota entre las marcas `okt`.
- **Ingesta en segundo plano:** `okt importar enlaces [--reintentar]` completa en su lugar las capturas de la Bandeja que solo traen un enlace (las que llegan de Telegram). Si una falla, queda con la propiedad `importar_error` y no se reintenta sola; `--reintentar` la vuelve a intentar. Al empezar a trabajar en el vault (hook de Claude Code, hooks de Antigravity y tarea del IDE), los enlaces pendientes se traen en un proceso aparte en segundo plano sin frenar la sesión. `okt doctor` muestra si están instalados `defuddle` y `yt-dlp`.
- **Videos de Drive sin descarga:** un video de Drive ya no se descarga; la nota lo muestra con el reproductor de Drive (`<iframe>` de `/preview`) y un enlace «▶️ Abrir en Drive» (si es privado, el reproductor puede pedir iniciar sesión dentro de Obsidian; el enlace lo abre en el navegador). Docs, PDF e imágenes siguen igual.
- **Temas sin límite de niveles:** se elimina el máximo de 3 niveles; un área o un proyecto puede anidar tantas carpetas de tema como requiera el dominio. Desaparecen el hallazgo `muy_profunda` de `okt lint` y el error «… ya tiene 3 niveles de tema».
- **Citar entre áreas:** el contrato define el enlace entre notas de distintas áreas mediante `[[Nota]]`, `[[Nota#Sección]]`, enlaces de párrafo `[[Nota#^id]]` y transclusiones con `![[Nota#Sección]]`.
- **La Bandeja no fuerza destinos:** al procesar la bandeja, cada captura tiene uno de tres destinos: claro (su carpeta), dudoso (la mejor opción con «¿?» y una alternativa) o no encaja (propone un área o proyecto nuevo marcado 🆕 o se deja en la Bandeja preguntando al usuario). Nunca se asigna a un área que no corresponde solo por vaciar la Bandeja.
- **Reorganizar el conocimiento:** con «reorganiza mi cerebro» o «reorganiza mi área de …»:
  - `okt reorganizar preparar [--carpeta "<área o proyecto>"]` genera un mapa compacto (el árbol y, por nota, su tipo, su resumen y sus enlaces de entrada y salida, sin el texto) para que la IA diseñe una propuesta gastando pocos tokens.
  - La IA propone una tabla «actual → propuesto» y, con un solo sí, escribe el plan en JSON.
  - `okt reorganizar aplicar <plan.json>` valida el plan entero antes de tocar nada (si algo no cuadra, no cambia nada), aplica en orden `tema`, `mover`, `renombrar` y `archivar`, hace un solo commit y responde con el comando `git revert` para deshacerlo.
- **Folder Notes (recomendado):** la guía de configuración recomienda el plugin de la comunidad **Folder Notes** (de LostPaul), configurado con la nota *dentro* de la carpeta, el nombre `{{folder_name}}` y la opción de ocultar la nota de carpeta: al hacer clic en la carpeta se abre su nota principal (que lleva el índice automático y a la que apuntan enlaces y grafo) sin verla repetida en el explorador.

## 0.4.1 — 2026-10-23

Correcciones de una revisión independiente del código de la 0.4.0:

- `okt tema nuevo "<área>/<área>"` ya no convierte la nota del área en tema.
- Las notas y los temas solo se crean o procesan dentro de un área o un proyecto: `--carpeta bandeja`, `diario`,
  `archivo` o `sistema` se rechaza (sin `--carpeta`, la nota sigue yendo a la Bandeja).
- Los originales en bruto tienen un nombre único en todo `📥 Bruto`, no solo dentro del mes: así `okt bruto limpiar` no
  desenlaza otro original con el mismo nombre.
- `okt nota nueva proyecto --area "Medicina"` enlaza el área con su nombre exacto (`[[🩺 Medicina]]`), y el índice del
  área lista también los proyectos con el nombre del área escrito sin emoji.
- `okt migrar` ya no reescribe enlaces cuando renombra un archivo para no pisar otro con el mismo nombre: lo informa en
  la vista previa (antes, los enlaces del área podían terminar apuntando a la nota renombrada).

## 0.4.0 — 2026-10-23

**El conocimiento vive en tus áreas y proyectos, y el plugin sirve para cualquier persona.** Cambia la estructura del
vault: un vault 0.3.x o 0.2.x se migra con `okt migrar`.

- **Estructura nueva (versión 3):** sin `30 │ 🧠 Conocimiento` ni `40 │ 📚 Fuentes`. Cada área, proyecto y tema es una
  carpeta con una nota principal del mismo nombre y su índice automático; los temas llegan hasta 3 niveles
  (Área → Rama → Grupo → nota). Las fuentes van junto a lo que alimentan, los adjuntos a `99 │ ⚙️ Sistema/📎 adjuntos`
  y la Bandeja ya no tiene subcarpetas.
- **Configuración para cualquier usuario:** la skill `cerebro` entrevista al usuario (a qué se dedica, sus áreas, sus
  proyectos y sus temas) y crea las carpetas con `okt init --areas … --proyectos "P@Área" --temas "Área/Tema"
  --perfil …`. Sin respuestas no se crea ninguna área. El perfil va al `AGENTS.md` para que cualquier agente adapte
  sus ejemplos.
- **De bruto a procesado:** `okt procesar` convierte una captura en la nota de su carpeta (sin copia) o, con `--en`,
  deja el original en `90 │ 🗄️ Archivo/📥 Bruto/` enlazado desde la propiedad `bruto`. `okt bruto guardar` y
  `okt bruto limpiar` (borra solo con `--aplicar`). `okt tema nuevo` y `okt mover` organizan la jerarquía.
- **Skill nueva `redactar`:** «pasa a limpio esta nota» u «ordénala», con reglas de fidelidad adaptadas del
  transcriptor académico: no agrega, no resume, conserva los datos y marca `(¿?)` lo dudoso de las voces.
- **Archivos del sistema útiles:** `🗂️ indice` es el árbol del vault; `🔥 hot` muestra los proyectos en foco con su
  próximo paso; `✅ pendientes` separa «Para ti» y «Para la IA»; la bitácora guarda las últimas 300 líneas. Plantillas
  de Obsidian para nota, fuente, tema, área, proyecto, diario y semanal, sin campos vacíos de relleno.
- **Tipos y propiedades:** `nota` reemplaza a concepto, entidad y síntesis (que se aceptan como alias); `captura`
  para lo que entra en bruto; `tema` para las notas principales de los temas. Sin `## Historial` (lo guarda git).
- **Sin filtros de contenido:** el vault es del usuario. Se quitan la detección de datos de pacientes del lint, las
  importaciones, Drive, NotebookLM, las fichas de sesión y Telegram (`--forzar` y los «retenidos» desaparecen; el
  campo `sensible` de la cola se ignora).
- **Antigravity en la App y el IDE:** además del hook del vault, `okt instalar antigravity --aplicar` pone un hook
  global (App y CLI; no se repite en la misma conversación) y una tarea del IDE que baja Telegram al abrir la carpeta.
  `okt telegram bajar --silencioso` para esa tarea. `okt doctor` muestra los tres y avisa si la copia de Antigravity
  quedó en otra versión.
- **Lint:** reglas nuevas `fuera_de_lugar`, `muy_profunda`, `sin_enlaces` y `tipo_antiguo`; el índice desactualizado
  se mide por carpeta.

## 0.3.1 — 2026-10-22

- **Nota diaria con formato a elegir:** `okt config poner formato_diario DD/MM/YY` la nombra `📅 22∕10∕26` (barra de
  división U+2215, porque `/` crearía carpetas). Por defecto sigue `📅 2026-10-22`. El comando ajusta también la nota
  diaria de Obsidian, para que su botón y OKT (y las tareas de Telegram) usen la misma nota.
- **Formato de Obsidian (`kepano/obsidian-skills`):** nuevo paso opcional en la configuración. `okt instalar
  obsidian-skills [--aplicar]` las instala en Antigravity; en Claude Code se instalan como plugin. `okt doctor` muestra
  las dos instalaciones.

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
