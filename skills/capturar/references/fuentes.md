# Detalle por tipo de fuente

## PDF y papers

- `okt adjuntar "<ruta>"` copia el archivo a `99 │ ⚙️ Sistema/📎 adjuntos/📕 pdf/` sin tocar el original. Calcula su huella (SHA-256): si ese mismo archivo ya estaba, avisa y devuelve el nombre existente.
- La ficha (`okt nota nueva articulo "<título>" --origen pdf --adjunto "<nombre.pdf>" --autor "…" --publicado AAAA --carpeta "<tema>"`, sin `--carpeta` si aún no sabes dónde va) se completa leyendo el PDF por partes: resumen, introducción, métodos, resultados y discusión. No hace falta leerlo entero.
- **TL;DR:** 2 o 3 líneas.
- **Puntos clave:** cada uno con la página o sección de donde sale («p. 4», «Tabla 2»).
- **Resultados:** se copian las cifras exactas, sin redondear.
- Lo que interpretes tú va con `^[inferido]`.

## Web y YouTube: `okt importar url`

Lo trae un script, sin pasar por ti: no gastes tokens leyendo la página ni el video.

- **Web:** `okt importar url "<url>"` usa Defuddle (el motor de Obsidian Web Clipper; `npm install -g defuddle`). Trae la página completa en Markdown y descarga sus imágenes a `99 │ ⚙️ Sistema/📎 adjuntos/🌐 web/`. La nota es `🌐 <título>`, con `url`, `autor` y `publicado`.
- **YouTube:** usa yt-dlp (`uv tool install yt-dlp`) y trae solo los subtítulos, sin descargar el video. La nota `▶️ <título>` muestra el video arriba y la transcripción en bruto, por capítulos y en párrafos de un minuto, con la marca de tiempo enlazada a ese momento del video. Elige primero una pista en español (subtítulos manuales o la voz en español, también la de un doblaje automático de YouTube, que el encabezado señala); si no hay, la del idioma del video. YouTube no deja bajar sus traducciones automáticas (responde 429).
- **En otro idioma:** la nota lleva la propiedad `idioma` (por ejemplo, `idioma: en`) y se traduce al español al procesar la Bandeja (skill `mantener`).
- **Sin `--carpeta`** va a la Bandeja; con `--carpeta`, es una fuente en esa carpeta. Volver a importar el mismo enlace actualiza la misma nota.
- **Lo que llega de Telegram:** las capturas que solo traen un enlace se completan solas al abrir el vault (un proceso en segundo plano), o con `okt importar enlaces`.
- **Si falla** (muro de pago, una página que se arma con JavaScript, un video sin subtítulos): la nota lo dice o queda con `importar_error`. Ofrece la alternativa: para una web, tu herramienta web (WebFetch en Claude, la lectura de URL en Antigravity), con la ficha `okt nota nueva fuente "<título>" --origen web --url "<url>"`; para un video sin subtítulos, agregarlo como fuente de un cuaderno de NotebookLM (skill `notebooklm`), que lo transcribe.
- **Al procesarlo** (skill `mantener`), ese bruto se ordena con las reglas de `redactar` en modo «ordenar»: encabezados por tema, sin la charla ni los saludos del video. Pasarlo a limpio, solo si el usuario lo pide.
- **Si falta la herramienta:** el error dice cómo instalarla; `okt doctor` muestra cuáles están.

## Notion

- **El enlace:** «Copiar enlace» de la página o de la base. Si el enlace lleva `?v=`, es una base.
- **Qué se copia:** solo el contenido. Las imágenes alojadas en Notion se descargan a `99 │ ⚙️ Sistema/📎 adjuntos/🗒️ notion/`, porque sus URL caducan en una hora; las imágenes externas quedan enlazadas.
- **Error 404 o «has no data sources»:** suele ser una vista enlazada (una base incrustada que muestra otra) o una página no compartida con la integración de `ntn`. Navega por las páginas relacionadas que muestra la vista previa o pide el enlace de la base original.
- **Cursos con módulos y capítulos:** se navega por las relaciones. Por ejemplo, Curso → «Módulos» → «Capítulos». Importa los capítulos con `--seleccion` y `--carpeta "<curso>"` (el proyecto del curso), o déjalos en la Bandeja para ordenarlos en temas al procesarla.
- **Conversión:** los encabezados plegables, los `<details>` (que pasan a *callouts* plegables), las tablas y los marcadores se convierten a Markdown de Obsidian. Los botones de Notion se omiten.

## Google Docs y Drive

- **El enlace:** «Compartir → Copiar enlace». Un Doc se exporta a Markdown. Un PDF, una imagen o un Word se guarda en `99 │ ⚙️ Sistema/📎 adjuntos/☁️ drive/` con una nota que lo enlaza.
- **Un video no se descarga:** la nota lo muestra con el reproductor de Drive y un enlace «▶️ Abrir en Drive». Si el video es privado, el reproductor puede pedir iniciar sesión dentro de Obsidian: el enlace lo abre en el navegador.
- **Una carpeta:** se lista y el usuario elige qué importar.
- **Hojas de cálculo:** no se importan, porque Drive solo exporta la primera pestaña como texto. Que el usuario la descargue como PDF o la pase a un Doc.
