# Cambios

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
