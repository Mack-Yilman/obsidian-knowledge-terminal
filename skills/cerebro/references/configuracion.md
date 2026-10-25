# Configuración paso a paso

Pide confirmación antes de cada instalación o cambio. Si el usuario ya tiene un paso listo, sáltalo.

## Obsidian

- **Windows:** `winget install Obsidian.Obsidian`. También se puede descargar desde https://obsidian.md/download.
- **macOS:** `brew install --cask obsidian` o la descarga.
- **Linux:** AppImage o Flatpak (`flatpak install flathub md.obsidian.Obsidian`).

Después: en Obsidian, «Abrir carpeta como bóveda» y elegir la carpeta del vault. OKT ya trae `.obsidian/` configurado (adjuntos en `99 │ ⚙️ Sistema/📎 adjuntos`, notas nuevas en `00 │ 📥 Bandeja`, plantillas en `99 │ ⚙️ Sistema/🧱 plantillas`, diario en `50 │ 📅 Diario`). `okt doctor` comprueba que Obsidian conozca el vault.

**Folder Notes (recomendado).** Cada área, proyecto y tema es una carpeta con una nota principal del mismo nombre: lleva el índice automático de la carpeta y es a la que apuntan los enlaces y el grafo, porque Obsidian no enlaza carpetas. Para no verla repetida en el explorador, instala el plugin de la comunidad **Folder Notes** (de LostPaul): en Obsidian, Configuración → Plugins de la comunidad → Explorar → «Folder notes» → Instalar y Activar. En sus opciones:
- **Ubicación de la nota:** dentro de la carpeta (*Inside the folder*);
- **Nombre:** `{{folder_name}}`;
- **Ocultar la nota de carpeta** en el explorador: activado.

Así, al hacer clic en la carpeta se abre su nota. Es opcional: sin el plugin, todo funciona igual. OKT no lo instala por su cuenta (es configuración de Obsidian del usuario).

## Respaldo con Google Drive para escritorio

El vault vive en la PC y Drive guarda la copia. **La copia en la nube no se edita**: es solo respaldo.

1. Instala Google Drive para escritorio: https://www.google.com/drive/download/
2. Abre Drive → rueda de configuración → **Preferencias** → **Mi PC** (o «Mi computadora») → **Agregar carpeta**.
3. Elige la carpeta del vault → marca **«Hacer copia de seguridad en Google Drive»** → Guardar.
4. Comprueba en drive.google.com → **Computadoras** que aparezca la carpeta.
5. Registra el respaldo: `okt config poner respaldo drive`.

Notas:
- La carpeta `.git` también se respalda: así el historial sobrevive aunque falle la PC.
- No abras ni edites el vault desde la web de Drive ni desde otra PC a la vez: genera conflictos.
- Otro respaldo (OneDrive, iCloud, Syncthing, un disco externo) también sirve: `okt config poner respaldo <nombre>`.

## Conectores (solo los que el usuario quiera)

