# 🧠 obsidian-knowledge-terminal (OKT)

**Un segundo cerebro en Obsidian que gestionas hablando con tu IA**, en Claude Code, en Antigravity o en cualquier
agente que lea skills. Escribes como te salga (ideas sueltas, notas de voz desde Telegram, apuntes de Notion o de
Google Docs, PDFs, páginas web, respuestas de NotebookLM) y la IA **lo ordena dentro de tus áreas y proyectos, lo
enlaza y lo pasa a limpio cuando se lo pides**. Te responde citando tus propias notas.

Sirve para cualquier persona y cualquier tema: al configurarlo, la IA te pregunta a qué te dedicas y crea tus áreas,
tus proyectos y tus temas a partir de tus respuestas.

Está pensado para gastar poco en tus planes (Claude Pro, Google One):
- **Lo mecánico lo hace un script, no el modelo:** índices, búsqueda, revisión, importaciones, mover y renombrar.
- **El arranque de cada sesión es corto:** el agente lee un resumen de 500 palabras como máximo, no todo el vault.
- **El orden se hace por lotes y a pedido**, y se puede delegar a Gemini Flash vía Antigravity.
- **Las transcripciones largas se leen por tramos,** y un script comprueba cifras, URL, nombres e índice contra el original (`okt redactar`).

## Qué puedes pedirle

| Dices… | Pasa |
|---|---|
| «Configura mi segundo cerebro» | Te pregunta a qué te dedicas, propone tus áreas, proyectos y temas, y crea las carpetas con tu sí |
| «Guarda esta idea: …» / «guárdalo en Cardiología» | Lo guarda en la Bandeja o directo en el área, el proyecto o el tema que digas |
| «Procesa mi bandeja» | Te muestra una tabla de qué va dónde, marca dudas y propone carpetas, áreas o proyectos nuevos (🆕). Con un solo sí, pasa a limpio cada cosa con su perfil, la ubica y la enlaza; los originales quedan en `📥 Bruto` |
| «Pasa a limpio esta nota» | Lo mismo con una sola nota, según lo que sea (abajo) |
| «Haz apuntes de esta clase» / «ordena este video» | **Clase o video:** índice y temas numerados en una misma página, sin resumir |
| «Ordena esta reunión» | **Reunión:** acuerdos, tareas y puntos abiertos arriba y el desarrollo por temas; nunca inventa quién habló |
| «Dale forma a mis ideas» | **Nota propia:** reescribe claro lo que escribiste sin orden, le da estructura y agrega `🔗 Conexiones` con tus demás notas |
| «Organiza mi área de Medicina» | Agrupa sus notas de lo general a lo específico: Medicina → Cardiología → Síndrome coronario agudo → Infarto. Lo general va en la nota principal de cada carpeta, y una carpeta nueva se crea desde 2 notas del mismo tema (o 1, si es algo con identidad propia, como un producto) |
| «Reorganiza mi cerebro» / «reorganiza mi área de …» | Prepara un mapa compacto, propone la nueva jerarquía en una tabla y la aplica con tu sí (crea temas, mueve, renombra o archiva en un solo commit) |
| «Guarda este PDF» / «guarda este enlace» | Copia el original, crea su ficha y te ofrece compilarlo en tus notas |
| «Importa esta base de Notion» / «trae este documento de Drive» | Lista lo que hay, tú eliges qué, y lo trae sin tocar el original |
| «Pregúntale a mi cuaderno de la tesis…» / «crea una infografía del cuaderno X» | Usa NotebookLM y guarda el resultado en una nota |
| «¿Qué sé de anemia?» / «¿qué tengo en Finanzas?» | Responde con tus notas, citando cada una con `[[enlace]]` |
| «Revisión semanal» / «revisa mi vault» | Arma la semana y revisa enlaces rotos, notas sueltas o sin enlaces y datos vencidos |

Nada se importa ni se procesa solo, y nada se borra sin tu sí: lo terminado va al archivo.

## Cómo se ve tu vault

