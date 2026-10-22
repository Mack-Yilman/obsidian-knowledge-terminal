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
node scripts/okt.mjs instalar antigravity --aplicar  # copia el plugin a ~/.okt y las skills a ~/.gemini/config/skills
```

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

## Respaldo y sincronización

El vault es una carpeta local con un **git local, sin remoto**: cada operación de la IA queda en un
commit y se puede deshacer. Para el respaldo, agrega la carpeta en **Google Drive para escritorio**
(Preferencias → Mi PC → Agregar carpeta → «Hacer copia de seguridad»), o usa otro servicio. El vault
no se sube a GitHub.

## Automatización (sin gastar tokens)

En Claude Code, el plugin trae dos hooks que **no usan el modelo**:
- **Al iniciar** dentro del vault, carga el resumen `99-Sistema/hot.md`.
- **Al cerrar** una sesión en otro proyecto, anota una ficha en la bandeja con el proyecto, los
  commits y los archivos tocados. Nunca copia el contenido de los archivos ni nada que parezca un
  dato personal.

Para excluir un proyecto de las fichas: `okt config excluir <proyecto>`. Antigravity no tiene hooks:
sus sesiones se recogen al procesar la bandeja (`okt sesiones agy`), sin copiar el texto de tus
pedidos.

## Privacidad

- El vault guarda **conocimiento, no datos de pacientes ni de terceros**. El lint los busca (DNI,
  historia clínica, celulares, «paciente Nombre Apellido»), y las importaciones se detienen si el
  contenido los trae.
- De Drive nunca se importan hojas de cálculo.
- Lo que delegues a Antigravity sale a los servidores de Google. Lo que proceses con Claude, a los de
  Anthropic.

## CLI

Todo lo mecánico está en `scripts/okt.mjs` (Node, sin dependencias). `node scripts/okt.mjs ayuda`
lista los comandos. Las skills lo llaman solas; no hace falta usarlo a mano.

## Proyectos relacionados

- **okt-telegram** (próximamente): un bot para mandar notas, voz y enlaces desde el celular a la
  bandeja del vault.

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE): puedes usarlo, modificarlo y compartirlo **sin fines
comerciales**. Uso personal, educativo, de investigación y de organizaciones sin fines de lucro,
públicas o de salud. Quien lo copie o lo modifique debe conservar el aviso
`Required Notice: Copyright 2026 Mack Chirinos (https://github.com/Mack-Yilman/obsidian-knowledge-terminal)`
(ver [NOTICE](NOTICE)). Para citarlo, usa el botón «Cite this repository» ([CITATION.cff](CITATION.cff)).

Ideas adaptadas de proyectos MIT: ver [ATTRIBUTION.md](ATTRIBUTION.md).

Hecho por **Mack Chirinos**.
