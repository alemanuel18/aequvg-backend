# Categorías de tesis (S6-07)

Las tesis admiten cero o varias categorías, con un máximo de 20 asociaciones por registro. No se exige categoría para conservar la compatibilidad con las tesis ya registradas. La migración es aditiva: las tesis anteriores siguen apareciendo en consultas sin filtro y empiezan sin categorías asignadas.

El catálogo usa `categoria_tesis` y la tabla de unión `tesis_categoria`. El nombre se normaliza entre 2 y 80 caracteres y es único sin distinguir mayúsculas. Las categorías no se borran desde la API: la junta puede desactivarlas. Una categoría inactiva deja de ofrecerse para nuevas asignaciones y consultas públicas; se conserva su asociación previa. Al editar una tesis, una asociación inactiva existente se puede conservar o retirar.

La migración crea este catálogo inicial, basado en temas y colecciones que aparecen en el repositorio UVG: química analítica, química ambiental, química computacional, síntesis y productos naturales, química farmacéutica y procesos industriales. La junta puede crear y desactivar categorías desde el panel con `PAPERS_MANAGE`.

## API

| Método y ruta | Uso |
| --- | --- |
| `GET /api/v1/theses/categories` | Lista categorías activas para el sitio público. |
| `GET /api/v1/theses?categoryId=ID` | Filtra tesis publicadas por una categoría activa. Sin filtro también incluye tesis sin categorías. |
| `GET /api/v1/admin/theses/categories` | Lista el catálogo completo, incluidas categorías inactivas. Requiere `PAPERS_MANAGE`. |
| `POST /api/v1/admin/theses/categories` | Crea una categoría. El cuerpo es `{ "name": "Química ambiental" }`. Requiere `PAPERS_MANAGE`. |
| `PATCH /api/v1/admin/theses/categories/:id` | Cambia `{ "active": true }` para activar o desactivar. Requiere `PAPERS_MANAGE`. |
| `POST` o `PUT /api/v1/admin/theses` | Acepta `categoryIds: [1, 2]`. En `PUT`, el arreglo reemplaza la lista completa; si se omite, se conservan las asociaciones. |

Un ID inexistente, una categoría inactiva nueva o IDs repetidos responden `422 INVALID_THESIS_CATEGORY`. Crear un nombre duplicado responde `409 THESIS_CATEGORY_EXISTS`.

Las respuestas de tesis públicas contienen las categorías activas asignadas. El público puede filtrar por una categoría a la vez; una tesis asignada a varias aparece en cualquiera de sus filtros.

## Verificación

La integración PostgreSQL de `tests/integration/thesis.api.database.test.ts` cubre alta y edición con varias categorías, filtro público y administrativo, duplicados, referencias inválidas, desactivación y preservación de asociaciones. Ejecutada sobre una base temporal recién creada: 7/7 pruebas aprobadas. Las pruebas unitarias cubren la normalización y límites del nombre; suite backend: 312 aprobadas y 161 omitidas por requerir otras bases de integración.
