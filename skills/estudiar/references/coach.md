# Cómo trabaja el tutor

Referencia de la skill `estudiar`. Los formatos están en `<raíz>/references/contrato-estudio.md` y la evidencia, en
`<raíz>/references/evidencia-estudio.md`. Todo lo que se guarda pasa por `okt estudio …`.

## 1. Entrevista inicial

Objetivo: un plan que el usuario pueda sostener, sin saturarlo de decisiones. Una pregunta a la vez; si ya lo dijo, no
lo vuelvas a preguntar.

1. **La meta:** «¿Qué quieres aprender o aprobar, y tiene fecha?». Con fecha → `--tipo examen --fecha AAAA-MM-DD`; sin
   fecha (un curso, una rotación, un tema de interés) → `--tipo continuo`. Si la fecha es aproximada («abril»), propón
   un día y dile que se cambia cuando sepa la oficial.
2. **El temario:** propón entre 15 y 60 temas de un tamaño que quepa en una sesión (uno o dos capítulos, una clase), cada
   uno con peso 1–5 (lo que más cae pesa más). Sácalos de lo que diga, de su temario oficial, de su vault
   (`okt buscar`, el árbol de `05 │ ⚙️ Sistema/🗂️ indice.md`) o de los temas de un curso que ya tiene como proyecto.
   Enséñalos como tabla y espera su sí. `okt estudio meta agregar "<título>" --tipo … --temario "Tema:peso,…"`.
3. **El tiempo:** minutos **netos** de estudio de lunes a viernes y de fin de semana (sin traslados ni guardias), días
   sin estudio que ya conozca, y si usa RemNote y cuántos minutos le da al día.
4. **Cómo estudia hoy:** las 10 preguntas de `evidencia-estudio.md` («Cuestionario breve para la entrevista»), en 3
   bloques (1–3, 4–7, 8–10), con sus opciones a–d tal cual. `okt estudio perfil --minutos-laborable N --minutos-fin N
   --remnote N [--dias-libres …] --cuestionario "1b,2a,…"`.
5. **El plan:** `okt estudio plan generar`. Muestra el diagnóstico (solo hallazgo y recomendación) y el plan de hoy y
   mañana. Explica en 3 líneas cómo funciona: cada día dice qué hacer y con qué herramienta, lo no hecho se mueve solo,
   y los repasos de 3 minutos son recuerdo libre.

Para cada tema, la pregunta del recuerdo libre, la `canonica` y la rúbrica se escriben **la primera vez que se repasa**
(sección 3.1), no en la entrevista.

## 2. El plan de cada día

- `okt estudio plan hoy` lo muestra (y lo regenera si es de otro día). Preséntalo como lista: `☐ RemNote (20 min)`,
  `☐ Repaso libre: Asma (3 min)`, … con el id entre paréntesis solo si va a marcarlo.
- Cada bloque es una acción con su herramienta: RemNote (tarjetas vencidas), repaso (recuerdo libre aquí), banqueo
  (preguntas en su app o banco), lectura o clase (si trae la grabación, `okt clase preparar`), NotebookLM (quiz o
  audio del cuaderno del tema) y simulacro.
- Lo que marca se registra con `okt estudio plan marcar <bloque> hecho|saltado`. Al día siguiente, el plan mueve lo no
  hecho una vez (dos como máximo) y avisa. No lo reprogrames tú a mano.

## 3. Repaso de recuerdo libre

Se hace con los temas de `okt estudio repasos` (los que aún se salvan van primero) o con el que pida el usuario. Es
mejor intercalar temas distintos que repetir uno.

### 3.1 Preparar el tema (solo la primera vez, antes de preguntar)

Antes de dar la pregunta, mira el tema en `okt estudio tema listar --json`. Si le falta `pregunta`, `canonica` o
`rubrica`:

1. Lee su nota del vault (`okt buscar "<tema>"`) y escribe:
   - **pregunta:** una consigna abierta que se responda en 2–4 minutos («Explica la fisiopatología, la clínica y el
     manejo inicial de…»);
   - **canonica:** la respuesta de referencia, con el mecanismo, en 3–6 frases, fiel a sus notas; verifica en PubMed o
     Perplexity lo dudoso o lo que pudo cambiar en las guías;
   - **rubrica:** 3 o 4 criterios, cada uno algo que la pregunta pide **explícitamente** y la canónica explica.
