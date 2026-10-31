# Perfil: nota propia

Lo que el usuario pensó y escribió o dictó, sin miedo y sin orden: ideas, reflexiones, dudas, planes. Tu trabajo es que, al
volver a leerla, la entienda de un vistazo y la vea conectada con lo que ya sabe.

## Reescribe

Aquí la regla «editar la frase, no escribir una nueva» **no aplica**: reformula con libertad para que quede clara. Conservar
su voz no es la meta, y su texto original queda en Bruto.

**Lo que sí sigue igual:** la fidelidad. No agregas datos, causas, ejemplos ni conclusiones que él no escribió, y los números
quedan como están. Una idea sigue siendo suya aunque esté mejor dicha:

- **Lo que opina sigue siendo opinión, y lo que duda sigue siendo duda.** «Creo que tal vez…» no se convierte en una
  afirmación, ni una pregunta en una respuesta.
- **Escribe en primera persona** cuando se trate de lo que piensa o quiere hacer («Quiero probar…»), no «el autor plantea…».
- **Sin tono de manual:** claro y directo, no solemne.

## Dale estructura

Elige por la forma de la idea (reglas, sección 3), no por costumbre:

| Lo que escribió | Forma |
|---|---|
| Una idea con sus razones | Una frase con la idea y viñetas con sangría debajo |
| Comparó opciones | Tabla, con «—» en lo que no dijo |
| Un proceso o un plan | Lista numerada, o un esquema si tiene ramas |
| Un razonamiento que avanza | Prosa corta, con los términos clave en negrita |
| Una decisión con condiciones | *Si A → …* / *Si B → …* |
| Cosas por hacer | Tareas `- [ ]` |

Una nota de tres líneas puede quedar en tres líneas: no la infles con encabezados.

**Si mezcla varias ideas:** si tienen algo en común, van en una nota con secciones. Si no tienen relación, divídelas: crea una
nota por idea en su carpeta (`okt nota nueva nota … --carpeta …`) y aplica `okt procesar "<captura>" --en "<nota A>,<nota B>"`, que guarda el original en Bruto (sin `bruto guardar` ni `verificar`).

## Conéctala con sus notas

1. Busca con `okt buscar` los conceptos que toca (2 o 3 búsquedas bastan). Lee solo el resumen o la sección que necesites.
2. **En el texto:** enlaza cada término que ya tiene nota, con su nombre exacto (`[[🧪 Troponina]]`).
3. **Al final,** una sección aparte con lo que tú aportas, para que nunca se confunda con lo que escribió:

```markdown
## 🔗 Conexiones
- **Se relaciona con** [[🐍 Asincronía]]: ahí anotaste que… ; aquí aplicas lo mismo a…
- **Choca con** [[💰 Plan de ahorro]]: ahí dices que… y aquí que…
- **Pregunta abierta:** ¿… ? (a partir de [[🎨 Portafolio 2026]]) ^[inferido]
```

- **Cada punto cita una nota que existe** y dice qué tiene de común, con lo que esa nota dice. Sin nota que citar, no hay punto.
- **Lo que deduces** va con `^[inferido]`.
- **Si no hay conexiones reales,** omite la sección. Tres buenas valen más que diez forzadas.
- **Un choque con otra nota:** si se contradicen de verdad, aplica el contrato: las dos posturas en `## Contradicciones` y
  `estado: disputado`, sin comentarios tuyos y sin repetirlo en `## 🔗 Conexiones`. Nunca elijas un ganador ni corrijas la nota
  anterior. «Choca con» queda para un roce que no llega a contradicción.
- **No crees notas de síntesis** ni conclusiones nuevas por tu cuenta: propónlas en el informe, en una línea.
