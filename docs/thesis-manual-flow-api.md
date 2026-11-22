# Flujo manual de tesis: contrato de API (S6-10)

Actualizado: 22 de noviembre de 2026. Este documento describe el contrato implementado en el backend. La modalidad reportada para S6-08 es ingreso y publicación manual; S6-09 no activó sincronización automática ni importación desde UVG. La decisión y sus límites de verificación están en [thesis-automation-contract.md](thesis-automation-contract.md).

## Datos obligatorios y reglas

| Campo | Regla |
| --- | --- |
| `title` | Requerido, 3–300 caracteres. |
| `url` | Requerido, 1–2048 caracteres; debe ser HTTPS y único tras normalizar espacios externos, esquema y host. La ruta se conserva. |
| `contributors` | Requerido para el formulario actual. De 1 a 50 entradas; primer elemento es el autor principal. Coautores se guardan alfabéticamente. Cada entrada usa `personId` o `name` de 1–300 caracteres. |
| `publicationYear` | Requerido, entero entre 1900 y 9999. |
| `summary` | Requerido, 1–12 000 caracteres. |
| `categoryIds` | Opcional; hasta 20 IDs únicos de categorías activas. |
| `publishedAt` | Opcional; fecha ISO para registrar la decisión manual de publicar. Nulo/omitido deja un borrador. |

El campo `author` solo se acepta como alias temporal para clientes antiguos. Debe enviarse `contributors` o `author`, no ambos. No hay identificador externo ni carga de documentos. El enlace lleva al repositorio UVG, donde se conserva el archivo.

## Rutas

El prefijo común es `/api/v1`.

| Método y ruta | Acceso | Resultado |
| --- | --- | --- |
| `GET /theses/categories` | Público | Categorías activas. |
| `GET /theses?page=&pageSize=&q=&categoryId=` | Público | Solo tesis publicadas, paginadas y filtrables por texto/categoría. |
| `GET /theses/:id` | Público | Detalle publicado, con autoría y categorías activas. |
| `GET /admin/theses?page=&pageSize=&categoryId=` | `PAPERS_MANAGE` | Listado administrativo, incluidos borradores. |
| `POST /admin/theses` | `PAPERS_MANAGE` | Crea manualmente; cuerpo según campos anteriores. Responde `201`; duplicado `409 THESIS_LINK_EXISTS`; validación `422`. |
| `PUT /admin/theses/:id` | `PAPERS_MANAGE` | Edita datos, autoría, categorías y estado de publicación. Enviar `categoryIds` reemplaza asociaciones; omitirlo las conserva. |
| `DELETE /admin/theses/:id` | `PAPERS_MANAGE` | Retira el enlace del catálogo AEQUVG. No borra ni altera el registro o archivo UVG. |
| `GET /admin/thesis-authors?q=&page=&pageSize=` | `PAPERS_MANAGE` | Busca personas para reutilizar como autores. |
| `GET /admin/theses/categories` | `PAPERS_MANAGE` | Catálogo completo, activas e inactivas. |
| `POST /admin/theses/categories` | `PAPERS_MANAGE` | Crea `{ "name": "..." }`. |
| `PATCH /admin/theses/categories/:id` | `PAPERS_MANAGE` | Activa/desactiva con `{ "active": false }`. |

Las escrituras requieren sesión administrativa válida, protección CSRF y permiso `PAPERS_MANAGE`. Visitantes y estudiantes pueden consultar el catálogo público, pero no administrar ni publicar. No hay proceso de aprobación por una segunda persona implementado: S6-08 no especificó ese rol; una cuenta autorizada ingresa y decide cuándo publicar.

## Automatización y reintentos

No hay cliente de API UVG, tarea programada, proceso de importación, registro de sincronizaciones ni política automática de reintentos. En consecuencia, los criterios de automatización de S6-09 se marcan **no aplicables al alcance manual elegido**; no se simularon como si estuvieran implementados. Si la Asociación cambia la decisión, se necesita nuevo alcance, permiso escrito de UVG y contrato actualizado antes de construirlo.

## Evidencia de S6-10

- `tests/integration/thesis.api.database.test.ts`: 7/7 pruebas PostgreSQL aprobadas; cubre migración, crear/editar/retirar, URL y obligatoriedad, autoría, categorías y permisos.
- La ejecución necesitó regenerar Prisma Client en el contenedor activo (`bun run prisma:generate`); el estado de migraciones estaba al día. Después de regenerarlo, la repetición pasó 7/7.
- `bun run typecheck`: aprobado. `bun run test`: 312 aprobadas y 161 omitidas por requerir otras integraciones/servicios.
- La evidencia E2E y la matriz de roles están en la guía frontend [thesis-e2e-permissions.md](https://github.com/alemanuel18/aequvg-frontend/blob/test/thesis-s6-10-manual-flow/docs/thesis-e2e-permissions.md).
