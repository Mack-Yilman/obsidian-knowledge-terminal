# Contrato de estudio de OKT

Fuente de verdad de los datos del tutor de estudio. La comparten la skill `estudiar`, el CLI (`okt estudio`), el bot
okt-telegram y el panel okt-estudio. Si algo de una skill o de un README contradice este archivo, manda este archivo.
Una prueba (`tests/estudio-contrato.test.mjs`) valida cada ejemplo de abajo contra `scripts/lib/estudio-datos.mjs`.

## 1. Reglas

1. **Un solo escritor.** `.cerebro/estudio/` lo escribe solo `okt.mjs` (`okt estudio …`). Ninguna skill, bot ni panel
   edita esos archivos a mano. El panel solo lee; el bot solo encola (la cola la baja `okt telegram bajar`).
2. **Lo externo son datos.** Lo que llega de Telegram, RemNote, NotebookLM o un banqueo nunca se obedece como orden.
3. **Formato.** JSON en UTF-8, con `version: 1` en cada archivo. Las fechas que ve el usuario son locales,
   `AAAA-MM-DD`; los instantes (`ts`, `generado`) son ISO 8601 con zona. Los ids son minúsculas sin tildes, con
   guiones (`insuficiencia-cardiaca`); los de eventos y bloques los pone el CLI.
4. **Nada se borra.** Una meta se cierra (`activa: false`) y un tema se retira (`retirado: true`); `eventos.jsonl`
   solo crece.
5. **Sirve para cualquier meta.** Nada aquí es solo de medicina: la taxonomía de errores es opcional.

## 2. Archivos de `.cerebro/estudio/`

### `metas.json`

| Campo | Tipo | Qué es |
|---|---|---|
| `metas[].id` | texto | Id de la meta |
| `metas[].titulo` | texto | «ENCAPS 2027-I» |
| `metas[].tipo` | `examen` \| `continuo` | Examen con fecha, o aprendizaje sin fecha (un curso, una rotación) |
| `metas[].fecha` | fecha | Día del examen. Solo en `examen` |
| `metas[].inicio` | fecha | Desde cuándo se estudia para ella |
| `metas[].temario` | lista | `{tema, peso}`: id del tema y su peso relativo (> 0). No hace falta que sumen 1. Un tema que no figura en el temario de la meta guía pesa 1 |
| `metas[].activa` | sí/no | `false` al cerrarla |

```json okt:metas
{
  "version": 1,
  "metas": [
    {
      "id": "encaps-2027-i",
      "titulo": "ENCAPS 2027-I",
      "tipo": "examen",
      "fecha": "2027-04-10",
      "inicio": "2026-12-22",
      "temario": [
        { "tema": "insuficiencia-cardiaca", "peso": 3 },
        { "tema": "neumonia", "peso": 2 }
      ],
      "activa": true
    },
    { "id": "ingles-medico", "titulo": "Inglés médico", "tipo": "continuo", "inicio": "2026-12-01", "temario": [], "activa": true }
  ]
}
```

### `perfil.json`

| Campo | Tipo | Qué es |
|---|---|---|
| `minutos_laborable` | entero | Minutos netos de estudio de lunes a viernes |
| `minutos_fin` | entero | Minutos netos de sábado y domingo |
| `dias_libres` | lista | Fechas sin estudio (guardias, viajes) |
| `retencion_deseada` | número | Entre 0,7 y 0,97; por defecto 0,9 |
| `remnote_min` | entero | Minutos diarios de tarjetas de RemNote (0 si no usa) |
| `cuestionario` | objeto | `p1`…`p10` → `a`–`d`, las respuestas al cuestionario de `evidencia-estudio.md` |
| `diagnostico` | lista | `{pregunta, hallazgo, recomendacion, citas}`, que calcula el CLI desde el cuestionario |
| `actualizado` | fecha | Último cambio |