2. Guárdalo con `okt estudio tema editar <tema-id> --pregunta "…" --canonica "…" --rubrica "a|b|c"` **sin mostrarle
   la canónica ni la rúbrica** (serían la respuesta). Después del repaso puede leerlas y pedir cambios.

### 3.2 El turno del usuario

1. Dale **solo la pregunta**. Nada de pistas, opciones ni la canónica.
2. Que responda de memoria, sin mirar sus notas, en 2–4 minutos (puede dictar o escribir).
3. Apenas termine, la **confianza**: «¿Qué tan seguro estás? 90 segurísimo · 70 bastante · 50 medio · 25 adivinando»
   (u omitir). Antes de esto, ni un comentario sobre su respuesta: ni «muy bien», ni «casi».
4. Guarda su respuesta **literal** en un archivo temporal fuera del vault y
   `okt estudio calificar preparar --tema <tema-id> --respuesta <archivo> [--confianza N]`. Devuelve el id del paquete
   (`cal-…`) y su carpeta.

### 3.3 El evaluador ciego

El evaluador solo ve `paquete.json` (concepto, pregunta, canónica, rúbrica y respuesta): ni el diálogo ni la confianza.
Elige el primero que puedas usar:

1. **Claude Code con `delegar: agy`** en `okt config` y la skill `delegar-antigravity`: un encargo con el texto de
   abajo, `--cwd` = la carpeta del paquete (`datos.carpeta` de `calificar preparar`), `--modelo hydrogen-medium`,
   `--modo lectura` y `--esquema "<raíz>/references/recibo.schema.json"`. El recibo queda en su `respuesta.json`.
2. **Claude Code sin agy:** un subagente (herramienta Agent) al que le pasas **solo** el texto de abajo y el contenido
   de `paquete.json`. Te devuelve el JSON del recibo.
3. **Otro agente sin subagentes:** califica tú en un turno aparte, mirando solo `paquete.json` y no la conversación, y
   pon `"evaluador": "agente"`.

Texto para el evaluador (cópialo tal cual):

> Eres un evaluador ciego de recuerdo libre. Lee `paquete.json`. Juzga la `respuesta` contra la `canonica`, criterio
> por criterio de la `rubrica`, por su significado y no por palabras sueltas. Anota primero lo que falta o está mal. Un
> criterio con dos partes se cumple solo si están las dos. Ante la duda entre dos calificaciones, la más baja. La
> fluidez y el entusiasmo no suben la nota. `recordado` = cumple todos los criterios sin errores; `parcial` = está la
> idea central pero falta algún criterio o hay un error; `fallado` = falta la idea central, está mal o no sabe. En
> `errores`, cada idea equivocada en una frase. En `pregunta_incompleta`, los números (desde 1) de los criterios que la
> pregunta no pedía; eso no sube la nota. Devuelve solo este JSON: `{"version":1,"paquete":"<id>","calificacion":
> "recordado|parcial|fallado","criterios":[{"criterio":"…","cumple":true,"nota":"…"}],"errores":[],
> "pregunta_incompleta":[],"comentario":"<una frase accionable, sin elogios>","evaluador":"agy|subagente|agente"}`.

Guarda el recibo en un archivo temporal fuera del vault y `okt estudio calificar aplicar <paquete-id> --recibo <archivo>`
(el id `cal-…` que devolvió `calificar preparar`).

**Si algo falla:** si agy o el subagente no responde o falla, pasa a la siguiente opción de la lista. Si
`calificar aplicar` rechaza el recibo por su formato, corrige solo la estructura del JSON (nunca la calificación) y
vuelve a aplicarlo; si sigue fallando, `okt reportar error` y dile al usuario que su respuesta quedó guardada en el
paquete para calificarla después.

### 3.4 Después del recibo

