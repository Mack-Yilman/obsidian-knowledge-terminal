import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notionAObsidian } from '../scripts/lib/notion-markdown.mjs';

test('encabezado plegable: se quita {toggle} y su contenido deja de estar indentado', () => {
  const md = '## 🏠 **Tema 1** {toggle="true"}\n\t### 1.1 Intro\n\tTexto **clave**.\n\t- punto\n\t\t- subpunto\n\nOtro párrafo.';
  assert.equal(notionAObsidian(md), '## 🏠 **Tema 1**\n### 1.1 Intro\nTexto **clave**.\n- punto\n\t- subpunto\n\nOtro párrafo.');
});

test('una tabla o un details dentro de un encabezado plegable no corta el desindentado', () => {
  const md = '## Tema {toggle="true"}\n\tAntes.\n\t<table>\n\t<tr>\n\t<td>A</td>\n\t</tr>\n\t<tr>\n\t<td>1</td>\n\t</tr>\n\t</table>\n\t<details>\n\t<summary>Ver</summary>\n\t\tDentro\n\t</details>\n\tDespués.';
  assert.equal(notionAObsidian(md), '## Tema\nAntes.\n| A |\n| --- |\n| 1 |\n> [!note]- Ver\n> Dentro\nDespués.');
});

test('details pasa a callout plegable; los botones se omiten y los marcadores son enlaces', () => {
  const md = '<details>\n<summary>📎 Precio por m2</summary>\n\t<unknown url="https://app.notion.com/p/abc#1" alt="bookmark"/>\n</details>\n<unknown url="https://app.notion.com/p/abc#2" alt="button"/>\nFin.';
  assert.equal(notionAObsidian(md), '> [!note]- 📎 Precio por m2\n> [Marcador (ver en Notion)](https://app.notion.com/p/abc#1)\n\nFin.');
});

test('tabla HTML pasa a tabla Markdown, escapando las barras', () => {
  const md = '<table header-row="true">\n<tr>\n<td>Dimensión</td>\n<td>Resultado</td>\n</tr>\n<tr>\n<td>💼 Finanzas</td>\n<td>A | B</td>\n</tr>\n</table>';
  assert.equal(notionAObsidian(md), '| Dimensión | Resultado |\n| --- | --- |\n| 💼 Finanzas | A \\| B |');
});

test('callout, páginas, menciones y divisores repetidos', () => {
  const md = '<callout icon="💡">\n\tIdea importante\n</callout>\n---\n---\n<page url="https://app.notion.com/p/x">Subpágina</page> <mention-date start="2026-01-02"/>';
  assert.equal(notionAObsidian(md), '> [!note] 💡\n> Idea importante\n---\n[Subpágina](https://app.notion.com/p/x) 2026-01-02');
});