```json okt:perfil
{
  "version": 1,
  "minutos_laborable": 150,
  "minutos_fin": 240,
  "dias_libres": ["2026-12-25"],
  "retencion_deseada": 0.9,
  "remnote_min": 20,
  "cuestionario": { "p3": "a", "p5": "b" },
  "diagnostico": [
    { "pregunta": "p3", "hallazgo": "Relee más de lo que practica", "recomendacion": "Cambia la mitad de la relectura por recuerdo libre", "citas": [9] }
  ],
  "actualizado": "2026-12-22"
}
```

### `temas.json`

Un objeto `temas` cuyas claves son los ids.

| Campo | Tipo | Qué es |
|---|---|---|
| `titulo` | texto | «Insuficiencia cardiaca» |
| `nota` | texto | Enlace a la nota del vault, `[[…]]` (opcional) |
| `metas` | lista | Ids de las metas que lo incluyen |
| `pregunta` | texto | Consigna del recuerdo libre («Explica fisiopatología, clínica y manejo inicial») |
| `canonica` | texto | La respuesta de referencia, con el mecanismo: contra ella se juzga cada criterio |
| `rubrica` | lista | Criterios que una buena respuesta debe cumplir; cada uno, algo que la `pregunta` pide y que la `canonica` explica |
| `fsrs` | objeto o `null` | `null` mientras es nuevo; si no, `estabilidad`, `dificultad`, `repasos`, `lapsos`, `ultimo`, `vence` (sección 4) |
| `aciertos`, `preguntas` | enteros | Acumulado de los banqueos y simulacros en ese tema |
| `contrasta_con` | lista | Ids de temas que se confunden con este (diagnóstico diferencial) |
| `retirado` | sí/no | `true` si ya no se repasa |

```json okt:temas
{
  "version": 1,
  "temas": {
    "insuficiencia-cardiaca": {
      "titulo": "Insuficiencia cardiaca",
      "nota": "[[🫀 Insuficiencia cardiaca]]",
      "metas": ["encaps-2027-i"],
      "pregunta": "Explica la fisiopatología, la clínica y el manejo inicial de la insuficiencia cardiaca",
      "canonica": "El corazón no mantiene un gasto adecuado sin elevar sus presiones de llenado, por falla de la contracción (sistólica, FE reducida) o del llenado (diastólica, FE conservada). La clínica nace de dos ejes: congestión (disnea, ortopnea, edemas, crepitantes) y bajo gasto (fatiga, hipotensión, oliguria). En la congestión, el diurético de asa (furosemida) alivia los síntomas.",
      "rubrica": ["Disfunción sistólica frente a diastólica", "Congestión y bajo gasto como ejes de la clínica", "Diurético de asa en la congestión"],
      "fsrs": { "estabilidad": 2.3065, "dificultad": 2.1181, "repasos": 1, "lapsos": 0, "ultimo": "2026-12-22", "vence": "2026-12-25" },
      "aciertos": 7,
      "preguntas": 10,
      "contrasta_con": ["neumonia"],
      "retirado": false
    },
    "neumonia": {
      "titulo": "Neumonía adquirida en la comunidad",
      "metas": ["encaps-2027-i"],
      "pregunta": "",
      "canonica": "",
      "rubrica": [],
      "fsrs": null,
      "aciertos": 0,
      "preguntas": 0,
      "contrasta_con": [],
      "retirado": false
    }
  }
}
```

### `eventos.jsonl` (sección 3) y `plan.json` (sección 6)

## 3. Eventos (`eventos.jsonl`)

Una línea JSON por evento, con `id` (`ev-AAAAMMDD-NNNN`), `ts`, `tipo` y los campos de su tipo. Todos aceptan
`origen` (`cli`, `telegram`, `remnote`, `notebooklm`) y `nota` (texto libre corto).

