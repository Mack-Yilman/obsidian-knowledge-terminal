# Protocolo de almacenamiento del vault

El vault crece sobre todo por **binarios**: audios y videos (NotebookLM, clases), PDF, libros, modelos de plugins y las
imágenes que traen los libros convertidos. El texto pesa poco. Este protocolo mantiene el vault liviano sin perder
conocimiento.

## 1. Qué guarda git y qué no

| Tipo | En git | Dónde queda el respaldo |
|---|---|---|
| Notas `.md`, `.canvas`, `.base`, configuración de Obsidian y de OKT | Sí | git (historial) y la nube del usuario |
| Imágenes (png, jpg, webp, svg…) | Sí | git y la nube |
| Audio, video, PDF, EPUB, MOBI, AZW3, modelos `.onnx`, comprimidos | **No** (bloque `# okt:binarios` del `.gitignore`) | Solo la nube del usuario (Drive, OneDrive…) y el disco |

**Por qué:** git sirve para deshacer lo que cambia (notas que editan las IA). Un binario casi nunca cambia: versionarlo
duplica su peso sin aportar nada. Un vault de 3 GB tenía la mitad en `.git` por audios de NotebookLM y modelos de voz.

- Un vault nuevo trae el bloque desde `okt init`. En uno anterior: `okt espacio git ignorar` (vista previa) y, con el
  sí del usuario, `--aplicar`. Los archivos **siguen en disco**; solo dejan de versionarse.
- Lo que el historial ya guarda se quita con `okt espacio git purgar` (ver sección 4).
- Si el usuario no tiene respaldo en la nube, díselo: los binarios fuera de git solo existen en su disco.

## 2. Cuándo revisar

- En la **revisión semanal**: `okt espacio --breve` (una línea). Si dice duplicadas, huérfanas o binarios rastreados,
  ofrece la limpieza.
- Cuando el usuario diga «limpia mi vault», «libera espacio», «cuánto pesa mi cerebro», o después de importar varios
  libros.
- Tras `okt libro`: la salida dice cuántas imágenes repetidas unificó y, si quedan imágenes pequeñas, propone revisarlas.

## 3. Limpiar imágenes y adjuntos (el LLM decide, el usuario aprueba)

1. `okt espacio` para el informe completo (no toca nada).
2. `okt espacio limpiar preparar [--carpeta "<ruta en adjuntos>"]` escribe el lote
   `.cerebro/cache/espacio/lote.json` con cuatro grupos:
   - `duplicados`: copias idénticas; se conserva una y los enlaces pasan a ella. No se pierde nada.
   - `huerfanas`: adjuntos que ninguna nota usa (solo dentro de `📎 adjuntos`).
   - `revisar`: imágenes pequeñas, con las notas que las incrustan.
   - `quitar` y `webp`: vacíos; los llenas tú.
3. **Mira cada imagen de `revisar`** (ábrela con tu herramienta de lectura de archivos) y decide:

   | Se quita (pásala a `quitar`) | Se conserva |
   |---|---|
   | Logos de editorial, sellos, adornos, separadores, viñetas, iconos decorativos, fondos | Portada, tablas, gráficos, esquemas, figuras, fotos clínicas, fórmulas, mapas |
   | Imágenes en blanco o de un solo color | Cualquier imagen con información que el texto no repite |

   Ante la duda, se conserva. Puedes vaciar cualquier grupo. Las PNG de más de 2 MB (infografías) pueden ir a `webp`:
   se convierten y solo se reemplazan si quedan más livianas.
4. Muestra al usuario un resumen (cuántas de cada grupo y cuánto se libera) y, con su sí:
   `okt espacio limpiar aplicar .cerebro/cache/espacio/lote.json`.
5. Lo eliminado va a `.trash/okt-<fecha>/` con `manifiesto.json` (nombre en la papelera → ruta original). Las notas se
   restauran con `git revert <hash>`; los archivos, copiándolos de vuelta según el manifiesto. Vaciar la papelera lo
   decide el usuario.

## 4. Purgar el historial de git (una vez, con mucho cuidado)

Solo después de `okt espacio git ignorar --aplicar`. Reescribe **todos** los commits sin los binarios; las notas y su
historia se conservan.

1. `okt espacio git purgar` (vista previa): cuántos binarios guarda el historial y cuánto pesa `.git`.
2. Pide al usuario que **cierre Obsidian** y **pause la sincronización de la nube**: si la nube abre los archivos de
   `.git` durante la purga, puede dejarlo a medias.
3. Con su sí: `okt espacio git purgar --aplicar` (si Drive sigue abierto pero en pausa, añade `--drive-pausado`). Antes
   de tocar nada deja un respaldo completo en `~/okt-respaldos/<vault>-<fecha>.bundle`.
4. Comprueba con `okt espacio` y `okt lint` que todo sigue bien. El usuario borra el respaldo cuando quiera.

## 5. Para que no vuelva a crecer

- Las grabaciones de clase no se copian al vault: van a NotebookLM (o a la nube) y la nota las enlaza.
- No copies a mano audios ni videos de NotebookLM dentro de carpetas del vault: usa `okt notebooklm descargar`, que los
  deja en `📎 adjuntos/🤖 notebooklm/`.
- `okt cerrar` compacta git solo cuando hace falta (`git gc --auto`).
