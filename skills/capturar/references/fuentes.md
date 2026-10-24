# Detalle por tipo de fuente

## PDF y papers

- `okt adjuntar "<ruta>"` copia el archivo a `99 │ ⚙️ Sistema/📎 adjuntos/📕 pdf/` sin tocar el original. Calcula su huella (SHA-256): si ese mismo archivo ya estaba, avisa y devuelve el nombre existente.
- La ficha (`okt nota nueva articulo "<título>" --origen pdf --adjunto "<nombre.pdf>" --autor "…" --publicado AAAA --carpeta "<tema>"`, sin `--carpeta` si aún no sabes dónde va) se completa leyendo el PDF por partes: resumen, introducción, métodos, resultados y discusión. No hace falta leerlo entero.
- **TL;DR:** 2 o 3 líneas.
- **Puntos clave:** cada uno con la página o sección de donde sale («p. 4», «Tabla 2»).
- **Resultados:** se copian las cifras exactas, sin redondear.
- Lo que interpretes tú va con `^[inferido]`.

## Web

- Lee la página con la herramienta web de tu agente: WebFetch en Claude, la lectura de URL en Antigravity.
- La ficha lleva `url`, la fecha de consulta en `## Notas` y lo esencial en `## Puntos clave`. No pegues la página completa.
- Si la página tiene muro de pago o no carga, crea la ficha igual, con la URL, y anota «sin acceso al contenido».

## YouTube

Elige según lo que haya, en este orden:
1. **Si el usuario usa NotebookLM:** agrega el video como fuente de un cuaderno y pregúntale ahí (skill `notebooklm`). Es lo más barato en tokens.
2. **Si `yt-dlp` está instalado:** `yt-dlp --skip-download --write-auto-subs --sub-langs "es.*,en.*" --convert-subs srt -o "<carpeta temporal>/%(id)s" "<url>"` y resume los subtítulos. Ignora los saludos y la charla.
3. **Si no hay ninguna de las dos:** crea la ficha con la URL y lo que el usuario cuente, y deja un pendiente para completarla.

## Notion

- **El enlace:** «Copiar enlace» de la página o de la base. Si el enlace lleva `?v=`, es una base.
- **Qué se copia:** solo el contenido. Las imágenes alojadas en Notion se descargan a `99 │ ⚙️ Sistema/📎 adjuntos/🗒️ notion/`, porque sus URL caducan en una hora; las imágenes externas quedan enlazadas.
- **Error 404 o «has no data sources»:** suele ser una vista enlazada (una base incrustada que muestra otra) o una página no compartida con la integración de `ntn`. Navega por las páginas relacionadas que muestra la vista previa o pide el enlace de la base original.
- **Cursos con módulos y capítulos:** se navega por las relaciones. Por ejemplo, Curso → «Módulos» → «Capítulos». Importa los capítulos con `--seleccion` y `--carpeta "<curso>"` (el proyecto del curso), o déjalos en la Bandeja para ordenarlos en temas al procesarla.
- **Conversión:** los encabezados plegables, los `<details>` (que pasan a *callouts* plegables), las tablas y los marcadores se convierten a Markdown de Obsidian. Los botones de Notion se omiten.

## Google Docs y Drive

- **El enlace:** «Compartir → Copiar enlace». Un Doc se exporta a Markdown. Un PDF, una imagen o un Word se guarda en `99 │ ⚙️ Sistema/📎 adjuntos/☁️ drive/` con una nota que lo enlaza.
- **Una carpeta:** se lista y el usuario elige qué importar.
- **Hojas de cálculo:** no se importan, porque Drive solo exporta la primera pestaña como texto. Que el usuario la descargue como PDF o la pase a un Doc.
