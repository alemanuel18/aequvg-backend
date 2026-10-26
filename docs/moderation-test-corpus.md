# Corpus técnico de pruebas MOD (S4-MOD)

Este corpus es una fixture de ingeniería para comprobar normalización y flujo entre rutas. **No es catálogo aprobado por la Asociación ni activa una política productiva.** Los ejemplos ofensivos se limitan a términos ya presentes en los filtros locales; las excepciones de contexto siguen pendientes de ratificación.

| Caso | Entrada controlada | Nombre | Comentario | Qué comprueba |
| --- | --- | --- | --- | --- |
| Nombre normal | `María José Pérez` | Permitir | — | Acentos y texto personal válido |
| Comentario académico | `La química analítica estudia las sustancias.` | — | Permitir | Término académico inocuo |
| Topónimo con coincidencia parcial | `Putomayo` | Permitir | — | No buscar subcadenas dentro de palabras |
| Topónimo en frase | `Putomayo es un topónimo` | — | Permitir | La misma protección en comentarios |
| Término directo | `cerote` | Rechazar | Rechazar | Coincidencia completa |
| Mayúsculas y diacríticos | `IDÍOTA` | Rechazar | Rechazar | Normalización de mayúsculas y acentos |
| Puntuación insertada | `i.d.i.o.t.a` | Rechazar | Rechazar | Evasión con separadores dentro del token |
| Caracteres de formato invisibles | `i\u200Bd\u200Biota` | Rechazar | Rechazar | Remoción de caracteres `Cf` |
| Sustituciones simples | `1d10ta` | Rechazar | Rechazar | Mapeo leet `1→i`, `0→o` |
| Excepción literal de fixture | `insulto citado en clase` | — | Permitir | Excepción exacta; no representa una excepción contextual aprobada |

La suite unitaria verifica detección y falsos positivos en los catálogos locales, comportamiento compartido bajo una política fixture y que las rutas de alta, perfil y comentarios no persistan contenido rechazado. La prueba PostgreSQL de `tests/integration/moderation.database.test.ts` verifica reintentos con la misma clave, una sola infracción por operación, rechazo sin guardar el comentario y ausencia del contenido original en la evidencia persistida. Esa suite requiere `MODERATION_DATABASE_TEST=true` y una base PostgreSQL migrada; el corpus no cambia los valores de política productiva.
