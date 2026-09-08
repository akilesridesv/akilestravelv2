# Propuesta de metadata — aprobada solo para staging

Fuente: lectura pública de Supabase del 2026-09-07, reproducida íntegramente en [datos factuales](concierge-metadata-review.md). El usuario aprobó ambos subsets JSON **solo para staging** el 2026-09-07. No se han escrito aún. Los términos emocionales son normalizaciones editoriales del texto existente, no garantías de cómo se sentirá cada viajero. `null` significa falta de evidencia: no se almacenará como valor ni se sustituirá por cero.

## Scooters — e5f8b56c-1bce-4576-9ee8-4233260eb11c

**DATOS FACTUALES:** título “Tour en Scooters Eléctricas: Conociendo San Salvador”; tags aventura/scooter/ciudad/urbano/naturaleza. Descripción: recorrido guiado por calles, entorno urbano y natural; grupos pequeños de 2–6, dos horas, salir de la rutina. Campos: $35 USD/persona, mínimo 2, máximo 6. Incluye scooter eléctrico, casco y guía. No incluye alimentos ni entradas a museos. El texto no especifica edades, dificultad técnica, esfuerzo físico ni ritmo.

**PROPUESTA DE METADATA:**

| Campo | Propuesta | Evidencia / límite |
| --- | --- | --- |
| interests | `["scooter","urbano","aventura","naturaleza"]` | Tags actuales, título y recorrido urbano/natural. “Aventura” es interés, no nivel de riesgo. |
| desired_feelings | `["desconexion"]` | Descripción: “salir de la rutina”. No inferir romance o exclusividad. |
| best_for | `null` | Grupos pequeños no demuestra que sea mejor para parejas/familias/amigos. |
| adventure_level | `null` | No hay escala/dificultad publicada. |
| physical_intensity | `null` | El scooter eléctrico no demuestra esfuerzo bajo ni aptitud médica. |
| pace | `null` | Duración de dos horas no determina ritmo. |
| social_style | `["guided","small_group"]` | Guía y grupos pequeños explícitos; no implica salida privada. |
| indoor_outdoor | `["outdoor"]` | Recorrido por calles y entorno urbano/natural. No promete exclusividad de exteriores en cada minuto. |
| romantic_score | `null` | Sin evidencia/rúbrica. |
| family_score | `null` | Sin edades/aptitud infantil; casco no prueba seguridad para niños. |
| authenticity_score | `null` | No hay rúbrica cuantitativa. |
| nature_score | `null` | “Naturaleza” sí está documentada, pero no su proporción/puntuación. |

Subset propuesto para futura escritura **solo tras aprobación**:

```json
{"interests":["scooter","urbano","aventura","naturaleza"],"desired_feelings":["desconexion"],"social_style":["guided","small_group"],"indoor_outdoor":["outdoor"]}
```

## Tepecoyo — ee6fda28-cc2e-4fdd-b5c3-93d0b601259a

**DATOS FACTUALES:** título “Tour de café en Tepecoyo”; tags café/naturaleza/relax/montaña/cultural. Descripción: ruta del bálsamo y café, tradición cafetalera, momentos de relajación, vistas de montaña, conectar con naturaleza, guía en español; duración 3 horas. `whats_included` vacío: no afirmar degustaciones, alimentos o transporte incluido.

**PRECEDENCIA CONFIRMADA POR EL USUARIO:** en el snapshot los campos registraban $35 y máximo 10, mientras el texto conservaba $50 y máximo 4. El usuario informó que corrigió la descripción y autorizó usar precios actuales de los tiers/campos estructurados para responder. No usar precios de descripción como fuente comercial. Horarios/capacidad también se consultan en campos estructurados, nunca como promesa de disponibilidad extraída de texto. No se ejecutó ninguna corrección editorial sobre producción.

**PROPUESTA DE METADATA:**

| Campo | Propuesta | Evidencia / límite |
| --- | --- | --- |
| interests | `["cafe","naturaleza","montana","cultura"]` | Título/tags y descripción de tradición cafetalera y montaña; vocabulario normalizado del concierge. |
| desired_feelings | `["calma","conexion"]` | “momentos de relajación” y “conectar con la naturaleza”; conexión con el entorno, no promesa romántica. |
| best_for | `null` | Capacidad admite individuos/grupos, pero hay contradicción y no acredita afinidad especial. |
| adventure_level | `null` | “Aventura” comercial no cuantifica dificultad. |
| physical_intensity | `null` | No constan distancia, desnivel o exigencia. |
| pace | `null` | Momentos de relajación no definen el ritmo de todo el recorrido. |
| social_style | `["guided"]` | Descripción: “guiado en español”; no inferir privado/compartido. |
| indoor_outdoor | `["outdoor"]` | Ruta con vistas de montaña y atardecer; no excluye posibles tramos interiores. |
| romantic_score | `null` | Atardecer no demuestra enfoque romántico. |
| family_score | `null` | No hay edades o condiciones para menores. |
| authenticity_score | `null` | Tradición cafetalera sí es fuente factual, pero no permite asignar 0–1. |
| nature_score | `null` | Naturaleza confirmada como interés, sin escala cuantitativa. |

Subset propuesto para futura escritura **solo tras aprobación**:

```json
{"interests":["cafe","naturaleza","montana","cultura"],"desired_feelings":["calma","conexion"],"social_style":["guided"],"indoor_outdoor":["outdoor"]}
```

## Consecuencia esperada en pruebas

Tras aplicar los subsets aprobados en staging, “romántico”, “apto para niños” y “nada demasiado intenso” podrán quedar sin recomendación: faltan datos suficientes para respaldarlos. No llenar esos campos para conseguir artificialmente un promedio de calidad de 4.2.

Para completar lo desconocido, el proveedor debe confirmar dificultad/escala 1–5, esfuerzo/distancia/desnivel, ritmo, edades y condiciones; para puntuaciones 0–1 hace falta una rúbrica editorial acordada. La aprobación recibida se limita a los dos subsets JSON anteriores; no autoriza metadata adicional ni escritura en producción.