- Di la calificación y el `comentario`, y luego **lo que faltó**, contrastado con la canónica (no se la leas entera).
- **Fallado con confianza ≥ 70** (error con alta seguridad): detente en ese tema. Contrasta su idea con la correcta,
  pide que lo explique otra vez con sus palabras desde el mecanismo y registra el error
  (`okt estudio registrar error --tema <id> [--tipo <ID>]`). Estos son los errores que más conviene corregir.
  Esa re-explicación inmediata es formativa y no se califica; la nueva calificación llega con el reintento de abajo.
- **Fallado:** recuperación hasta el criterio. Re-enseña la brecha en 3–5 frases, pasa a
  **otro** tema y al terminarlo vuelve a preguntar el primero (máximo 3 vueltas). Los reintentos del mismo día se
  califican igual a ciegas, quedan como reintento y no mueven el calendario.
- `pregunta_incompleta` no vacía: explica que la falla fue de la pregunta y corrígela (`okt estudio tema editar`).
- Si un tema falla dos veces seguidas en días distintos, cambia la forma de enseñarlo: un caso clínico, una tabla
  comparativa con el tema con que se confunde (`contrasta_con`) o un esquema del mecanismo.

## 4. Errores, diagnóstico y tarjetas de RemNote

- **Examen diagnóstico de un tema:** `okt notebooklm crear quiz --cuaderno "<cuaderno del tema>"` y
  `okt notebooklm descargar quiz`; tómaselo aquí pregunta por pregunta. Registra el total con
  `okt estudio registrar examen "Quiz <tema>" --aciertos A --total N --por-tema "<id>:A/N" --fuente notebooklm`.
- **Solo lo fallado se vuelve tarjeta** (RemNote lleva las tarjetas; el tutor, los temas). Por cada error:
  `okt estudio registrar error --tema <id> [--tipo <ID>] [--pregunta "<resumen>"] --flashcard remnote|pegar|no`.
  El `--tipo` es el id de la taxonomía de 14 tipos de error de la skill `clinical-logic-mentor` (por ejemplo,
  `C-CON-03`) si el usuario la usa; si no, se omite.
- **La tarjeta:** una sola idea, pregunta corta y respuesta corta, con el porqué en una línea (el formato de
  `clinical-logic-mentor` si el usuario lo usa). Si está conectado el MCP de RemNote, ofrécele crearla con
  `create_doc` en su carpeta de tarjetas (con su sí); si no, dásela lista para pegar.

## 5. Revisar sus tarjetas de RemNote

El usuario sube sus tarjetas a RemNote (a veces las crea con otra herramienta). Con el MCP de RemNote:
`find_edited_docs` (lo editado hace poco) o `search_docs` (por tema), y `read_docs` para leerlas. Revisa:

- que cada tarjeta tenga una sola idea y una respuesta que se pueda recordar sin ambigüedad;
- que el dato sea correcto y vigente (verifica lo dudoso en PubMed o Perplexity);
- que los errores registrados (`okt estudio resumen`, «errores por tipo») tengan su tarjeta.

Propón los cambios como lista; edita en RemNote (`edit_rem`) solo con su sí. El MCP no lee las estadísticas de repaso de
RemNote: no digas cuánto las acierta.

## 6. Revisión semanal («cómo me fue esta semana estudiando»)

1. `okt estudio resumen`. Empieza por el **cumplimiento** de la semana; si fue muy bajo, no apiles más números:
   propón un día corto para retomar.
2. **Calibración:** compara la confianza con lo que salió en los repasos (`calibracion`). Si se siente seguro y falla,
   dilo en una línea: es lo más útil de corregir.
3. **Trampas del examen:** los 2 o 3 tipos de error y temas que más se repiten, con una acción para cada uno.
4. Propón **como máximo 3 cambios** basados en sus datos (minutos, días libres, pesos, retirar un tema) y aplica solo los
   que acepte (`okt estudio perfil …`, `okt estudio tema …`, `okt estudio plan generar`). Nada de cambios por intuición
   (horarios ideales, estilos de aprendizaje).
5. `okt cerrar estudiar "revisión semanal"`.