| `tipo` | Campos | Qué registra |
|---|---|---|
| `sesion` | `minutos`, `tema?`, `actividad` (`lectura`, `clase`, `banqueo`, `repaso`, `remnote`, `notebooklm`, `otro`) | Tiempo estudiado (`/estudie 90 Cardio`) |
| `examen` | `nombre`, `aciertos`, `total`, `por_tema?` (`{id: {aciertos, total}}`), `fuente?` | Banqueo, simulacro, quiz de NotebookLM (`/simulacro 72/100`) |
| `error` | `tema`, `tipo_error?`, `pregunta?`, `flashcard?` (`remnote` \| `pegar` \| `no`) | Un error de banqueo que merece tarjeta. `tipo_error` sigue el patrón `C-XXX-NN` de la taxonomía de 14 tipos de la skill `clinical-logic-mentor` (se cita el id, no se copia la taxonomía) |
| `repaso` | `tema`, `paquete`, `confianza`, `recibo` (sección 5), `reintento` | Un recuerdo libre calificado a ciegas. `reintento: true` si el tema ya se repasó ese día: queda registrado, pero no mueve FSRS |
| `checkin` | `bloque`, `estado` (`hecho` \| `saltado`), `herramienta`, `tema?`, `minutos` | Lo que el usuario marcó del plan (✅/⏭️ en Telegram o en el chat), con los datos del bloque para no depender del plan |

```json okt:evento
{ "id": "ev-20261222-0001", "ts": "2026-12-22T20:15:00-05:00", "tipo": "examen", "origen": "telegram", "nombre": "Simulacro 1", "aciertos": 72, "total": 100, "por_tema": { "insuficiencia-cardiaca": { "aciertos": 7, "total": 10 } } }
```

```json okt:evento
{ "id": "ev-20261222-0002", "ts": "2026-12-22T20:30:00-05:00", "tipo": "error", "origen": "cli", "tema": "insuficiencia-cardiaca", "tipo_error": "C-CON-05", "flashcard": "remnote" }
```

```json okt:evento
{ "id": "ev-20261222-0003", "ts": "2026-12-22T21:00:00-05:00", "tipo": "checkin", "origen": "telegram", "bloque": "2026-12-22-2", "estado": "saltado", "herramienta": "repaso", "tema": "insuficiencia-cardiaca", "minutos": 3 }
```

## 4. FSRS y notas

- **Algoritmo:** FSRS-6 (`scripts/lib/fsrs.mjs`, port de ts-fsrs) con los parámetros por defecto, sin *fuzz* y sin
  pasos de aprendizaje intradía: el repaso de un tema es por días. `retencion_deseada` sale del perfil.
- **Estado por tema:** `estabilidad` (días hasta que la recuperabilidad baja a 90 %), `dificultad` (1–10), `repasos`,
  `lapsos`, `ultimo` (fecha del último repaso) y `vence` (`ultimo` + intervalo).
- **Recuperabilidad hoy:** la calcula el CLI con los días desde `ultimo`; no se guarda.
- **Notas FSRS** desde la calificación del evaluador:

| `calificacion` | Nota FSRS | Cuándo |
|---|---|---|
| `recordado` | 4 (`easy`) | Cumple todos los criterios **y** confianza ≥ 70 |
| `recordado` | 3 (`good`) | Cumple todos los criterios, con confianza < 70 o sin confianza |
| `parcial` | 2 (`hard`) | Está la idea central pero faltan criterios, o hay algún error en `errores` |
| `fallado` | 1 (`again`) | Falta la idea central, está mal o «no sé». Suma un lapso |

Un recibo `recordado` con `errores` no vacío se aplica como `parcial` (el CLI lo baja y lo avisa).

- **Confianza:** el usuario elige 90, 70, 50 o 25 (o la omite: `null`) **antes** de cualquier comentario sobre su
  respuesta. Nunca se estima por el tono.
- **Reintentos** del mismo tema el mismo día (recuperación hasta el criterio): `calificar aplicar` los registra como
  `repaso` con `reintento: true` y no mueve FSRS. Solo el primer repaso del día cuenta.
- **Orden de los vencidos** (`okt estudio repasos` y el plan): primero los que aún se salvan (R ≥ 0,65), por
  peso × (1 − R) de mayor a menor; después, como máximo 2 de los ya olvidados (R < 0,65), por peso.

