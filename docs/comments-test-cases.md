# Casos verificables de S4-COM

Alcance: comentarios, historial estudiantil y anonimización por BAJA. Las pruebas usan publicaciones existentes o fixtures temporales. No se agregan rutas ni modelos para tesis, reacciones o chat.

## Matriz de aceptación

| Caso | Verificación | Evidencia automatizada |
| --- | --- | --- |
| Crear comentario | Sesión estudiantil activa; el autor sale de sesión aunque el cuerpo intente enviar IDs de autor | `tests/integration/comments.database.test.ts`: creación HTTP; `tests/integration/app.test.ts`: visitante rechazado |
| Aparición en publicación e historial | El ID, texto y destino del comentario creado aparecen en las dos consultas | `tests/integration/comments.database.test.ts`: GET de publicación e historial; `aequvg-frontend/tests/e2e/public-site.spec.ts`: publicación en noticia y aparición en Mis comentarios |
| Destinos acordados | Lectura y creación para noticia publicada, proyecto aprobado y evento publicado | `tests/integration/comments.database.test.ts`: los tres tipos con PostgreSQL; E2E: lectura en los tres detalles |
| Paginación | Páginas consecutivas contienen elementos distintos y conservan `page`, `pageSize`, `total` | `tests/integration/comments.database.test.ts`: PostgreSQL con `pageSize=1`; `tests/unit/comments.service.test.ts`: paginación y límites |
| Destino no visible | Publicación inexistente/no publicada no lista ni acepta comentarios; responde `404 PUBLICATION_NOT_FOUND` | `tests/integration/comments.database.test.ts`; `tests/unit/comments.service.test.ts` |
| Errores de escritura | Duplicado `409`; lenguaje ofensivo/MOD `422`; cuenta bloqueada `403`; visitante sin sesión `401` | Integración PostgreSQL, unitarias MOD y E2E de publicación/rechazo |
| Historial privado | Solo retorna comentarios del usuario de sesión; no existe ID de estudiante en la ruta | `tests/integration/comments.database.test.ts`; contrato OpenAPI probado en `tests/integration/app.test.ts` |
| Baja y anonimización | Conserva texto, fecha, tipo e ID de publicación; elimina asociación/atributos personales y presenta `Anónimo` | Integración PostgreSQL; `aequvg-frontend/tests/unit/student-comments-panel.test.ts` |
| Renderizado seguro | Cadenas HTML se conservan como texto, sin crear nodos o atributos ejecutables | Prueba unitaria del panel y E2E de historial del frontend |

## Ejecución

En backend, configurar `DATABASE_URL` hacia una PostgreSQL aislada y migrada, luego ejecutar:

```sh
bun run test -- tests/integration/app.test.ts tests/unit/comments.service.test.ts
bun run test:integration:comments
bun run typecheck
```

En frontend:

```sh
bun run test -- tests/unit/student-comments-panel.test.ts
PLAYWRIGHT_FRONTEND_PORT=3431 PLAYWRIGHT_API_PORT=3432 bun run test:e2e -- --grep "muestra comentarios|registra, conserva"
bun run typecheck
```

Playwright levanta mocks y Nuxt en procesos separados. Por defecto no reutiliza servidores preexistentes; solo `PLAYWRIGHT_REUSE_SERVER=true` permite ese reuso. La suite PostgreSQL debe apuntar a una base temporal y retirarse al terminar.

## Resultado registrado

En la verificación local de esta entrega: PostgreSQL comentarios 8/8, pruebas unitarias del panel 2/2, E2E de comentarios/historial 2/2, unitarias/contrato backend 27/27 y typecheck backend/frontend con código de salida 0. `nuxt typecheck` muestra una advertencia existente de resolución del plugin Volar de `vue-router`; no impide el código de salida exitoso.