```text
00 │ 📥 Bandeja/            todo lo que entra, sin procesar (📝 notas, 📲 Telegram, 🗒️ Notion, 💻 sesiones…)
01 │ 🎯 Proyectos/          lo que termina: una carpeta por proyecto
   🎓 Tesis/
      🎓 Tesis.md          nota principal: objetivo, próximos pasos y el índice de su contenido
02 │ 🧭 Areas/              lo continuo: una carpeta por área, con temas anidados sin límite
   🩺 Medicina/
      🩺 Medicina.md       nota principal: sus proyectos y el índice de su contenido
      🫀 Cardiología/
         💔 Síndrome coronario agudo/
            🫀 Infarto agudo de miocardio.md
            📄 Guía ESC 2023.md      las fuentes van junto a lo que alimentan
03 │ 📅 Diario/             📅 2026-10-22.md (o 📅 22∕10∕26.md) y revisiones 🗓️ 2026-W43.md
04 │ 🗄️ Archivo/            por motivo: 🗑️ Descartes · ✅ Terminados · 💤 Inactivos · 📥 Bruto
05 │ ⚙️ Sistema/            🔥 hot · ✅ pendientes · 📜 bitácora · 🗂️ índice · 📎 adjuntos · 🧱 plantillas
AGENTS.md                 reglas del vault para cualquier agente
```

- **Todo es carpeta:** cada área, proyecto y tema tiene una nota principal del mismo nombre con el índice
  automático de lo que contiene. Así la jerarquía se navega por enlaces, y el grafo de Obsidian la muestra.
  Los temas se anidan sin límite de niveles. Para citar o enlazar entre áreas puedes usar `[[Nota]]` en el texto,
  `[[Nota#Sección]]`, enlaces a párrafos con `[[Nota#^id]]` y transclusiones con `![[Nota#Sección]]`. Para no ver
  la nota principal repetida en el explorador de Obsidian, se recomienda el plugin **Folder Notes** (ver instalación).
- **De bruto a procesado:** lo que entra se queda en la Bandeja hasta que pides procesarlo. La Bandeja nunca fuerza
  un destino para vaciarse: cada captura tiene destino claro (su carpeta), dudoso (con «¿?» y alternativa) o propone
  un área o proyecto nuevo (marcado 🆕). Si una captura pasa a ser la nota tal cual, se mueve; si se reescribe o se
  reparte en varias notas, el original queda en `04 │ 🗄️ Archivo/📥 Bruto/`, enlazado desde la nota.
- **Archivo por motivo:** nada se borra sin tu sí. `okt archivar` ubica lo archivado según su motivo, en vez de copiar
  la ruta completa: lo descartado de la Bandeja va a `🗑️ Descartes/` (sin subcarpetas por mes; si el nombre se repite,
  añade « 2»), un proyecto a `✅ Terminados/<proyecto>/`, y un área o un tema a `💤 Inactivos/<área>/<tema>/` (lo demás
  también a `💤 Inactivos/`, con su raíz sin número, como `💤 Inactivos/📅 Diario/`). Los originales en bruto ya
  procesados quedan en `📥 Bruto/` (`okt bruto limpiar` borra los viejos con tu sí). La migración reubica lo ya archivado.
- **Emojis:** en notas, temas, proyectos y áreas, la IA elige uno según el tema (🫀, 🐍, 💰); en lo demás, el CLI
  pone el del tipo (📄 fuente, 🔬 artículo, 📅 diario, 📲 Telegram…). Cada nota guarda su nombre sin emoji como alias,
  así que en Obsidian puedes buscar «Infarto» y la encuentra.
- **Propiedades justas:** `tipo`, `estado` (borrador o revisado), `resumen` y `fuentes`; nada de campos vacíos. El
  formato completo está en [references/contrato-vault.md](references/contrato-vault.md).
- El separador de las carpetas es `│` (línea fina, U+2502): la barra `|` no está permitida en los nombres de Windows.

## Instalación

### 1. Requisitos

