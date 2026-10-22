# Configuración paso a paso

Pide confirmación antes de cada instalación o cambio. Si el usuario ya tiene un paso listo, sáltalo.

## Obsidian

- **Windows:** `winget install Obsidian.Obsidian`. También se puede descargar desde https://obsidian.md/download.
- **macOS:** `brew install --cask obsidian` o la descarga.
- **Linux:** AppImage o Flatpak (`flatpak install flathub md.obsidian.Obsidian`).

Después: en Obsidian, «Abrir carpeta como bóveda» y elegir la carpeta del vault. OKT ya trae `.obsidian/` configurado (adjuntos en `40-Fuentes/adjuntos`, notas nuevas en `00-Bandeja/notas`, plantillas en `99-Sistema/plantillas`, diario en `50-Diario`). `okt doctor` comprueba que Obsidian conozca el vault.

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

- **NotebookLM:** el detalle y las skills propias de `nlm` están en `<raíz>/skills/notebooklm/references/instalacion.md`.
- **Notion:** la integración de `ntn` solo ve las páginas compartidas con ella. Las vistas enlazadas (*linked views*) no son accesibles por la API: hay que abrir la base original.
- **Google:** OKT solo lee Drive. Las hojas de cálculo no se importan.

Al final: `okt doctor --completo` verifica las sesiones.

## Antigravity

`okt instalar antigravity` muestra qué hará: copiar el plugin a `~/.okt/plugin` y las 5 skills a `~/.gemini/config/skills/okt-*`. Con el sí del usuario, `okt instalar antigravity --aplicar`. Después de actualizar el plugin, se repite el comando.

Antigravity no tiene hooks: sus sesiones se recogen en el lote con `okt sesiones agy`, que cuenta los pedidos y lee los cambios de git de cada carpeta sin copiar el texto de los pedidos.

## Capa de formato (opcional)

`kepano/obsidian-skills` (del CEO de Obsidian) enseña al agente Markdown de Obsidian, Bases y Canvas. En Claude Code: `/plugin marketplace add kepano/obsidian-skills` y `/plugin install obsidian@obsidian-skills`. Para otros agentes: `npx skills add https://github.com/kepano/obsidian-skills`. OKT funciona sin ella.
