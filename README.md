# 🧠 obsidian-knowledge-terminal (OKT)

**Un segundo cerebro en Obsidian que gestionas hablando con tu IA**, en Claude Code, en Antigravity o en cualquier
agente que lea skills. Guardas lo que aprendes (PDFs, páginas web, videos, apuntes de Notion o de Google Docs,
respuestas e infografías de NotebookLM, mensajes desde Telegram, lo que resolviste en una sesión de trabajo). La IA
lo ordena en notas enlazadas y te responde citando tus propias notas.

Está pensado para gastar poco en tus planes (Claude Pro, Google One):
- **Lo mecánico lo hace un script, no el modelo:** índice, búsqueda, revisión, importaciones, emojis y fichas de
  sesión.
- **El arranque de cada sesión es corto:** el agente lee un resumen de 500 palabras como máximo, no todo el vault.
- **El orden se hace por lotes y a pedido**, y se puede delegar a Gemini Flash vía Antigravity.

## Qué puedes pedirle

| Dices… | Pasa |
|---|---|
| «Configura mi segundo cerebro» | Crea el vault en la carpeta abierta y te guía con Obsidian, el respaldo en Google Drive y los conectores |
| «Guarda este PDF» / «guarda este enlace» | Copia el original, crea su ficha y te ofrece compilarlo en tus notas |
| «Importa esta base de Notion» | Lista las páginas, tú eliges cuáles y trae solo su contenido (sin propiedades; Notion queda intacto) |
| «Trae este documento de Drive» | Exporta el Google Doc a Markdown o guarda el PDF con una nota que lo enlaza |
| «Pregúntale a mi cuaderno de la tesis…» | Consulta NotebookLM y guarda la respuesta con sus fuentes |
| «Crea una infografía del cuaderno X» | La crea en NotebookLM, la descarga y la muestra dentro de una nota |
| «¿Qué sé de anemia?» | Responde con tus notas, citando cada una con `[[enlace]]` |
| «Procesa mi bandeja» / «baja lo de Telegram» | Ordena lo pendiente: lo general a conocimiento, lo de cada proyecto como propuesta para su `CLAUDE.md` |
| «Revisión semanal» / «revisa mi vault» | Arma la semana y revisa enlaces rotos, notas huérfanas, datos vencidos y notas sin emoji |
| «Cambia el emoji de Anemia» | Renombra la nota y actualiza todos sus enlaces |

Nada se importa ni se procesa solo, y nada se borra: lo terminado va al archivo.

## Cómo se ve tu vault

```text
00 │ 📥 Bandeja/          lo que entra sin procesar: 📝 notas · 💻 sesiones · 📦 importados · 📲 telegram
10 │ 🎯 Proyectos/        lo que tiene fin: una carpeta por proyecto (🐍 Curso de Python/🐍 Curso de Python.md)
20 │ 🧭 Areas/            lo continuo: 🩺 Medicina.md, 🌱 Personal.md…
30 │ 🧠 Conocimiento/     lo aprendido: 💡 conceptos · 🏷️ entidades · 🧩 sintesis
40 │ 📚 Fuentes/          una ficha por fuente (📄 o 🔬) + 📎 adjuntos con los originales
50 │ 📅 Diario/           📅 2026-10-22.md y revisiones 🗓️ 2026-W43.md
90 │ 🗄️ Archivo/          lo terminado
99 │ ⚙️ Sistema/          🔥 hot · 📜 bitácora · ✅ pendientes · 🗂️ índice · 🧱 plantillas
AGENTS.md               reglas del vault para cualquier agente
```

**Cada carpeta y cada nota empieza con un emoji:**
- en conceptos, entidades, síntesis, proyectos y áreas, la IA elige uno **según el tema** (🩸 Anemia ferropénica,
  🫀 Insuficiencia cardiaca, 🐍 Curso de Python);
- en lo demás, el CLI pone el **del tipo**: 📄 fuente, 🔬 artículo, 📅 diario, 📝 nota, 📲 Telegram, 💻 sesión,
  🗒️ Notion, ☁️ Drive, 🤖 NotebookLM.

