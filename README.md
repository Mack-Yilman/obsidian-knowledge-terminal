# obsidian-knowledge-terminal (OKT)

**Un segundo cerebro en Obsidian que gestionas hablando con tu IA**, en Claude Code, en Antigravity o
en cualquier agente que lea skills. Guardas lo que aprendes (PDFs, páginas web, videos, apuntes de
Notion o de Google Docs, respuestas e infografías de NotebookLM, lo que resolviste en una sesión de
trabajo). La IA lo ordena en notas enlazadas y te responde citando tus propias notas.

Está pensado para gastar poco en tus planes (Claude Pro, Google One).
- **Lo mecánico lo hace un script, no el modelo:** índice, búsqueda, revisión, importaciones y fichas
  de sesión.
- **El arranque de cada sesión es corto:** el agente lee un resumen de 500 palabras como máximo, no
  todo el vault.
- **El orden se hace por lotes y a pedido**, y se puede delegar a Gemini Flash vía Antigravity.

## Qué puedes pedirle

| Dices… | Pasa |
|---|---|
| «Configura mi segundo cerebro» | Crea el vault en la carpeta abierta y te guía con Obsidian, el respaldo en Google Drive y los conectores |
| «Guarda este PDF» / «guarda este enlace» | Copia el original, crea su ficha y te ofrece compilarlo en tus notas |
| «Importa esta base de Notion» | Lista las páginas, tú eliges cuáles y trae solo su contenido (sin propiedades, Notion queda intacto) |
| «Trae este documento de Drive» | Exporta el Google Doc a Markdown o guarda el PDF con una nota que lo enlaza |
| «Pregúntale a mi cuaderno de la tesis…» | Consulta NotebookLM y guarda la respuesta con sus fuentes |
| «Crea una infografía del cuaderno X» | La crea en NotebookLM, la descarga y la muestra dentro de una nota |
| «¿Qué sé de anemia?» | Responde con tus notas, citando cada una con `[[enlace]]` |
| «Procesa mi bandeja» | Ordena lo pendiente: lo general a conocimiento, lo de cada proyecto como propuesta para su `CLAUDE.md` |
| «Revisión semanal» / «revisa mi vault» | Arma la semana y revisa enlaces rotos, notas huérfanas y datos vencidos |

Nada se importa ni se procesa solo, y nada se borra: lo terminado va a `90-Archivo/`.

## El vault

```text
00-Bandeja/       lo que entra sin procesar
10-Proyectos/     lo que tiene fin (una carpeta por proyecto)
20-Areas/         lo continuo (salud, estudios, trabajo…)
30-Conocimiento/  lo aprendido: conceptos, entidades, síntesis
40-Fuentes/       una ficha por fuente + los originales
50-Diario/        diario y revisiones semanales
90-Archivo/       lo terminado
99-Sistema/       contexto, bitácora, pendientes, índice
AGENTS.md         reglas del vault para cualquier agente
```

Cada nota lleva un frontmatter corto (`tipo`, `estado`, `resumen`, `fuentes`…), y cada afirmación su
fuente. Las contradicciones quedan a la vista, no se resuelven en silencio. El formato completo está
en [references/contrato-vault.md](references/contrato-vault.md).

## Instalación

Necesitas **Node 20+** y **Git**. Obsidian es opcional, pero recomendado.

### Claude Code

```text
/plugin marketplace add Mack-Yilman/obsidian-knowledge-terminal
/plugin install obsidian-knowledge-terminal@obsidian-knowledge-terminal
```

Después abre Claude Code **en la carpeta donde quieres tu vault** y pide: «configura mi segundo
cerebro».

**Actualizaciones:** en los marketplaces de terceros, la actualización automática viene apagada. Se
activa en `/plugin` → Marketplaces → «Enable auto-update». También se puede actualizar a mano:
`claude plugin marketplace update obsidian-knowledge-terminal` y luego
`claude plugin update obsidian-knowledge-terminal@obsidian-knowledge-terminal`.

### Antigravity (y otros agentes)

Con el plugin ya instalado en Claude Code, o desde una copia del repositorio:

```bash
node scripts/okt.mjs instalar antigravity            # vista previa
node scripts/okt.mjs instalar antigravity --aplicar  # copia el plugin a ~/.okt, las skills a ~/.gemini/config/skills y el hook al vault
```

