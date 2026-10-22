# Instalar y entender NotebookLM con OKT

OKT habla con NotebookLM mediante el CLI `nlm`, del paquete `notebooklm-mcp-cli`. NotebookLM no tiene API pública: `nlm` usa la sesión del navegador del usuario, así que el usuario inicia sesión una vez con su cuenta de Google.

## Instalación

1. **uv**, el instalador de herramientas de Python, si no está:
   - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
   - macOS o Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
2. **El CLI:** `uv tool install notebooklm-mcp-cli`. Instala `nlm` y el servidor MCP `notebooklm-mcp`, aislados y en el PATH.
3. **Iniciar sesión:** `nlm login`. Abre Chrome y el usuario entra con su cuenta de Google.
4. **Comprobar:** `nlm login --check` y `nlm doctor`. En OKT: `okt doctor --completo`.

Si la sesión vence (pasa cada cierto tiempo), basta con repetir `nlm login`.

## Las skills y el MCP de nlm (opcional)

`nlm` trae su propia skill para que el agente conozca todos sus comandos, además de un servidor MCP. OKT no los necesita, porque usa el CLI directamente, pero sirven para pedidos que OKT no cubre (crear cuadernos, agregar fuentes, compartir):

- **La skill:** `nlm skill list` muestra las herramientas compatibles y `nlm skill install <herramienta>` la instala. Por ejemplo, en Claude Code la skill queda en `~/.claude/skills/`, y en Antigravity en `~/.gemini/config/skills/nlm-skill/`.
- **El MCP:** `nlm setup` lo configura para un agente. Ojo: el MCP carga sus herramientas en cada sesión y eso gasta tokens; el CLI no.
- **Leer la skill sin instalarla:** `nlm skill show`.

## Qué hace OKT y qué no

| Hace | No hace |
|---|---|
| Lista cuadernos y vincula carpetas del vault con cuadernos | Crear o borrar cuadernos |
| Trae las notas que el usuario elige | Agregar o quitar fuentes |
| Pregunta al cuaderno y guarda la respuesta como nota | Compartir cuadernos |
| Crea contenidos de Studio, los descarga y los incrusta | Borrar contenidos de Studio |

Para lo que OKT no hace, usa `nlm` directamente o su skill, siempre con permiso del usuario cuando se crea, cambia o borra algo en NotebookLM.

## Trampas conocidas

- **Fuentes de PubMed y PMC por URL:** NotebookLM las guarda como la página de reCAPTCHA. Usa `https://doi.org/<doi>` o el PDF.
- **Windows:** si los acentos salen mal, `PYTHONIOENCODING=utf-8`. OKT ya lo define al llamar a `nlm`.
- **Studio tarda:** una infografía, de 1 a 5 minutos; un audio o un video, más. Si el comando deja el contenido en proceso, se descarga después con `okt notebooklm descargar <tipo>`.