Cada nota guarda también su nombre **sin** emoji como alias, así que en Obsidian puedes buscar «Anemia» y el
autocompletado la encuentra. El separador de las carpetas es `│` (línea fina, U+2502): la barra `|` no está
permitida en los nombres de Windows.

Cada nota lleva un frontmatter corto (`tipo`, `estado`, `resumen`, `fuentes`…), y cada afirmación, su fuente. Las
contradicciones quedan a la vista, no se resuelven en silencio. El formato completo está en
[references/contrato-vault.md](references/contrato-vault.md).

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

El agente te pregunta por tus áreas (salud, estudios, trabajo…), te muestra la lista de carpetas y archivos que
creará y espera tu sí. Crea también un historial de git local (sin remoto) para que cualquier cambio de la IA se
pueda deshacer. Luego te guía, paso a paso, con Obsidian, el respaldo y los conectores. Puedes saltarte lo que no
quieras.

### 4. Abrir el vault en Obsidian

En Obsidian: **«Abrir carpeta como bóveda»** y elige la carpeta del vault. OKT ya deja configurado dónde van los
adjuntos, las notas nuevas, el diario y las plantillas.

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

La guía de NotebookLM está en [skills/notebooklm/references/instalacion.md](skills/notebooklm/references/instalacion.md).

### 7. Antigravity (opcional)

Si también usas Antigravity, con el plugin ya instalado en Claude Code pide: **«instala las skills en
Antigravity»**. Sin Claude Code, clona el repositorio y ejecútalo a mano:

```bash
git clone https://github.com/Mack-Yilman/obsidian-knowledge-terminal.git
cd obsidian-knowledge-terminal
node scripts/okt.mjs instalar antigravity            # vista previa
node scripts/okt.mjs instalar antigravity --aplicar  # copia el plugin a ~/.okt, las skills a ~/.gemini/config/skills y el hook al vault
```

Con un vault ya creado, `instalar` deja en `<vault>/.agents/hooks.json` un hook de inicio: al abrir `agy` en el
vault, baja Telegram y carga el resumen `🔥 hot.md`, igual que en Claude Code. Antigravity solo usa los hooks de una
**carpeta de confianza**: la primera vez que abras `agy` en el vault, acepta confiar en ella. Si creas el vault
después, repite `instalar antigravity --aplicar`. El `AGENTS.md` del vault orienta a cualquier otro agente (Codex,
Cursor…).

### 8. Telegram (opcional)

