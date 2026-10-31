# Perfil: reunión

Varias personas conversan y deciden. Lo que más se busca después es **qué se acordó y quién quedó en hacer qué**, y a veces
por qué. Por eso lo accionable va arriba y todo lo conversado debajo, por temas y sin resumir.

## Plantilla

```markdown
# 🤝 Reunión de presupuesto

> [!info] 2026-10-30 · Ana, Luis

## ✅ Acuerdos
- Se aprueba el piloto ([[#1. 💰 Piloto]]).

## 📋 Tareas
- [ ] Enviar la cotización - Luis - viernes ([[#1. 💰 Piloto]])

## ❓ Quedan abiertos
- ¿Quién firma el contrato? ([[#2. 📝 Contrato]])

## 🗣️ Desarrollo

### 1. 💰 Piloto
Ana propuso empezar con…

### 2. 📝 Contrato
Luis preguntó si…
```

## Reglas de la plantilla

- **Reunión larga:** se escribe el desarrollo primero y lo de arriba al final (`SKILL.md`, sección 3).
- **Omite lo que no haya:** sin acuerdos, no hay `## ✅ Acuerdos`. No escribas «no se acordó nada» ni dejes secciones vacías.
- **Línea `[!info]`:** la fecha y los participantes **solo si el archivo o el usuario los dicen**. Si no se conocen, quita
  el dato; si no hay ninguno, quita la línea. No uses la fecha de hoy como fecha de la reunión.
- **Excepción a «una información, un formato»:** acuerdos, tareas y puntos abiertos repiten a propósito lo que está en el
  desarrollo, en una línea y enlazados a su tema. Es la única repetición permitida.
- **Es un acuerdo solo lo que se decidió:** «vamos con eso», «queda así». Lo que alguien propuso y nadie cerró va en
  `❓ Quedan abiertos` o en el desarrollo.
- **Tarea:** `- [ ] <qué> - <responsable> - <plazo>`. Responsable y plazo solo si se dijeron, con sus palabras («el viernes»,
  no una fecha calculada). Si falta alguno, se omite ese tramo, sin escribir «sin responsable»: no se lo asignes a quien
  parezca lógico.
- **Fuera de arriba, sin callouts que repitan:** un dato de acuerdos o tareas no se vuelve a destacar en un callout.
- **Un desacuerdo con razones largas** va en viñetas con sangría, una rama por postura, no en una tabla.
- **Desarrollo:** `### N. <emoji> Nombre` y, si hace falta, `**N.M. Nombre**`. Vale todo lo de las reglas de redacción:
  tablas, esquemas y viñetas según la forma del contenido. Sigue el orden de la conversación; si vuelven a un tema, se queda
  donde apareció, indicando a qué tema se refiere.

## Quién dijo qué: nunca se adivina

`okt redactar preparar` dice si el archivo identifica a los hablantes.

| El archivo trae… | Cómo se escribe |
|---|---|
| Nombres de hablantes | Se atribuye: «Ana propuso…», «Luis respondió que…» |
| Etiquetas sin nombre («Speaker 1») | Se conserva la etiqueta («Hablante 1 propuso…»), salvo que alguien se presente en la conversación o el usuario diga quién es |
| Solo tiempos o texto corrido | En forma impersonal: «se propuso…», «se preguntó si…». Solo se atribuye a una persona si el texto lo dice claro («Ana, ¿puedes enviarlo?» → «Le pidieron a Ana…») |

Un cambio de tema no es un cambio de hablante, y el reconocimiento de voz confunde nombres: un nombre dudoso lleva `(¿?)`.

## Qué se quita y qué se queda

- **Se quita:** saludos, «¿me escuchan?», problemas de audio y conversación ajena al trabajo que no aporta información. Las
  marcas de tiempo también (reglas, sección 2).
- **Se queda:** desacuerdos y sus razones, cifras, plazos, riesgos, lo que alguien dijo que no sabe y lo que quedó para la
  próxima reunión. **Un desacuerdo no se suaviza:** si dos personas opinan distinto, las dos posturas quedan.
- **Si un tema toca otra carpeta del vault:** la reunión queda entera en esta nota y las notas de ese tema la enlazan.
