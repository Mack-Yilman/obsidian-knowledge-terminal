# Cambios

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
