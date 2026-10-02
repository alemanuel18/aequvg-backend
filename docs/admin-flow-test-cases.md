# Flujo administrativo: pruebas de acceso y regresión

Este documento registra el contrato verificable del panel administrativo. La autorización es del servidor: ocultar enlaces, usar el prefijo `/admin`, enviar `Origin` o depender de CORS no concede permisos.

## Precondiciones reproducibles

1. Aplicar migraciones y seed sobre una base PostgreSQL aislada.
2. Arrancar la API en `http://localhost:3000`.
3. Usar `admin.pruebas@uvg.edu.gt` únicamente en desarrollo, o crear cuentas de prueba con roles y estados explícitos.
4. Guardar cookies de sesión y el `csrfToken` de `POST /api/v1/auth/login`.

Para todas las escrituras administrativas se envían `aequvg_session`, `aequvg_device`, `X-CSRF-Token` y el mismo `User-Agent` usado al iniciar sesión.

## Matriz de autorización

| Actor o manipulación | Lectura/ruta administrativa | POST | PUT/PATCH | DELETE | Resultado esperado |
| --- | --- | --- | --- | --- | --- |
| Sin cookies | Cualquier `/api/v1/admin/*` | Todas | Todas | Todas | `401 UNAUTHORIZED`; no cambia BD ni archivos |
| Cookie inválida o sesión expirada/revocada | Cualquier `/api/v1/admin/*` | Todas | Todas | Todas | `401 INVALID_SESSION` o `SESSION_REVOKED`; no cambia BD ni archivos |
| Cuenta externa | Login y panel | — | — | — | `401 INVALID_CREDENTIALS`; no se crea sesión |
| Institucional no aprovisionada | Login Microsoft | — | — | — | `403 ACCOUNT_NOT_PROVISIONED` |
| Institucional inactiva o rol inactivo | Login/sesión existente | — | — | — | `403 ACCOUNT_DISABLED`; no se crea ni reutiliza autorización |
| Cuenta activa sin permiso del módulo | Ruta del módulo | Todas | Todas | Todas | `403 FORBIDDEN`; no cambia BD ni archivos |
| Cuenta activa con permiso, sin CSRF | Ruta de escritura | Rechaza | Rechaza | Rechaza | `403 CSRF_TOKEN_INVALID`; no cambia BD ni archivos |
| Administrador autorizado | Ruta de su módulo | Permite | Permite | Permite | `2xx`, persistencia y reflejo público conforme al contrato |
| ID inexistente, negativo, no numérico o de otro registro | Ruta con `/:id` | Según aplique | Según aplique | Según aplique | `404` o `422`; nunca opera otro registro |
| Origin/CORS omitido o alterado | Ruta administrativa directa | Todas | Todas | Todas | La decisión no cambia: la autorización proviene de la sesión/permisos |

El dominio `@uvg.edu.gt` solo es una condición de identidad institucional. No crea un usuario, rol, permiso ni acceso administrativo.

## Inventario de escrituras

Todas las rutas siguientes llaman `requireAdmin` antes del servicio:

- Institucional: `POST /api/v1/admin/institutional-content`, `PUT /api/v1/admin/institutional-content/:id`, `DELETE /api/v1/admin/institutional-content/:id` (`INSTITUTIONAL_MANAGE`).
- Junta: `POST /api/v1/admin/board-members`, `PUT /api/v1/admin/board-members/:id`, `PUT /api/v1/admin/board-members/order`, `DELETE /api/v1/admin/board-members/:id` (`BOARD_MANAGE`).
- Contacto: `POST/PUT/DELETE /api/v1/admin/contact-methods`, `PUT /api/v1/admin/contact-requests/:id` (`CONTACT_MANAGE`).
- Noticias: `POST/PUT/PATCH/DELETE /api/v1/admin/news` y `/:id` según el método (`NEWS_MANAGE`).
- Recursos: `POST/PUT/PATCH/DELETE /api/v1/admin/resources` y `/:id` según el método (`RESOURCES_MANAGE`).
- Proyectos: `POST/PUT/PATCH/DELETE /api/v1/admin/projects` y `/:id` según el método (`PROJECTS_MANAGE`).
- Eventos: `POST/PUT/PATCH/DELETE /api/v1/admin/events` y `/:id` según el método (`EVENTS_MANAGE`).
- Usuarios: `POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id`, `PUT /api/v1/admin/users/:id/password` (`USERS_MANAGE`).

## Casos de sesión y panel

- Abrir directamente `/administrador/panel` sin sesión redirige a `/administrador?returnTo=...`.
- Escribir directamente una URL de módulo sin el permiso correspondiente redirige al panel; el endpoint también responde `403` aunque se invoque con cliente HTTP.
- Cerrar sesión revoca la sesión persistida y elimina cookies; repetir `GET /api/v1/auth/me` o cualquier escritura con las cookies anteriores responde `401`.
- En móvil (320 px), el menú se abre y cierra con teclado, `Escape` lo cierra y no se genera desplazamiento horizontal.
- El foco debe alcanzar el enlace para saltar al contenido, campos etiquetados, botones y navegación. El contraste requerido es 4.5:1 para texto normal y 3:1 para texto grande.

## Ejemplos directos

```bash
API=http://localhost:3000/api/v1

# Sin sesión: debe ser 401 y no crear nada.
curl -i -X POST "$API/admin/events" -H 'content-type: application/json' \
  --data '{"name":"No autorizado","description":"Prueba","startsAt":"2030-05-15T18:00:00.000Z","location":"UVG","maximumCapacity":10}'

# Login autorizado; conservar cookies y csrfToken de la respuesta.
curl -i -c cookies.txt -X POST "$API/auth/login" -H 'content-type: application/json' \
  --data '{"email":"admin.pruebas@uvg.edu.gt","password":"AEQUVG-Pruebas-2026!"}'

# Escritura directa con sesión y CSRF.
curl -i -b cookies.txt -X PATCH "$API/admin/events/123/archive" \
  -H 'X-CSRF-Token: <csrfToken>'

# Después de logout, la misma llamada debe ser 401.
curl -i -b cookies.txt -X POST "$API/auth/logout" -H 'X-CSRF-Token: <csrfToken>'
curl -i -b cookies.txt "$API/auth/me"
```

## Ejecución y evidencia

```bash
cd Back/aequvg-backend
bun run typecheck
bun run test
bun run test:integration:auth
bun run test:integration:events:api
cd ../../Front/aequvg-frontend
bun run typecheck
bun run test
bun run test:e2e
```

Las suites de PostgreSQL usan variables `AUTH_DATABASE_TEST=true` o `EVENTS_DATABASE_TEST=true` y una base aislada. Registrar en el informe de ejecución: fecha, commit, URL/base de pruebas, actor, método/ruta, código y código de error, conteo de filas/archivos antes y después, y evidencia de la respuesta pública posterior.