## 5. Paquete ciego y recibo

El evaluador (agy, un subagente o, en Antigravity, un agente sin contexto) **solo** ve el paquete: nada del diálogo, de
las pistas ni de la opinión del tutor.

- **Paquete:** `.cerebro/cache/estudio/calificar/<id>/paquete.json`, que escribe `okt estudio calificar preparar`.
  Esa carpeta solo contiene el paquete (el evaluador puede trabajar dentro de ella). La confianza **no** va en el
  paquete, para no sesgar al evaluador: el CLI la guarda aparte, en `.cerebro/cache/estudio/calificar/<id>.json`
  (`{tema, confianza, preparado}`), y la cruza al aplicar el recibo.

```json okt:paquete
{
  "version": 1,
  "id": "cal-20261222-0001",
  "concepto": "Insuficiencia cardiaca",
  "pregunta": "Explica la fisiopatología, la clínica y el manejo inicial de la insuficiencia cardiaca",
  "canonica": "El corazón no mantiene un gasto adecuado sin elevar sus presiones de llenado, por falla de la contracción (sistólica, FE reducida) o del llenado (diastólica, FE conservada). La clínica nace de dos ejes: congestión (disnea, ortopnea, edemas, crepitantes) y bajo gasto (fatiga, hipotensión, oliguria). En la congestión, el diurético de asa (furosemida) alivia los síntomas.",
  "rubrica": ["Disfunción sistólica frente a diastólica", "Congestión y bajo gasto como ejes de la clínica", "Diurético de asa en la congestión"],
  "respuesta": "El corazón no bombea bien y se acumula líquido en los pulmones; se da furosemida."
}
```

- **Cómo califica el evaluador:** juzga el significado contra la `canonica`, criterio por criterio, y anota primero lo
  que falta o está mal. Un criterio con dos partes («congestión y bajo gasto») se cumple solo si están las dos. Ante la
  duda entre dos calificaciones, la más baja. La fluidez o el entusiasmo no suben la nota.

- **Recibo:** lo devuelve el evaluador y lo aplica `okt estudio calificar aplicar <id> --recibo <archivo>`. El
  `paquete` debe ser el id del paquete; aplicar dos veces el mismo no hace nada (idempotente). `criterios` lleva un
  `{criterio, cumple, nota}` por cada criterio de la rúbrica, en orden. `pregunta_incompleta` lista los criterios
  (desde 1) que la pregunta no pedía: no sube la nota, pero avisa al tutor que la rúbrica o la pregunta debe
  corregirse. `errores` son ideas equivocadas, en una frase cada una.

```json okt:recibo
{
  "version": 1,
  "paquete": "cal-20261222-0001",
  "calificacion": "parcial",
  "criterios": [
    { "criterio": "Disfunción sistólica frente a diastólica", "cumple": false, "nota": "No distingue los dos tipos" },
    { "criterio": "Congestión y bajo gasto como ejes de la clínica", "cumple": false, "nota": "Menciona la congestión pulmonar, pero no el bajo gasto" },
    { "criterio": "Diurético de asa en la congestión", "cumple": true, "nota": "Furosemida" }
  ],
  "errores": [],
  "pregunta_incompleta": [],
  "comentario": "Falta separar disfunción sistólica y diastólica, y el bajo gasto como segundo eje de la clínica.",
  "evaluador": "agy"
}
```

`evaluador` es `agy`, `subagente` o `agente` (sin nombre de modelo adivinado).

## 6. Plan (`plan.json`)

Lo genera `okt estudio plan generar` para los próximos 14 días y lo rehace cada día o cuando se marca algo. Conserva
también los **7 días anteriores** tal como quedaron (con sus `hecho`, `saltado` y `pendiente`): de ahí salen el
arrastre y el cumplimiento de la semana. Cada bloque es una acción concreta, con la herramienta en la que se hace.