Para mandar notas, voz, enlaces, fotos y tareas desde el celular, despliega el bot
[okt-telegram](https://github.com/Mack-Yilman/okt-telegram) siguiendo su README y luego pide: **«configura el bot de
Telegram»**. Más abajo está cómo funciona.

### 9. Comprobar

Pide **«revisa la configuración»** (o ejecuta `okt doctor --completo`): muestra lo que está listo y, para lo que
falta, el comando que lo resuelve.

## Primeros pasos

Abre tu agente en la carpeta del vault y prueba:
- «Guarda esta idea: la ferritina baja confirma la ferropenia».
- «Guarda este enlace: https://…».
- «¿Qué sé de anemia?».
- «¿Cómo va mi cerebro?» (bandeja, pendientes y el siguiente paso).

## Actualizar

- **Automático:** en los marketplaces de terceros, la actualización automática viene apagada. Se activa en
  `/plugin` → Marketplaces → «Enable auto-update».
- **A mano:** `claude plugin marketplace update obsidian-knowledge-terminal` y luego
  `claude plugin update obsidian-knowledge-terminal@obsidian-knowledge-terminal`. Reinicia Claude Code.
- **Antigravity:** después de cada actualización, repite `instalar antigravity --aplicar` (o pídeselo al agente).
- **Desde 0.2.x (vault sin emojis):** la 0.3.0 cambió los nombres de las carpetas y las notas. Al abrir el vault, el
  agente te avisa y te propone migrar. Cierra Obsidian y pide **«migra mi vault»**: `okt migrar` muestra qué cambia y
  `okt migrar --aplicar` mueve todo (nada se borra), actualiza los enlaces y deja un commit que se deshace con git.
  Hasta migrar, los comandos que escriben en el vault se detienen.

## Usar el CLI a mano

Las skills llaman solas al CLI; no hace falta usarlo. Si quieres hacerlo, la ruta exacta está al final del
`AGENTS.md` de tu vault (`okt` significa `node "<ruta>/scripts/okt.mjs"`). Ejecútalo desde la carpeta del vault:

```bash
node "<ruta>/scripts/okt.mjs" ayuda     # lista de comandos
node "<ruta>/scripts/okt.mjs" estado    # bandeja, pendientes y última actividad
```

`--carpeta` acepta nombres cortos (`proyectos/Tesis`, `importados`, `conceptos`), así no tienes que escribir `│` ni
emojis.

## Telegram (captura desde el celular)

Permite enviar notas, audios, enlaces, fotos y tareas a la bandeja del vault desde el móvil mediante el bot
[okt-telegram](https://github.com/Mack-Yilman/okt-telegram). El bot solo encola en un Worker de Cloudflare con KV; el
vault permanece siempre en la PC y baja el contenido a pedido o al iniciar sesión.

- `okt telegram config --url <worker> --token <OKT_TOKEN>`: guarda la conexión en `~/.config/okt/telegram.json` (sin
  opciones muestra la URL guardada; el token nunca se imprime).
- `okt telegram bajar`: baja todo, confirma lo escrito y cierra con bitácora + índice + commit del vault. Al abrir
  Claude Code o Antigravity en el vault, el hook lo hace solo; también puedes pedir «baja lo de Telegram».
- `okt telegram bajar --forzar <id…>`: escribe solo los elementos retenidos que nombras, después de comprobar que no
  son datos de pacientes (`--forzar todo` para todos). `okt estado` lista los retenidos con su id.
- `okt telegram descartar <id…>`: quita elementos de la cola sin escribirlos en el vault.

**Capacidad de la cola:**
- **Mensajes:** sin límite práctico; lo que no se baje en 30 días vence.
- **Archivos:** se quedan en Telegram hasta bajarlos, con hasta 20 MB cada uno (límite de la API de bots).
- **Tiempos:** cada archivo tarda unos 5 s en bajar. El hook (tope de 10 s) y la bajada a mano (tope de 3 min)
  dejan para la próxima vez los archivos que no alcanzan, sin error.

| Mensaje | En el Worker | En el vault (al bajar) |
|---|---|---|
| Texto o `/nota <texto>` | encola `tipo: nota` | `00 │ 📥 Bandeja/📲 telegram/📲 AAAA-MM-DD HHmm <primeras palabras>.md` |
| Nota de voz o audio (≤ 10 min) | transcribe con Whisper de Workers AI (`@cf/openai/whisper-large-v3-turbo`, en español) y encola `tipo: voz` con el texto. El audio no se guarda. Si la transcripción falla, no encola y pide reenviar | nota con la transcripción, marcada como automática |
| Enlace (solo, o con un comentario de hasta 12 palabras) | encola `tipo: enlace` con `url` | nota «pendiente de ingerir» con la url, para la skill `capturar` |
| Foto o documento (PDF u otro, ≤ 20 MB) con leyenda opcional | encola `tipo: archivo` con el `file_id` de Telegram (el archivo se queda en Telegram: no hay R2) | el archivo en `40 │ 📚 Fuentes/📎 adjuntos/📲 telegram/` y una nota con `![[archivo]]` y la leyenda |
| `/tarea <texto>` (o `/tarea` sola: el bot pregunta y toma el siguiente mensaje) | encola `tipo: tarea` | `- [ ] texto` bajo `## Tareas` de la nota diaria de hoy (`50 │ 📅 Diario/📅 AAAA-MM-DD.md`) |
| `/estado`, `/start`, `/ayuda` | responde en Telegram (cuántos elementos esperan o ayuda) | — |

### Contrato de la cola

- **Elemento**: `{ id, tipo: "nota"|"voz"|"enlace"|"archivo"|"tarea", texto, url?, archivo_key?, nombre?, mime?, fecha, chat_id, sensible? }`.
  - `id`: `AAAAMMDDTHHmmss-<update_id de 10 dígitos>` (fecha UTC del mensaje): ordena por fecha y un reintento de Telegram reescribe el mismo elemento.
  - `fecha`: ISO con zona (`2026-10-21T18:05:00-05:00`, hora de Lima).
  - `archivo_key`: el `file_id` de Telegram.
  - `sensible: true` si el texto parece traer datos de pacientes.
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
- **Al iniciar** dentro del vault, carga el resumen `99 │ ⚙️ Sistema/🔥 hot.md` y, si Telegram está configurado,
  baja la cola del bot (tope de 10 s; nunca frena la sesión).
- **Al cerrar** una sesión en otro proyecto, anota una ficha en la bandeja con el proyecto, los commits y los
  archivos tocados. Nunca copia el contenido de los archivos ni nada que parezca un dato personal.

En **Antigravity**, el hook de inicio del vault (lo instala `instalar antigravity --aplicar`) hace lo mismo al abrir
`agy` en el vault. Antigravity no tiene un hook de cierre: sus fichas de sesión se recogen al procesar la bandeja
(`okt sesiones agy`), sin copiar el texto de tus pedidos.

Para excluir un proyecto de las fichas: `okt config excluir <proyecto>`.

**Un solo vault para los dos agentes:** todo está en Markdown dentro del vault. Las reglas viven en `AGENTS.md`, que
el `CLAUDE.md` del vault importa; la memoria compartida, en la carpeta del sistema (`🔥 hot.md`, `📜 bitacora.md`,
`✅ pendientes.md`, `🗂️ indice.md`). Cada operación termina con `okt cerrar`, que hace un commit en el git local.
Lo que guarda Claude lo encuentra Antigravity, y al revés.

## Privacidad

- El vault guarda **conocimiento, no datos de pacientes ni de terceros**. El lint los busca (DNI, historia clínica,
  celulares, «paciente Nombre Apellido»), y las importaciones se detienen si el contenido los trae.
- De Drive nunca se importan hojas de cálculo. Los PDF e imágenes de Drive se revisan solo por el nombre, no por su
  contenido: revísalos tú antes de importarlos.
- Lo que delegues a Antigravity sale a los servidores de Google. Lo que proceses con Claude, a los de Anthropic.
- Lo que mandas por Telegram pasa por Telegram y Cloudflare; los elementos que parecen datos de pacientes quedan
  retenidos hasta que decidas.

## Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| «No encontré un vault de OKT aquí» | Abre el agente en la carpeta del vault (o en una subcarpeta) y vuelve a intentarlo |
| «Este vault usa la estructura anterior a OKT 0.3.0» | Cierra Obsidian y pide «migra mi vault» (`okt migrar`, luego `--aplicar`) |
| El agente no ve el plugin después de instalarlo | Cierra y vuelve a abrir Claude Code |
| «La sesión de NotebookLM venció» | `nlm login` |
| En Antigravity no aparece el aviso de Telegram ni el resumen | Acepta confiar en la carpeta del vault al abrir `agy`; `okt doctor` lo comprueba |
| Telegram: «El Worker rechazó el token» | Repite `okt telegram config --url … --token …` con el `OKT_TOKEN` del Worker |
| Un enlace `[[Anemia]]` sale roto | La nota se llama con su emoji (`[[🩸 Anemia]]`); `okt lint` sugiere el nombre correcto |
| EPERM al escribir en Windows | Ya está resuelto desde la 0.1.1 (archivos ocultos de Obsidian); si vuelve a pasar, abre un issue |

## Proyectos relacionados

- [okt-telegram](https://github.com/Mack-Yilman/okt-telegram): el bot para mandar notas, voz y enlaces desde el
  celular a la bandeja del vault.

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE): puedes usarlo, modificarlo y compartirlo **sin fines comerciales**. Uso
personal, educativo, de investigación y de organizaciones sin fines de lucro, públicas o de salud. Quien lo copie o
lo modifique debe conservar el aviso
`Required Notice: Copyright 2026 Mack Chirinos (https://github.com/Mack-Yilman/obsidian-knowledge-terminal)`
(ver [NOTICE](NOTICE)). Para citarlo, usa el botón «Cite this repository» ([CITATION.cff](CITATION.cff)).

Ideas adaptadas de proyectos MIT: ver [ATTRIBUTION.md](ATTRIBUTION.md).

Hecho por **Mack Chirinos**.