| Conector | Instalar | Iniciar sesión | Comprobar |
|---|---|---|---|
| NotebookLM (`nlm`) | `uv tool install notebooklm-mcp-cli` (si no hay `uv`: https://docs.astral.sh/uv/) | `nlm login` (abre el navegador) | `nlm login --check` |
| Notion (`ntn`) | `npm install -g ntn` | `ntn login` | `ntn whoami` |
| Google Docs y Drive (`gws`) | `npm install -g @googleworkspace/cli` | `gws auth login` | `gws auth status` |
| Páginas web completas (`defuddle`) | `npm install -g defuddle` | (no hace falta) | `okt doctor` |
| Transcripciones de YouTube (`yt-dlp`) | `uv tool install yt-dlp` (usa Node, que ya está instalado) | (no hace falta) | `okt doctor` |

- **NotebookLM:** el detalle y las skills propias de `nlm` están en `<raíz>/skills/notebooklm/references/instalacion.md`.
- **Notion:** la integración de `ntn` solo ve las páginas compartidas con ella. Las vistas enlazadas (*linked views*) no son accesibles por la API: hay que abrir la base original.
- **Google:** OKT solo lee Drive. Las hojas de cálculo no se importan.

Al final: `okt doctor --completo` verifica las sesiones.

## Antigravity

`okt instalar antigravity` muestra qué hará: instalar OKT como **plugin de Antigravity** en `~/.gemini/config/plugins/obsidian-knowledge-terminal/` (con su `plugin.json` y sus 6 skills; `agy plugin list` lo muestra) y quitar las skills sueltas `okt-*` y la copia en `~/.okt/plugin` de las versiones anteriores. Con el sí del usuario, `okt instalar antigravity --aplicar`. Después de actualizar el plugin, se repite el comando.

Con el vault ya creado, `--aplicar` deja también lo que baja Telegram y carga `🔥 hot.md` al empezar, igual que en Claude Code:

| Dónde | Qué | Cuándo corre |
|---|---|---|
| `<vault>/.agents/hooks.json` | Hook de inicio (SessionStart) | Al abrir una conversación nueva en la App o la CLI de Antigravity con el vault abierto, si el vault es una **carpeta de confianza** (la primera vez, acepta confiar en ella) |
| `~/.gemini/config/hooks.json` | El mismo hook, global | Al abrir cualquier conversación en la App o la CLI: solo actúa si la carpeta abierta es el vault, y no repite lo que ya hizo el hook del vault en esa conversación |
| `<vault>/.vscode/tasks.json` | Tarea «OKT: bajar Telegram» (`runOn: folderOpen`) | Al abrir la carpeta del vault en el Antigravity IDE, que hoy no carga hooks. La primera vez, el IDE pregunta si se permiten las tareas automáticas: elige «Permitir» |

No hay evento al abrir la aplicación: lo más temprano es la primera conversación (o, en el IDE, abrir la carpeta).

Antigravity no tiene un hook de cierre: lo que cambió en la memoria de una carpeta de trabajo (su `CLAUDE.md` o `AGENTS.md`) se recoge al empezar la siguiente conversación, o al abrir el vault (`okt agentes sincronizar`). Nunca se copia el texto de los pedidos.

## Capa de formato (opcional)

`kepano/obsidian-skills` (de Steph Ango, creador de Obsidian; licencia MIT) enseña al agente el Markdown de Obsidian (callouts, propiedades, incrustaciones), Bases, Canvas y el CLI de Obsidian. Son solo skills de texto: no traen hooks ni scripts. `defuddle` y `knap` sugieren instalar su propio CLI con `npm` cuando el usuario las usa. OKT funciona sin ellas.

- **Claude Code:** `claude plugin marketplace add kepano/obsidian-skills` y `claude plugin install obsidian@obsidian-skills`. Se cargan al reiniciar.
- **Antigravity:** `okt instalar obsidian-skills` (vista previa) y, con su sí, `--aplicar`. Clona el repositorio en `~/.okt/obsidian-skills` y copia sus skills a `~/.gemini/config/skills/`. Repetirlo las actualiza.
- **Comprobar:** `okt doctor` muestra las dos instalaciones.

## Nota diaria

Por defecto se llama `📅 2026-10-22`. Con `okt config poner formato_diario DD/MM/YY` pasa a `📅 22∕10∕26`, con la barra de división `∕` (U+2215): la `/` no puede ir en un nombre de archivo y Obsidian crearía carpetas. El comando cambia también el formato de la nota diaria de Obsidian (`.obsidian/daily-notes.json`) para que el botón «Nota diaria» y OKT usen la misma nota.

## Telegram (opcional)

Permite enviar notas, notas de voz, enlaces, fotos y tareas desde el móvil mediante el bot [okt-telegram](https://github.com/Mack-Yilman/okt-telegram). El detalle completo de despliegue está en su README.

### Puesta en marcha

1. **Crear bot:** habla con `@BotFather` en Telegram (`/newbot`) y copia el token.
2. **Dependencias:** en el repositorio de okt-telegram, ejecuta `npm install` (en npm 11: `npm install-scripts approve esbuild workerd` y `npm rebuild esbuild workerd`).
3. **KV de Cloudflare:** crea el namespace con `npx wrangler kv namespace create COLA`. Copia `wrangler.jsonc` a `wrangler.local.jsonc` con el ID generado.
4. **Secretos:** copia `.dev.vars.example` a `.dev.vars` y define `TELEGRAM_TOKEN`, `WEBHOOK_SECRET` y `OKT_TOKEN` (claves aleatorias largas).
5. **Chat ID:** escribe `/start` a tu bot, ejecuta `node scripts/setup.mjs chat-id` e ingresa el ID en `CHAT_IDS` dentro de `.dev.vars`.
6. **Despliegue:** sube los secretos con `npx wrangler secret bulk .dev.vars -c wrangler.local.jsonc` y publica con `npx wrangler deploy -c wrangler.local.jsonc`.
7. **Webhook:** tras esperar ~60 s, vincula el webhook con `node scripts/setup.mjs webhook --url https://okt-telegram.<subdominio>.workers.dev` (`setup.mjs estado` revisa la configuración).
8. **Conectar en la PC:** registra la URL y el token en el plugin:
   ```bash
   okt telegram config --url https://okt-telegram.<subdominio>.workers.dev --token <OKT_TOKEN>
   ```

### Comprobación

- En Telegram: envía `/estado` al bot para ver cuántos elementos esperan en la cola.
- En la PC: ejecuta `okt telegram bajar` para descargar los elementos en `00 │ 📥 Bandeja/` y confirmar la recepción.
