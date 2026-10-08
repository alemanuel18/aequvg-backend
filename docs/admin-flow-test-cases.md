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

## Inventario de escrituras en este flujo

Todas las rutas siguientes validan el permiso correspondiente antes de ejecutar el servicio:

- Institucional: `POST /api/v1/admin/institutional-content`, `PUT /api/v1/admin/institutional-content/:id`, `DELETE /api/v1/admin/institutional-content/:id`, `PUT /api/v1/admin/institutional-content/featured` (`INSTITUTIONAL_MANAGE`).
- Noticias: `POST /api/v1/admin/news`, `PUT /api/v1/admin/news/:id`, `PATCH /api/v1/admin/news/:id/archive` y `DELETE /api/v1/admin/news/:id` (`NEWS_MANAGE`).

Las rutas de otros módulos no forman parte de la evidencia S3 de anuncios y noticias; no deben inferirse a partir de esta guía.

## Flujo S3 de anuncios y noticias

### 1. Pantallas y Vistas
- **Página pública (`/`)**:
  - **Hero dinámico**: Título principal, subtítulo, descripción y botón de acción configurables.
  - **Conocer la Licenciatura de Química**: Despliega hasta un máximo de 3 anuncios activos publicados, sin importar si pertenecen a Laboratorio, Testimonio, Campo Laboral o Plan de Estudios.
  - **Noticias públicas**: Solo muestra noticias `PUBLICADO`, vigentes y con categoría activa.
- **Panel Administrativo (`/administrador/contenido`)**:
  - Requiere autenticación con rol administrativo y permiso `INSTITUTIONAL_MANAGE`.
  - Tarjeta de edición del Hero con validación de URLs y textos obligatorios.
  - Formulario unificado para anuncios con selector desplegable de categoría (`LABORATORIO`, `TESTIMONIO`, `CAMPO_LABORAL`, `PLAN_ESTUDIOS`) y contador visual de cupos utilizados (máx. 3 activos).
  - Campos de anuncios institucionales con categoría, imagen por URL, estado y confirmación de cambios.
- **Panel Administrativo (`/administrador/noticias`)**:
  - Lista filtrable, formulario con imagen por `imageId`, previsualización y cambio de estado.

### 2. Estándar de Confirmación y Notificaciones
- **Modal de Confirmación (`AppConfirmModal.vue`)**:
  - Intercepta toda acción de guardado, creación, edición o archivado.
  - Atrapa el foco de teclado, responde a la tecla `Escape` y solicita confirmación explícita antes de contactar a la API.
- **Notificaciones Toast (`useToast.ts` / `AppToastContainer.vue`)**:
  - Muestra avisos no invasivos (`toast.success`, `toast.error`, `toast.warning`) con auto-cierre y animación accesible.
  - Se eliminaron las alertas estáticas superiores.

### 3. Reglas de Validación y Códigos de Error
- **Límite de anuncios en Conocer la Licenciatura**: Máximo 3 anuncios activos en total. Si se intenta crear un 4to anuncio activo, el backend rechaza con `422 ANNOUNCEMENT_LIMIT_EXCEEDED` y el frontend previene el envío.
- **Publicación de noticias**: `BORRADOR`, `PUBLICADO` y `ARCHIVADO` controlan la visibilidad pública; las categorías y la imagen asociada deben estar activas y ser válidas.
- **Integridad de IDs**:
  - Si el ID enviado en la ruta no es numérico, Elysia responde `422 VALIDATION_ERROR`.
  - Si el ID no existe en la base de datos, el servicio responde `404 BLOCK_NOT_FOUND`.

### 4. Defectos Identificados y Resueltos
1. **Límite global de anuncios**: el contador considera únicamente anuncios activos/publicados; los borradores no consumen el cupo de tres.
2. **Contenido sanitizado**: títulos y cuerpos vacíos después de limpiar HTML se rechazan antes de persistir.
3. **Previsualización de noticias**: el selector E2E del título se limita al formulario cuando la previsualización está abierta.
4. **Hidratación del panel**: se desactivó SSR para `/administrador/**` y la ejecución E2E final no registró discrepancias de hidratación.

## Casos de sesión y panel

- Abrir directamente `/administrador/panel` sin sesión redirige a `/administrador?returnTo=...`.
- Escribir directamente una URL de módulo sin el permiso correspondiente redirige al panel; el endpoint también responde `403` aunque se invoque con cliente HTTP.
- Cerrar sesión revoca la sesión persistida y elimina cookies; repetir `GET /api/v1/auth/me` o cualquier escritura con las cookies anteriores responde `401`.
- En móvil (320 px), el menú se abre y cierra con teclado, `Escape` lo cierra y no se genera desplazamiento horizontal.
- El foco debe alcanzar el enlace para saltar al contenido, campos etiquetados, botones y navegación. El contraste requerido es 4.5:1 para texto normal y 3:1 para texto grande.

## Ejemplos directos del flujo

```bash
API=http://localhost:3000/api/v1

# Sin sesión: debe ser 401 y no crear nada.
curl -i -X POST "$API/admin/news" -H 'content-type: application/json' \
  --data '{"categoryId":2,"title":"No autorizado","summary":"Prueba de acceso","content":"Contenido de prueba no autorizado."}'

# Login autorizado; conservar cookies y csrfToken de la respuesta.
curl -i -c cookies.txt -X POST "$API/auth/login" -H 'content-type: application/json' \
  --data '{"email":"admin.pruebas@uvg.edu.gt","password":"AEQUVG-Pruebas-2026!"}'

# Escritura directa con sesión y CSRF.
curl -i -b cookies.txt -X PATCH "$API/admin/news/123/archive" \
  -H 'X-CSRF-Token: <csrfToken>'

# Después de logout, la misma llamada debe ser 401.
curl -i -b cookies.txt -X POST "$API/auth/logout" -H 'X-CSRF-Token: <csrfToken>'
curl -i -b cookies.txt "$API/auth/me"
```

## Ejecución y evidencia del flujo

```bash
cd aequvg-backend
bun run typecheck
bun run test
bunx vitest run tests/integration/news.database.test.ts
bunx vitest run tests/integration/institutional.access.test.ts
cd ../aequvg-frontend
bun run test
bunx playwright test tests/e2e/public-site.spec.ts --grep "administra noticias|módulo administrativo de contenido institucional|protege el panel"
```

Las suites de PostgreSQL usan una base aislada y las variables específicas del flujo (`NEWS_DATABASE_TEST=true` o `INSTITUTIONAL_DATABASE_TEST=true`, según la suite). Adjuntar al Pull Request la ejecución actual con fecha y zona horaria, commits de backend/frontend, ramas, entorno, comandos, casos pasados/fallidos, métodos y rutas, códigos HTTP, conteo de filas/archivos antes y después y evidencia de la respuesta pública posterior. Si la base o el servidor E2E no están disponibles, registrar el bloqueo como tal; no convertirlo en un resultado exitoso. No incluir cookies, tokens, contraseñas, `DATABASE_URL` ni datos personales.