| Necesitas | Windows | macOS | Linux |
|---|---|---|---|
| **Node.js 20 o superior** | `winget install OpenJS.NodeJS.LTS` | `brew install node` | el gestor de tu distribución o [nodejs.org](https://nodejs.org) |
| **Git** | `winget install Git.Git` | `brew install git` (o `xcode-select --install`) | `sudo apt install git` (o equivalente) |
| **Claude Code** (o Antigravity) | `npm install -g @anthropic-ai/claude-code` | igual | igual |
| **Obsidian** (recomendado) | `winget install Obsidian.Obsidian` | `brew install --cask obsidian` | AppImage o `flatpak install flathub md.obsidian.Obsidian` |

Comprueba con `node --version` (debe decir v20 o más) y `git --version`. Si acabas de instalarlos, cierra y vuelve
a abrir la terminal.

**Herramientas opcionales (para importar enlaces sin gastar tokens):**
- **Defuddle** (páginas web completas en Markdown con imágenes): `npm install -g defuddle`
- **yt-dlp** (subtítulos de YouTube sin descargar el video; usa Node): `uv tool install yt-dlp`

### 2. Instalar el plugin en Claude Code

Dentro de Claude Code:

```text
/plugin marketplace add Mack-Yilman/obsidian-knowledge-terminal
/plugin install obsidian-knowledge-terminal@obsidian-knowledge-terminal
```

Después **cierra y vuelve a abrir Claude Code**: los hooks del plugin se cargan al iniciar.

### 3. Crear tu vault

1. Crea (o elige) la carpeta donde vivirán tus notas, por ejemplo `Documentos/Segundo cerebro`. No uses la carpeta
   del plugin ni el escritorio entero.
2. Abre Claude Code **en esa carpeta** (`cd` a la carpeta y `claude`).
3. Pide: **«configura mi segundo cerebro»**.

El agente te hace unas pocas preguntas: a qué te dedicas, qué áreas tienes, qué proyectos llevas y si ya sabes qué
temas vas a usar. Con eso te muestra el árbol de carpetas que creará y espera tu sí. Crea también un historial de git
local (sin remoto) para que cualquier cambio de la IA se pueda deshacer. Luego te guía con Obsidian, el respaldo y
los conectores; puedes saltarte lo que no quieras. Más adelante puedes pedir «agrega un área», «crea un proyecto» o
«crea el tema X en Y».

### 4. Abrir el vault en Obsidian

En Obsidian: **«Abrir carpeta como bóveda»** y elige la carpeta del vault. OKT ya deja configurado dónde van los
adjuntos, las notas nuevas, el diario y las plantillas.

**Folder Notes (recomendado):** la nota principal de cada área, proyecto o tema se mantiene (lleva el índice
automático y es a la que apuntan los enlaces y el grafo, ya que Obsidian no enlaza carpetas). Para no verla
duplicada en el explorador, se recomienda el plugin de la comunidad **Folder Notes** (de LostPaul), configurado con
la nota *dentro* de la carpeta, el nombre `{{folder_name}}` y la opción de ocultar la nota de carpeta activada: al
hacer clic en la carpeta se abre directamente su nota.

### 5. Respaldo (recomendado)

Agrega la carpeta del vault a **Google Drive para escritorio** (Preferencias → Mi PC → Agregar carpeta → «Hacer copia
de seguridad en Google Drive») o a otro servicio de respaldo. El vault vive en tu PC y la nube solo guarda la copia:
no lo edites desde la web de Drive ni desde otra PC a la vez. El vault **no** se sube a GitHub.

### 6. Conectores (opcionales, solo los que uses)

| Para | Instala | Inicia sesión |
|---|---|---|
| NotebookLM | Primero `uv` ([docs.astral.sh/uv](https://docs.astral.sh/uv/)), luego `uv tool install notebooklm-mcp-cli` | `nlm login` |
| Notion | `npm install -g ntn` | `ntn login` |
| Google Docs y Drive | `npm install -g @googleworkspace/cli` | `gws auth login` |
| Páginas web (Defuddle) | `npm install -g defuddle` | — |
| YouTube (yt-dlp) | `uv tool install yt-dlp` | — |

La guía de NotebookLM está en [skills/notebooklm/references/instalacion.md](skills/notebooklm/references/instalacion.md).

### 7. Formato de Obsidian (opcional, recomendado)

[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills), del creador de Obsidian, enseña a la IA el
Markdown propio de Obsidian (callouts, propiedades, incrustaciones), Bases y Canvas. OKT funciona sin ellas. Pide
**«instala las skills de formato de Obsidian»** o hazlo a mano:

```text
claude plugin marketplace add kepano/obsidian-skills
claude plugin install obsidian@obsidian-skills
```

En Antigravity: `okt instalar obsidian-skills --aplicar`.

### 8. Antigravity (opcional)

Si también usas Antigravity, con el plugin ya instalado en Claude Code pide: **«instala OKT en Antigravity»**. Se
instala como **plugin de Antigravity** (aparece en `agy plugin list` con sus 6 skills), no como skills sueltas. Sin
Claude Code, clona el repositorio y ejecútalo a mano:

```bash
git clone https://github.com/Mack-Yilman/obsidian-knowledge-terminal.git
cd obsidian-knowledge-terminal
node scripts/okt.mjs instalar antigravity            # vista previa
node scripts/okt.mjs instalar antigravity --aplicar  # plugin en ~/.gemini/config/plugins/obsidian-knowledge-terminal, hooks y tarea del IDE
```

Con un vault ya creado, `instalar` deja lo necesario para que Antigravity baje Telegram y cargue el resumen
`🔥 hot.md` al empezar, como Claude Code:

| Producto de Antigravity | Cuándo baja Telegram y carga el resumen | Qué lo hace |
|---|---|---|
| App de escritorio y CLI (`agy`) | Al abrir una conversación nueva con el vault abierto | El hook de inicio del vault (`<vault>/.agents/hooks.json`) y el global (`~/.gemini/config/hooks.json`); el segundo no repite lo del primero |
| IDE | Al abrir la carpeta del vault | Una tarea de VS Code (`<vault>/.vscode/tasks.json`, `runOn: folderOpen`). La primera vez, el IDE pregunta si permites las tareas automáticas: elige «Permitir» |

Ningún producto tiene un evento al abrir la aplicación: lo más temprano es la primera conversación (o abrir la
carpeta, en el IDE). El hook del vault solo corre si el vault es una **carpeta de confianza** (acepta confiar en ella
la primera vez); el global funciona igual. Si creas el vault después, repite `instalar antigravity --aplicar`. El
`AGENTS.md` del vault orienta a cualquier otro agente (Codex, Cursor…).

### 9. Telegram (opcional)

Para mandar notas, voz, enlaces, fotos y tareas desde el celular, despliega el bot
[okt-telegram](https://github.com/Mack-Yilman/okt-telegram) siguiendo su README y luego pide: **«configura el bot de
Telegram»**. Más abajo está cómo funciona.

### 10. Comprobar

Pide **«revisa la configuración»** (o ejecuta `okt doctor --completo`): muestra lo que está listo y, para lo que
falta, el comando que lo resuelve.

## Primeros pasos

Abre tu agente en la carpeta del vault y prueba:
- «Guarda esta idea: el interés compuesto rinde más si empiezo antes».
- «Guarda este enlace en mi proyecto de tesis: https://…».
- «Procesa mi bandeja».
- «Pasa a limpio la última nota de voz».
- «¿Cómo va mi cerebro?» (bandeja, pendientes, proyectos en foco y el siguiente paso).

## Actualizar

- **Automático:** en los marketplaces de terceros, la actualización automática viene apagada. Se activa en
  `/plugin` → Marketplaces → «Enable auto-update».
- **A mano:** `claude plugin marketplace update obsidian-knowledge-terminal` y luego
  `claude plugin update obsidian-knowledge-terminal@obsidian-knowledge-terminal`. Reinicia Claude Code.
- **Antigravity:** después de cada actualización, repite `instalar antigravity --aplicar` (o pídeselo al agente);
  `okt doctor` avisa si la copia de Antigravity quedó en una versión anterior.
- **Desde una versión anterior (0.6 o más antigua):** la 0.7.0 numera las raíces de 00 a 05 y organiza el Archivo por
  motivo (y, desde la 0.4.0, el conocimiento vive en áreas y proyectos). Al abrir el vault, el agente te avisa y te
  propone migrar. Cierra Obsidian y pide **«migra mi vault»**: `okt migrar` muestra la vista previa (raíces que se
  renombran y archivos reubicados en el Archivo) y `okt migrar --aplicar` mueve todo (nada se borra), actualiza las
  rutas en `.obsidian`, los registros de `.cerebro/`, el texto de las notas y `AGENTS.md`, y deja un commit que se
  deshace con git. Desde la 0.3, las notas que no decían su área quedan en la Bandeja, con un pendiente para
  ubicarlas. Hasta migrar, los comandos que escriben en el vault se detienen.

## Usar el CLI a mano

Las skills llaman solas al CLI; no hace falta usarlo. Si quieres hacerlo, la ruta exacta está al final del
`AGENTS.md` de tu vault (`okt` significa `node "<ruta>/scripts/okt.mjs"`). Ejecútalo desde la carpeta del vault:

```bash
node "<ruta>/scripts/okt.mjs" ayuda                                  # lista de comandos
node "<ruta>/scripts/okt.mjs" estado                                 # áreas, proyectos, bandeja y pendientes
node "<ruta>/scripts/okt.mjs" tema nuevo "Medicina/🫀 Cardiología"    # una carpeta de tema
```

Comandos principales de importación y reorganización:
- `okt importar url "<enlace>" [--carpeta <destino>]`: detecta el tipo e importa sin gastar tokens:
  - **Web:** con **Defuddle** descarga la página completa en Markdown y sus imágenes (hasta 40) en `05 │ ⚙️ Sistema/📎 adjuntos/🌐 web/` (como `![[imagen]]`). Crea la nota `🌐 <título>` con `url`, `autor` y `publicado`.
  - **YouTube:** con **yt-dlp** (usa Node) extrae solo los subtítulos (manuales antes que automáticos y en idioma original). El video **no se descarga**: la nota `▶️ <título>` incrusta el reproductor arriba (`![](url)`, nativo en Obsidian) y contiene la transcripción en bruto por capítulos o en párrafos de un minuto con marcas de tiempo enlazadas. Si no tiene subtítulos, avisa y sugiere NotebookLM.
  - **Drive:** pasa por `okt importar drive`. Los videos de Drive **no se descargan**: se muestran con el reproductor de Drive (`<iframe>` de `/preview`) y un enlace «▶️ Abrir en Drive» (si es privado, el reproductor puede pedir iniciar sesión dentro de Obsidian; el enlace lo abre en el navegador). Docs, PDF e imágenes siguen igual.
  Sin `--carpeta`, la nota va a la Bandeja como captura; con `--carpeta`, queda como fuente en esa carpeta. Reimportar el mismo enlace actualiza la nota entre las marcas `okt`.
- `okt importar enlaces [--reintentar]`: completa en su lugar las capturas de la Bandeja que solo traen un enlace (las que llegan de Telegram). Si una falla, queda con la propiedad `importar_error` y no se reintenta sola; `--reintentar` la vuelve a intentar.
- `okt reorganizar preparar [--carpeta "<área o proyecto>"]`: genera un mapa compacto (el árbol y, por nota, su tipo, su resumen y sus enlaces de entrada y salida, sin el texto) para que la IA proponga la jerarquía nueva gastando pocos tokens.
- `okt reorganizar aplicar <plan.json>`: valida el plan entero antes de tocar nada (si algo no cuadra, no cambia nada), aplica en orden las operaciones `tema`, `mover`, `renombrar` y `archivar`, hace un solo commit y responde con el comando `git revert` para deshacerlo.

`--carpeta` acepta la ruta desde un área o un proyecto, sin la carpeta raíz ni los emojis (`"Medicina/Cardiología"`,
`"Tesis"`), así no tienes que escribir `│` ni emojis.

## Telegram (captura desde el celular)

Permite enviar notas, audios, enlaces, fotos y tareas a la Bandeja del vault desde el móvil mediante el bot
[okt-telegram](https://github.com/Mack-Yilman/okt-telegram). El bot solo encola en un Worker de Cloudflare con KV; el
vault permanece siempre en la PC y baja el contenido a pedido o al empezar a trabajar.

- `okt telegram config --url <worker> --token <OKT_TOKEN>`: guarda la conexión en `~/.config/okt/telegram.json` (sin
  opciones muestra la URL guardada; el token nunca se imprime).
- `okt telegram bajar`: baja todo, confirma lo escrito y cierra con bitácora + índices + commit del vault. Lo hacen
  solos el hook de Claude Code, los hooks de Antigravity y la tarea del IDE; también puedes pedir «baja lo de
  Telegram».
- `okt telegram descartar <id…>`: quita elementos de la cola sin escribirlos en el vault.

**Capacidad de la cola:**
- **Mensajes:** sin límite práctico; lo que no se baje en 30 días vence.
- **Archivos:** se quedan en Telegram hasta bajarlos, con hasta 20 MB cada uno (límite de la API de bots).
- **Tiempos:** cada archivo tarda unos 5 s en bajar. El hook (tope de 10 s) y la bajada a mano (tope de 3 min)
  dejan para la próxima vez los archivos que no alcanzan, sin error.

| Mensaje | En el Worker | En el vault (al bajar) |
|---|---|---|
| Texto o `/nota <texto>` | encola `tipo: nota` | `00 │ 📥 Bandeja/📲 AAAA-MM-DD HHmm <primeras palabras>.md` |
| Nota de voz o audio (≤ 10 min) | transcribe con Whisper de Workers AI (`@cf/openai/whisper-large-v3-turbo`, en español) y encola `tipo: voz` con el texto. El audio no se guarda. Si la transcripción falla, no encola y pide reenviar | captura con la transcripción, marcada como automática (pide «pásala a limpio» para corregirla) |
| Enlace (solo, o con un comentario de hasta 12 palabras) | encola `tipo: enlace` con `url` | captura en la Bandeja con la url; se completa en segundo plano al abrir el vault |
| Foto o documento (PDF u otro, ≤ 20 MB) con leyenda opcional | encola `tipo: archivo` con el `file_id` de Telegram (el archivo se queda en Telegram: no hay R2) | el archivo en `05 │ ⚙️ Sistema/📎 adjuntos/📲 telegram/` y una captura con `![[archivo]]` y la leyenda |
| `/tarea <texto>` (o `/tarea` sola: el bot pregunta y toma el siguiente mensaje) | encola `tipo: tarea` | `- [ ] texto` bajo `## Tareas` de la nota diaria de hoy (`03 │ 📅 Diario/📅 AAAA-MM-DD.md`) |
| `/estado`, `/start`, `/ayuda` | responde en Telegram (cuántos elementos esperan o ayuda) | — |

### Contrato de la cola

- **Elemento**: `{ id, tipo: "nota"|"voz"|"enlace"|"archivo"|"tarea", texto, url?, archivo_key?, nombre?, mime?, fecha, chat_id }`.
  - `id`: `AAAAMMDDTHHmmss-<update_id de 10 dígitos>` (fecha UTC del mensaje): ordena por fecha y un reintento de Telegram reescribe el mismo elemento.
  - `fecha`: ISO con zona (`2026-10-21T18:05:00-05:00`, hora de Lima).
  - `archivo_key`: el `file_id` de Telegram.
  - El plugin ignora campos que no conoce (por ejemplo, `sensible`, que traían los elementos de la 0.1.x).
- **Autenticación**: Todas las rutas de la API exigen `Authorization: Bearer <OKT_TOKEN>` (devuelve 401 si falta o no coincide).
- **Rutas**:
  - `GET /cola[?cursor=<c>]` → `{ elementos: [...], cursor: <c>|null }`, del más antiguo al más nuevo, 50 por página.
  - `GET /archivo/<file_id>` → los bytes del archivo (el Worker lo solicita a Telegram con `getFile`).
  - `POST /cola/confirmar` con `{ ids: [...] }` → `{ borrados: n }`. Solo se borra lo confirmado.
  - `POST /telegram`: webhook que exige la cabecera `X-Telegram-Bot-Api-Secret-Token` (403 si no coincide).
  - `GET /`: responde «OKT Telegram…» (sirve de ping).
- **Caducidad**: Lo no confirmado vence a los 30 días (TTL de KV).
- **Idempotencia**: El Worker ignora un `update_id` repetido (Telegram reintenta); el plugin guarda los ids escritos en `.cerebro/telegram.json` y no duplica si la confirmación falló.

## Respaldo y sincronización

El vault es una carpeta local con un **git local, sin remoto**: cada operación de la IA queda en un commit y se
puede deshacer. Para el respaldo, agrega la carpeta en **Google Drive para escritorio** (Preferencias → Mi PC →
Agregar carpeta → «Hacer copia de seguridad»), o usa otro servicio. El vault no se sube a GitHub.

## Automatización (sin gastar tokens)

En Claude Code, el plugin trae dos hooks que **no usan el modelo**:
- **Al iniciar** dentro del vault, carga el resumen `05 │ ⚙️ Sistema/🔥 hot.md` (proyectos en foco, actividad,
  pendientes y aprendizajes) y, si Telegram está configurado, baja la cola del bot (tope de 10 s; nunca frena la
  sesión). Si hay capturas con enlaces pendientes en la Bandeja (las que llegan de Telegram),
  se traen en un proceso aparte en segundo plano sin demorar la sesión: páginas web con Defuddle (Markdown e imágenes),
  subtítulos de YouTube con yt-dlp y enlaces de Drive con `gws` (los videos, sin descargarlos). Al decir «procesa mi bandeja», el contenido ya
  está listo, y la IA lo pasa a limpio con su perfil (una web solo se ordena).
- **Idioma:** de un video se toma primero la pista en español (también la del doblaje automático de YouTube, si lo
  tiene). Lo que llega en otro idioma lleva la propiedad `idioma` y, al procesar la Bandeja, la IA escribe la nota en
  español y deja el original en `📥 Bruto`. En Claude Code, con `okt config poner delegar agy`, esa traducción la hace
  Gemini Flash (Antigravity) y no gasta tu cuota de Claude; sin agy, o en Antigravity, la hace el mismo agente.
- **Al iniciar y al cerrar** una sesión en otra carpeta, sincroniza la **memoria de su agente** (ver abajo).

En **Antigravity**, los hooks de inicio (App y CLI) y la tarea del IDE hacen lo mismo (sección «Antigravity»).
Antigravity no tiene un hook de cierre: lo de una sesión se recoge al empezar la siguiente o al abrir el vault.

### Memoria de los agentes (opcional)

El `CLAUDE.md` (o `AGENTS.md`, `GEMINI.md`) de cada carpeta donde trabajas con un agente ya guarda lo importante:
decisiones, lo que descubriste, lo que corregiste y lo que falta. OKT puede traerlo a tu vault, sin usar el modelo.

El ajuste `memoria_agentes` (`okt config poner memoria_agentes <modo>`) decide qué llega:

| Modo | Carpeta nueva | Carpeta vinculada | Para quién |
|---|---|---|---|
| `detectar` | Deja en la Bandeja `🛠️ Carpeta nueva - <carpeta>`, que pregunta dónde va | Reflejo al día y ficha `💻` de avance por sesión | Quien programa con agentes y quiere todo |
| `vinculadas` | Nada (sin capturas automáticas) | Reflejo al día y ficha `💻` de avance por sesión | Quien solo sigue proyectos vinculados a mano |
| `no` | Nada | Nada (no se sincroniza ni se puede vincular) | Quien no usa agentes o no los quiere en el vault |

Se elige en la entrevista inicial (6.ª pregunta, solo si usas agentes; por defecto `no`) y se puede cambiar cuando
quieras. Un vault anterior a la 0.7.0 funciona como `vinculadas` hasta que elijas, y el hook de inicio pide al agente
que pregunte una vez.

Cómo funciona cuando está activa:
1. **Detección o vinculación:** en modo `detectar`, la primera vez que un agente trabaja en una carpeta con esa memoria
   (o en una subcarpeta), deja en la Bandeja `🛠️ Carpeta nueva - <nombre>`, que pregunta dónde seguirla (o si prefieres
   no recibir más estas capturas). Nada se copia hasta que respondes. Cada proyecto entra por separado (la carpeta con
   memoria más cercana o subcarpetas inmediatas con memoria propia); las carpetas superiores no se detectan solas, pero
   puedes vincularlas a mano. En modo `vinculadas`, vinculas directamente con `okt agentes vincular "<carpeta>" "<destino>"`.
2. **Al procesar la Bandeja**, la IA propone el destino: un proyecto si el trabajo termina, un área si es continuo o
   temporal, o una subcarpeta de otra ya vinculada. Con tu sí: `okt agentes vincular "<carpeta>" "<destino>"`.
3. **Desde entonces**, la nota `🛠️ <carpeta> - memoria del agente` refleja ese archivo en su carpeta del vault, y
   cada sesión con cambios deja en la Bandeja `💻 <fecha> <carpeta>` con **solo lo nuevo**: las líneas que se
   agregaron o se quitaron de la memoria y los commits nuevos. Al procesarla, lo que sirve más allá de esa carpeta
   pasa a una nota de su área, citando el espejo.

`okt agentes` lista las carpetas que sigue; `okt agentes ignorar "<carpeta>"` deja de preguntar por una, y
`okt config excluir <carpeta>` excluye las que se llamen así.

**Un solo vault para los dos agentes:** todo está en Markdown dentro del vault. Las reglas viven en `AGENTS.md`, que
el `CLAUDE.md` del vault importa; la memoria compartida, en la carpeta del sistema (`🔥 hot.md`, `📜 bitacora.md`,
`✅ pendientes.md`, `🗂️ indice.md`). Cada operación termina con `okt cerrar`, que hace un commit en el git local.
Lo que guarda Claude lo encuentra Antigravity, y al revés.

## Privacidad

- **El vault es tuyo y vive en tu PC:** OKT no filtra ni rechaza lo que guardes. Lo que pongas ahí lo ves tú (y tu
  respaldo).
- Lo que proceses con una IA sale a sus servidores: lo que delegues a Antigravity, a los de Google; lo que proceses
  con Claude, a los de Anthropic.
- Lo que mandas por Telegram pasa por Telegram y Cloudflare (KV y Workers AI) antes de llegar a tu PC.
- La memoria de un agente solo entra al vault si vinculas su carpeta; para que no pregunte por una:
  `okt agentes ignorar "<carpeta>"`.

## Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| «No encontré un vault de OKT aquí» | Abre el agente en la carpeta del vault (o en una subcarpeta) y vuelve a intentarlo |
| «Este vault usa una estructura anterior a OKT 0.7.0» | Cierra Obsidian y pide «migra mi vault» (`okt migrar`, luego `--aplicar`) |
| El agente no ve el plugin después de instalarlo | Cierra y vuelve a abrir Claude Code |
| «La sesión de NotebookLM venció» | `nlm login` |
| En Antigravity no aparece el aviso de Telegram ni el resumen | Repite `okt instalar antigravity --aplicar`; en el IDE, permite las tareas automáticas; `okt doctor` lo comprueba |
| Telegram: «El Worker rechazó el token» | Repite `okt telegram config --url … --token …` con el `OKT_TOKEN` del Worker |
| Un enlace `[[Anemia]]` sale roto | La nota se llama con su emoji (`[[🩸 Anemia]]`); `okt lint` sugiere el nombre correcto |
| EPERM al escribir en Windows | Ya está resuelto desde la 0.1.1 (archivos ocultos de Obsidian); si vuelve a pasar, abre un issue |

## Proyectos relacionados

- [okt-telegram](https://github.com/Mack-Yilman/okt-telegram): el bot para mandar notas, voz y enlaces desde el
  celular a la Bandeja del vault.
- [transcriptor-academico](https://github.com/Mack-Yilman/transcriptor-academico): la skill de apuntes de la que salen
  las reglas de redacción y el formato de índice y temas de «pasa a limpio».

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE): puedes usarlo, modificarlo y compartirlo **sin fines comerciales**. Uso
personal, educativo, de investigación y de organizaciones sin fines de lucro, públicas o de salud. Quien lo copie o
lo modifique debe conservar el aviso
`Required Notice: Copyright 2026 Mack Chirinos (https://github.com/Mack-Yilman/obsidian-knowledge-terminal)`
(ver [NOTICE](NOTICE)). Para citarlo, usa el botón «Cite this repository» ([CITATION.cff](CITATION.cff)).

Ideas adaptadas de proyectos MIT: ver [ATTRIBUTION.md](ATTRIBUTION.md).

Hecho por **Mack Chirinos**.