Con un vault ya creado, `instalar` también deja en `<vault>/.agents/hooks.json` un hook **SessionStart**:
al abrir `agy` en el vault, baja Telegram y carga `hot.md`, igual que en Claude Code. Antigravity solo usa los
hooks de una **carpeta de confianza**: la primera vez que abras `agy` en el vault, acepta confiar en ella. Si
creas el vault después, repite `instalar antigravity --aplicar`.

Abre `agy` en la carpeta del vault y pide «¿cómo va mi cerebro?». El `AGENTS.md` del vault orienta a
cualquier otro agente (Codex, Cursor…).

### Conectores (opcionales)

| Para | Instala | Inicia sesión |
|---|---|---|
| NotebookLM | `uv tool install notebooklm-mcp-cli` | `nlm login` |
| Notion | `npm install -g ntn` | `ntn login` |
| Google Docs y Drive | `npm install -g @googleworkspace/cli` | `gws auth login` |

`okt doctor --completo` muestra qué falta. La guía de NotebookLM está en
[skills/notebooklm/references/instalacion.md](skills/notebooklm/references/instalacion.md).

## Telegram (captura desde el celular)

Permite enviar notas, audios, enlaces, fotos y tareas a la bandeja del vault desde el móvil mediante el bot [okt-telegram](https://github.com/Mack-Yilman/okt-telegram).
El bot solo encola en un Worker de Cloudflare con KV; el vault permanece siempre en la PC y baja el contenido a pedido o al iniciar sesión.

- `okt telegram config --url <worker> --token <OKT_TOKEN>`: guarda la conexión en `~/.config/okt/telegram.json` (sin opciones muestra la URL guardada; el token nunca se imprime).
- `okt telegram bajar [--forzar]`: baja todo, confirma lo escrito y cierra con bitácora + índice + commit del vault. Al abrir Claude Code o Antigravity en el vault, el hook lo hace solo; también puedes pedir «baja lo de Telegram».
- `okt telegram descartar <id…>`: quita elementos de la cola sin escribirlos en el vault.

**Capacidad de la cola:**
- **Mensajes:** sin límite práctico; lo que no se baje en 30 días vence.
- **Archivos:** se quedan en Telegram hasta bajarlos, con hasta 20 MB cada uno (límite de la API de bots).
- **Tiempos:** cada archivo tarda unos 5 s en bajar. El hook (tope de 10 s) y la bajada a mano (tope de 3 min)
  dejan para la próxima vez los archivos que no alcanzan, sin error.

| Mensaje | En el Worker | En el vault (al bajar) |
|---|---|---|
| Texto o `/nota <texto>` | encola `tipo: nota` | `00-Bandeja/telegram/AAAA-MM-DD HHmm <primeras palabras>.md` |
| Nota de voz o audio (≤ 10 min) | transcribe con Whisper de Workers AI (`@cf/openai/whisper-large-v3-turbo`, en español) y encola `tipo: voz` con el texto. El audio no se guarda. Si la transcripción falla, no encola y pide reenviar | nota con la transcripción, marcada como automática |
| Enlace (solo, o con un comentario de hasta 12 palabras) | encola `tipo: enlace` con `url` | nota «pendiente de ingerir» con la url, para la skill `capturar` |
| Foto o documento (PDF u otro, ≤ 20 MB) con leyenda opcional | encola `tipo: archivo` con el `file_id` de Telegram (el archivo se queda en Telegram: no hay R2) | el archivo en `40-Fuentes/adjuntos/telegram/` y una nota con `![[archivo]]` y la leyenda |
| `/tarea <texto>` (o `/tarea` sola: el bot pregunta y toma el siguiente mensaje) | encola `tipo: tarea` | `- [ ] texto` bajo `## Tareas` de la nota diaria de hoy (`50-Diario/AAAA-MM-DD.md`) |
| `/estado`, `/start`, `/ayuda` | responde en Telegram (cuántos elementos esperan o ayuda) | — |

### Contrato de la cola

- Elemento: `{ id, tipo: "nota"|"voz"|"enlace"|"archivo"|"tarea", texto, url?, archivo_key?, nombre?, mime?, fecha, chat_id, sensible? }`.
  - `id`: `AAAAMMDDTHHmmss-<update_id de 10 dígitos>` (fecha UTC del mensaje): ordena por fecha y un reintento de Telegram reescribe el mismo elemento.
  - `fecha`: ISO con zona (`2026-10-21T18:05:00-05:00`, hora de Lima).
  - `archivo_key`: el `file_id` de Telegram.
  - `sensible: true` si el texto parece traer datos de pacientes.
- Todas las rutas de la API piden `Authorization: Bearer <OKT_TOKEN>` (401 si falta o no coincide).
- `GET /cola[?cursor=<c>]` → `{ elementos: [...], cursor: <c>|null }`, del más antiguo al más nuevo, 50 por página.
- `GET /archivo/<file_id>` → los bytes del archivo (el Worker lo pide a Telegram con getFile).
- `POST /cola/confirmar` con `{ ids: [...] }` → `{ borrados: n }`. Solo se borra lo confirmado.
- Caducidad: lo no confirmado vence a los 30 días (TTL de KV).
- Idempotencia: el Worker ignora un `update_id` repetido (Telegram reintenta); el plugin guarda los ids escritos en `.cerebro/telegram.json` y no duplica si la confirmación falló.
- El webhook es `POST /telegram` y exige la cabecera `X-Telegram-Bot-Api-Secret-Token` (403 si no coincide).
- `GET /` responde «OKT Telegram…» (sirve de ping).

## Respaldo y sincronización

El vault es una carpeta local con un **git local, sin remoto**: cada operación de la IA queda en un
commit y se puede deshacer. Para el respaldo, agrega la carpeta en **Google Drive para escritorio**
(Preferencias → Mi PC → Agregar carpeta → «Hacer copia de seguridad»), o usa otro servicio. El vault
no se sube a GitHub.

## Automatización (sin gastar tokens)

En Claude Code, el plugin trae dos hooks que **no usan el modelo**:
- **Al iniciar** dentro del vault, carga el resumen `99-Sistema/hot.md`.
- **Al iniciar** dentro del vault, si Telegram está configurado, baja la cola del bot (tope de 10 s,
  nunca frena la sesión).
- **Al cerrar** una sesión en otro proyecto, anota una ficha en la bandeja con el proyecto, los
  commits y los archivos tocados. Nunca copia el contenido de los archivos ni nada que parezca un
  dato personal.

En **Antigravity**, el hook SessionStart del vault (lo instala `okt instalar antigravity --aplicar`) hace lo
mismo al abrir `agy` en el vault: carga `hot.md` y baja Telegram. Antigravity no tiene un hook de cierre: sus
fichas de sesión se recogen al procesar la bandeja (`okt sesiones agy`), sin copiar el texto de tus pedidos.

Para excluir un proyecto de las fichas: `okt config excluir <proyecto>`.

**Un solo vault para los dos agentes:** todo está en Markdown dentro del vault. Las reglas viven en
`AGENTS.md`, que el `CLAUDE.md` del vault importa; la memoria compartida, en `99-Sistema/` (`hot.md`,
`bitacora.md`, `pendientes.md`, `indice.md`). Cada operación termina con `okt cerrar`, que hace un commit en el
git local. Lo que guarda Claude lo encuentra Antigravity, y al revés.

## Privacidad

- El vault guarda **conocimiento, no datos de pacientes ni de terceros**. El lint los busca (DNI,
  historia clínica, celulares, «paciente Nombre Apellido»), y las importaciones se detienen si el
  contenido los trae.
- De Drive nunca se importan hojas de cálculo.
- Lo que delegues a Antigravity sale a los servidores de Google. Lo que proceses con Claude, a los de
  Anthropic.
- Lo que mandas pasa por Telegram y Cloudflare; los elementos que parecen datos de pacientes
  quedan retenidos.

## CLI

Todo lo mecánico está en `scripts/okt.mjs` (Node, sin dependencias). `node scripts/okt.mjs ayuda`
lista los comandos. Las skills lo llaman solas; no hace falta usarlo a mano.

## Proyectos relacionados

- [okt-telegram](https://github.com/Mack-Yilman/okt-telegram): un bot para mandar notas, voz y enlaces desde el celular a la
  bandeja del vault.

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE): puedes usarlo, modificarlo y compartirlo **sin fines
comerciales**. Uso personal, educativo, de investigación y de organizaciones sin fines de lucro,
públicas o de salud. Quien lo copie o lo modifique debe conservar el aviso
`Required Notice: Copyright 2026 Mack Chirinos (https://github.com/Mack-Yilman/obsidian-knowledge-terminal)`
(ver [NOTICE](NOTICE)). Para citarlo, usa el botón «Cite this repository» ([CITATION.cff](CITATION.cff)).

Ideas adaptadas de proyectos MIT: ver [ATTRIBUTION.md](ATTRIBUTION.md).

Hecho por **Mack Chirinos**.
