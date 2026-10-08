# Flujo administrativo: anuncios y noticias

Esta guía documenta el flujo S3 de contenido administrativo. La autorización se decide en el servidor; ocultar botones, usar `/administrador`, enviar `Origin` o depender de CORS no concede acceso.

## Acceso y permisos

1. Iniciar sesión mediante `POST /api/v1/auth/login`.
2. Conservar las cookies `aequvg_session` y `aequvg_device`, además del `csrfToken` de la respuesta.
3. Enviar `X-CSRF-Token` y el mismo contexto de navegador (`User-Agent` y plataforma) en cada escritura.
4. Usar una cuenta activa con `NEWS_MANAGE` para noticias o `INSTITUTIONAL_MANAGE` para anuncios.

El dominio `@uvg.edu.gt` solo identifica una cuenta institucional; no crea por sí mismo usuario, rol, permiso ni acceso administrativo.

| Caso | Respuesta |
| --- | --- |
| Sin sesión | `401 UNAUTHORIZED` |
| Cookie/JWT inválido, expirado o revocado | `401 INVALID_SESSION` |
| Cuenta o rol inactivo | `403 ACCOUNT_DISABLED` |
| Cuenta activa sin permiso del módulo | `403 FORBIDDEN` |
| Escritura sin CSRF válido | `403 CSRF_TOKEN_INVALID` |

## Pantallas y pasos de uso

### Noticias: `/administrador/noticias`

- Lista con búsqueda, categoría, estado, orden y paginación.
- Formulario con categoría, imagen por `imageId`, título, resumen, contenido y estado.
- Previsualización, confirmación para guardar/eliminar y toast de resultado.
- Cambio de estado mediante lista: `BORRADOR`, `PUBLICADO` o `ARCHIVADO`.
- La consulta pública está en `/noticias`; solo muestra publicaciones vigentes y de categorías activas.

### Anuncios: `/administrador/contenido`

- Edición del Hero de inicio.
- Formulario para `LABORATORIO`, `TESTIMONIO`, `CAMPO_LABORAL` y `PLAN_ESTUDIOS`.
- Contador global de anuncios activos: máximo 3, sin importar la categoría.
- Campos: título, contenido, imagen por URL HTTP/HTTPS, enlace opcional y estado.
- Guardar, editar y archivar solicitan confirmación y muestran toast.
- El resultado público se consulta en `/`; solo aparecen anuncios publicados.

Ambas pantallas contemplan carga, vacío, error y éxito, navegación por teclado y viewport mínimo de 320 px.

## Contrato HTTP vigente

### Noticias

```text
GET    /api/v1/news?q=&categoryId=&page=&pageSize=
GET    /api/v1/news/:id
GET    /api/v1/news/categories
GET    /api/v1/admin/news
GET    /api/v1/admin/news/:id
POST   /api/v1/admin/news
PUT    /api/v1/admin/news/:id
PATCH  /api/v1/admin/news/:id/archive
DELETE /api/v1/admin/news/:id
```

Ejemplo de creación:

```json
{
  "categoryId": 2,
  "imageId": null,
  "title": "Convocatoria de laboratorio",
  "summary": "Inscripción abierta para la actividad práctica.",
  "content": "Contenido suficientemente extenso para publicar la noticia.",
  "status": "PUBLICADO"
}
```

`title` admite 3–220 caracteres, `summary` 10–2000 y `content` 20–20000. El servicio limpia HTML y rechaza valores vacíos después de normalizarlos. `imageId`, si se envía, debe referir un archivo existente cuyo MIME comience con `image/`. Las categorías y el autor deben estar activos.

La consulta pública excluye borradores, archivados, publicaciones futuras y noticias de categorías inactivas. Cambiar a `BORRADOR` o `ARCHIVADO` elimina `publishedAt`; `PUBLICADO` lo asigna o conserva.

### Anuncios institucionales

```text
GET    /api/v1/institutional-content
GET    /api/v1/institutional-content/featured
GET    /api/v1/admin/institutional-content
GET    /api/v1/admin/institutional-content/featured
POST   /api/v1/admin/institutional-content
PUT    /api/v1/admin/institutional-content/:id
DELETE /api/v1/admin/institutional-content/:id
PUT    /api/v1/admin/institutional-content/featured
```

Ejemplo de creación:

```json
{
  "type": "LABORATORIO",
  "title": "Laboratorios especializados",
  "body": "Información pública del anuncio.",
  "imageUrl": "https://example.org/laboratorio.jpg",
  "status": "PUBLICADO"
}
```