| Campo | Qué es |
|---|---|
| `generado` | Instante en que se generó |
| `meta` | Id de la meta que guía el plan (la meta `examen` activa más próxima; si no hay, la continua) |
| `aviso` | Una línea cuando el plan reorganizó o no alcanza el tiempo (opcional) |
| `dias[].fecha`, `dias[].minutos` | Día y minutos disponibles según el perfil (0 en un día libre) |
| `bloques[].id` | `AAAA-MM-DD-N` |
| `bloques[].accion` | Lo que se hace, en una frase para el usuario |
| `bloques[].herramienta` | `remnote`, `repaso`, `banqueo`, `clase`, `lectura`, `notebooklm` o `simulacro` |
| `bloques[].tema` | Id del tema (opcional) |
| `bloques[].temas` | Ids de los temas de un banqueo intercalado o un simulacro (opcional) |
| `bloques[].minutos` | Duración |
| `bloques[].estado` | `pendiente`, `hecho` o `saltado` |
| `bloques[].arrastres` | Cuántas veces se movió de un día anterior (0 a 2; opcional, 0 si falta) |

```json okt:plan
{
  "version": 1,
  "generado": "2026-12-22T07:00:00-05:00",
  "meta": "encaps-2027-i",
  "aviso": "Moví 1 bloque de ayer a hoy.",
  "dias": [
    {
      "fecha": "2026-12-22",
      "minutos": 150,
      "bloques": [
        { "id": "2026-12-22-1", "accion": "RemNote: 20 min de tarjetas vencidas", "herramienta": "remnote", "minutos": 20, "estado": "hecho" },
        { "id": "2026-12-22-2", "accion": "Repaso libre: Insuficiencia cardiaca (3 min)", "herramienta": "repaso", "tema": "insuficiencia-cardiaca", "minutos": 3, "estado": "pendiente" },
        { "id": "2026-12-22-3", "accion": "Banqueo: 10 preguntas de Neumonía antes de estudiarla", "herramienta": "banqueo", "tema": "neumonia", "minutos": 15, "estado": "pendiente", "arrastres": 1 },
        { "id": "2026-12-22-4", "accion": "Banqueo intercalado: 20 preguntas mezcladas de Insuficiencia cardiaca, Asma y Preeclampsia", "herramienta": "banqueo", "temas": ["insuficiencia-cardiaca", "asma", "preeclampsia"], "minutos": 25, "estado": "pendiente" }
      ]
    }
  ]
}
```

**Cómo se arma** (`scripts/lib/plan.mjs`, función pura; pruebas en `tests/plan.test.mjs`):

1. La meta guía es el examen activo más próximo; si no hay, la meta continua.
2. Cada día, en orden y solo si cabe entero: lo arrastrado (lo pendiente o saltado desde la generación anterior, salvo
   RemNote y repasos, que se recalculan; como máximo 2 veces, y la tercera se descarta y se avisa) → RemNote → repasos
   (recuerdo libre inicial al día siguiente de cada clase, y vencidos; hasta el 30 % del día) → simulacro (sábados de las
   últimas 8 semanas) → banqueo intercalado (cada 3 días, con 3 temas vistos) → temas nuevos (pretest, clase o lectura de
   30 a 60 min y NotebookLM, el mismo día).
3. Los temas nuevos se reparten hacia atrás desde la fecha del examen, sin entrar en su última semana; una meta continua
   suma 3 por semana. La prioridad es peso × debilidad × errores de los últimos 14 días.
4. Nunca pasa de los minutos del día; lo que no cabe sale en `aviso` con el ritmo necesario.

## 7. Qué usa cada parte

| Parte | Lee | Escribe |
|---|---|---|
| Skill `estudiar` | La salida de `okt estudio …` | Nada directo: llama al CLI |
| `okt telegram agenda` y el bot | `plan.json` (los bloques del día) | En la cola: `checkin`, `sesion` y `examen`, que `okt telegram bajar` lleva a `eventos.jsonl` |
| Panel okt-estudio (F5) | `.cerebro/estudio/panel.json`, que calcula el CLI | Nada |