`title` y `body` deben conservar al menos 2 caracteres después de limpiar HTML. `imageUrl` solo admite HTTP/HTTPS. Un anuncio no `HERO` en estado `PUBLICADO` cuenta para el límite global de tres. `DELETE` archiva el bloque; no lo elimina físicamente.

Los errores se devuelven como `{ "error": { "code", "message" } }`. Un ID no numérico produce `422`; uno inexistente produce `404` sin mutar otro registro.

## Pruebas y evidencia reproducible

Desde `aequvg-backend`, con PostgreSQL migrado y `DATABASE_URL` cargada:

```bash
bun run typecheck
bun run test
NEWS_DATABASE_TEST=true bunx vitest run tests/integration/news.database.test.ts
INSTITUTIONAL_DATABASE_TEST=true bunx vitest run tests/integration/institutional.database.test.ts
```

Las pruebas PostgreSQL comprueban creación, edición, archivado y eliminación de noticias; contenido vacío o malicioso e imagen no válida sin persistencia; exclusión pública de borradores/programadas; y creación, edición, archivado, reflejo público y exclusión posterior de anuncios.

Desde `aequvg-frontend`, con el mock de Playwright disponible:

```bash
bun run test
bunx playwright test tests/e2e/public-site.spec.ts --grep "administra noticias|módulo administrativo de contenido institucional|protege el panel"
```

Los E2E comprueban confirmaciones, eliminación, reflejo de una noticia en `/noticias`, acceso directo al panel y estados visuales. Registrar fecha, rama/commit, base usada, comando, resultado, método/ruta y código HTTP. No adjuntar cookies, tokens, contraseñas ni datos personales.

### Evidencia de la ejecución actual

Ejecución realizada el `2026-10-08T16:48:47-06:00`:

| Área | Commit | Comando | Resultado |
| --- | --- | --- | --- |
| Backend autorización | `fa067fac4253e16d9441e8231d527f33a2456f32` | `INSTITUTIONAL_DATABASE_TEST=true bunx vitest run tests/integration/institutional.access.test.ts` | `25/25` pasaron |
| Backend PostgreSQL noticias | `fa067fac4253e16d9441e8231d527f33a2456f32` | `NEWS_DATABASE_TEST=true bunx vitest run tests/integration/news.database.test.ts` | Bloqueada: el contenedor no publica `5432` al host |
| Frontend unitarias | `996869a2ebc0b619078ea9d1bfe353afddd2d862` | `bun run test` | `28/28` pasaron |
| Frontend E2E administrativas | `996869a2ebc0b619078ea9d1bfe353afddd2d862` | `bunx playwright test tests/e2e/public-site.spec.ts --grep "administra noticias|módulo administrativo de contenido institucional|protege el panel"` | `2/3` pasaron; falló contenido institucional |

La prueba E2E fallida no pudo encontrar `Título del Hero` después de que el mock devolvió `404` para `/api/v1/admin/events?pageSize=50`. La ejecución también registró advertencias de hidratación SSR en el panel administrativo. Estos defectos quedan pendientes de corrección y deben reflejarse en el PR.

La evidencia técnica se conserva en los archivos de integración y E2E indicados arriba; el PR debe adjuntar las salidas completas, incluidos métodos, rutas y códigos HTTP.

### Evidencia requerida para el Pull Request

Antes de aprobar el cambio, adjuntar al PR la salida actual de los comandos anteriores con esta información:

```text
Fecha y zona horaria:
Backend commit:
Frontend commit:
Ramas:
Entorno: PostgreSQL local/CI; navegador y versión para E2E
Variables relevantes: NEWS_DATABASE_TEST, INSTITUTIONAL_DATABASE_TEST (sin valores secretos)

Comando:
Resultado:
Pruebas pasadas/fallidas:
Observaciones:
```

La evidencia debe incluir los códigos HTTP y las rutas ejercitadas cuando aplique. No adjuntar cookies, tokens, contraseñas, `DATABASE_URL` ni datos personales.

## Defectos registrados y corregidos

- El límite de anuncios ahora cuenta únicamente publicaciones activas, no borradores.
- El contenido se valida después de limpiar HTML para impedir títulos o cuerpos vacíos.
- El selector E2E del título se limitó al formulario cuando la previsualización está abierta.
- El panel privado ya no se renderiza con una sesión distinta entre servidor y cliente: SSR está desactivado para `/administrador/**`.

La matriz transversal de autorización está en [`admin-flow-test-cases.md`](./admin-flow-test-cases.md); esta guía limita el contrato y las pruebas al flujo de anuncios y noticias.
