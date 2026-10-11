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
## Flujo de Junta Directiva (S3)

### Pantallas, historial y permisos

- `/junta-directiva` muestra el título oficial “Junta Directiva”, abre el año más reciente y permite cambiar de año. Un periodo multianual aparece en cada año comprendido por sus fechas.
- `/administrador/junta-directiva` requiere `BOARD_MANAGE`. Lista todos los estados, filtra por año y permite alta, edición, orden mediante flechas y retiro lógico confirmado.
- Crear, editar o retirar usa modal accesible y toast; la validación enfoca el primer campo, los controles tienen etiquetas y el envío queda bloqueado mientras está en curso. El layout se adapta a 320 px.
- Un integrante `ACTIVO` aparece dentro de su periodo en el sitio público. `DELETE` lo marca `INACTIVO`, no elimina su fila ni archivos. Reactivarlo se hace editando el estado.

### Contrato y validaciones

- El cuerpo incluye `name`, `position`, `institutionalEmail`, `termStartsAt`, `termEndsAt`, `displayOrder`, `status` y opcionalmente `description`. Fotografía no forma parte del formulario ni del contrato de escritura actual.
- `position` solo admite Presidente/a, Vicepresidente/a, Secretario/a, Tesorero/a o Vocal.
- El correo debe coincidir exactamente con `usuario@uvg.edu.gt`; subdominios y sufijos simulados se rechazan con `422 INVALID_INSTITUTIONAL_EMAIL`.
- Ambas fechas son obligatorias y el inicio no puede superar el fin (`422 INVALID_TERM`). El servidor calcula `term` y el cliente calcula todos los años inclusivos; el usuario no escribe el periodo manualmente.
- Un ID de integrante inexistente produce `404 BOARD_MEMBER_NOT_FOUND`; uno no numérico se rechaza como `422 VALIDATION_ERROR` antes del servicio.

### Casos automatizados y evidencia reproducible

`tests/integration/board.access.test.ts` invoca directamente GET, POST, PUT, PUT de orden y DELETE. Cubre ausencia de sesión, cookie inválida, sesión expirada, cuenta inactiva, cuenta sin `BOARD_MANAGE`, CSRF ausente, login institucional no aprovisionado, Origin externo, ID manipulado y administrador autorizado; en cada rechazo comprueba que los repositorios de escritura no fueron llamados.

`tests/unit/board.service.test.ts` cubre correo exacto, fechas, fotografía y IDs inexistentes. `tests/unit/board-validation.test.ts` replica la validación visible. Playwright verifica historial entre 2025/2026, viewport de 320 px, foco, confirmación, alta y reflejo del cambio en el sitio público.

Resultados reproducibles del 8 de octubre de 2026:

| Evidencia | Resultado |
| --- | --- |
| Backend `bun run typecheck` | Aprobado |
| Backend `bun run test` | 106 aprobadas, 98 omitidas por requerir PostgreSQL/configuración específica |
| Frontend `bun run typecheck` | Aprobado; advertencia conocida del plugin Volar de `vue-router` |
| Frontend `bun run test` | 37 aprobadas |
| Playwright focalizado en Junta Directiva | 2/2 aprobadas |
| Build SSR frontend | Aprobado desde copia temporal limpia; `.output` local preexistente no permite escritura al usuario actual |

No se remodeló la base de datos: se reutilizaron las fechas, el orden y el estado existentes desde S2. La fotografía se retiró temporalmente del contrato de escritura y de la pantalla administrativa.

## Inventario de escrituras

Todas las rutas siguientes validan el permiso correspondiente antes de ejecutar el servicio:

- Institucional: `POST /api/v1/admin/institutional-content`, `PUT /api/v1/admin/institutional-content/:id`, `DELETE /api/v1/admin/institutional-content/:id`, `PUT /api/v1/admin/institutional-content/featured` (`INSTITUTIONAL_MANAGE`).
- Noticias: `POST /api/v1/admin/news`, `PUT /api/v1/admin/news/:id`, `PATCH /api/v1/admin/news/:id/archive` y `DELETE /api/v1/admin/news/:id` (`NEWS_MANAGE`).

Las rutas de otros módulos no forman parte de la evidencia S3 de anuncios y noticias; no deben inferirse a partir de esta guía.

## Flujo S3 de anuncios y noticias
- Junta: `POST /api/v1/admin/board-members`, `PUT /api/v1/admin/board-members/:id`, `PUT /api/v1/admin/board-members/order`, `DELETE /api/v1/admin/board-members/:id` (`BOARD_MANAGE`).
- Contacto: `GET/POST/PUT/DELETE /api/v1/admin/contact-methods` (`CONTACT_MANAGE`). No hay rutas administrativas de solicitudes.
- Noticias: `POST/PUT/PATCH/DELETE /api/v1/admin/news` y `/:id` según el método (`NEWS_MANAGE`).
- Recursos: `POST/PUT/PATCH/DELETE /api/v1/admin/resources` y `/:id` según el método (`RESOURCES_MANAGE`).
- Recursos y archivos: consulta [`resources-admin-flow.md`](resources-admin-flow.md) para pantallas, contrato, carga multipart, descarga pública, validaciones y casos específicos del flujo.
- Proyectos: `POST/PUT/PATCH/DELETE /api/v1/admin/projects` y `/:id` según el método (`PROJECTS_MANAGE`).
- Eventos: `POST/PUT/PATCH/DELETE /api/v1/admin/events` y `/:id` según el método (`EVENTS_MANAGE`).
- Usuarios: `POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id`, `PUT /api/v1/admin/users/:id/password` (`USERS_MANAGE`).

## Flujo de Contacto (S3)

### Pantallas y permisos

- `/contacto` muestra carga, error, vacío y éxito; cada red usa un icono y la ubicación se representa con un mapa que enlaza a Google Maps.
- El footer consulta los mismos medios activos, por lo que los cambios administrativos se reflejan en todas las páginas.
- `/administrador/contacto` requiere `CONTACT_MANAGE`. Permite listar, crear, editar, reactivar, desactivar y reordenar medios con flechas; no muestra números de orden ni solicitudes. La ubicación permanece fija después de los demás medios.
- Toda mutación solicita confirmación y usa toast. Los formularios anuncian errores, enfocan el primer campo inválido, deshabilitan envíos en curso y funcionan desde 320 px.

### Contrato y validaciones

- `POST /contact-requests` es la única excepción pública de escritura. Solo acepta datos del remitente, tipo `CONSULTA|REUNION`, contenido, consentimiento `true`, versión de privacidad y honeypot vacío. No admite estado, asignación ni permisos.
- El destinatario es el medio `EMAIL` activo con menor `displayOrder` (desempate por ID). Si no existe, responde `503 CONTACT_RECIPIENT_NOT_CONFIGURED` sin aceptar el mensaje.
- El proveedor debe aceptar la entrega para responder `202 { accepted: true }`. Los mensajes no se persisten ni se exponen mediante una bandeja.
- `EMAIL` valida el correo; `TELEFONO` valida el número; ubicación exige Google Maps; Instagram, Facebook y `OTRO` exigen HTTPS. `OTRO` permite agregar redes futuras sin cambiar el esquema.
- `PUT /admin/contact-methods/order` guarda atómicamente los IDs de todos los medios no geográficos. Rechaza duplicados, omisiones, IDs ajenos y ubicaciones con `422 INVALID_CONTACT_ORDER`.

### Casos automatizados y evidencia reproducible

`tests/integration/contact.access.test.ts` invoca las rutas con cliente HTTP directo y verifica: ausencia de sesión, token expirado, cuenta inactiva, cuenta sin `CONTACT_MANAGE`, CSRF ausente, administrador autorizado, ID no numérico, Origin sin sesión, login institucional no aprovisionado, POST público válido/ inválido y ausencia de la bandeja descartada. Cada rechazo comprueba que no se llamó al repositorio de escritura.

`tests/unit/contact.service.test.ts` verifica normalización, consentimiento, honeypot, correo receptor, ausencia de destinatario, validación por tipo, desempate estable y ubicación al final. En frontend, `contact-method-validation.test.ts` cubre redes futuras y orden estable; Playwright cubre mapa, iconos/footer, consentimiento, envío único, reordenamiento visual, persistencia, ubicación fija, confirmación administrativa y foco tras validación.

Resultados del 8 de octubre de 2026 en el entorno local:

| Evidencia | Resultado |
| --- | --- |
| Backend contacto + acceso | 20/20 pruebas aprobadas |
| Integración PostgreSQL aislada | 2/2 pruebas aprobadas; volumen temporal eliminado |
| Frontend unitarias | 31/31 pruebas aprobadas |
| Playwright contacto focalizado | 4/4 pruebas aprobadas |
| Regresión Playwright completa | 16/24 aprobadas; las 8 fallas restantes corresponden a Inicio, Eventos y pruebas administrativas previas, no al flujo de Contacto |
| Typecheck backend | Aprobado |
| Typecheck frontend | Aprobado; emite advertencia conocida del plugin Volar de `vue-router` |
| Build SSR frontend | Aprobado desde una copia temporal, porque `.output` local pertenece a `nobody` |

Defectos corregidos: bandeja administrativa contraria al alcance; POST que persistía sin entregar correo; footer con datos fijos; ubicación sin URL/mapa; falta de formulario administrativo; validación genérica insuficiente; y respuesta pública que exponía ID/estado internos.

Hallazgos pendientes fuera de Contacto: la suite completa conserva expectativas desactualizadas y carreras de hidratación en Inicio/Eventos; el layout administrativo también advierte diferencias entre los datos de sesión renderizados por SSR y los hidratados en cliente. Se registran como deuda transversal porque no alteran los cuatro escenarios focalizados ni deben mezclarse con este cambio funcional.

## Flujo de Inicio e Información Institucional (S3)

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
bun run test:integration:auth
bun run test:integration:events:api
cd ../aequvg-frontend
bun run typecheck
bunx vitest run tests/integration/news.database.test.ts
bunx vitest run tests/integration/institutional.access.test.ts
cd ../aequvg-frontend
bun run test
bunx playwright test tests/e2e/public-site.spec.ts --grep "administra noticias|módulo administrativo de contenido institucional|protege el panel"
```

Las suites de PostgreSQL usan una base aislada y las variables específicas del flujo (`NEWS_DATABASE_TEST=true` o `INSTITUTIONAL_DATABASE_TEST=true`, según la suite). Adjuntar al Pull Request la ejecución actual con fecha y zona horaria, commits de backend/frontend, ramas, entorno, comandos, casos pasados/fallidos, métodos y rutas, códigos HTTP, conteo de filas/archivos antes y después y evidencia de la respuesta pública posterior. Si la base o el servidor E2E no están disponibles, registrar el bloqueo como tal; no convertirlo en un resultado exitoso. No incluir cookies, tokens, contraseñas, `DATABASE_URL` ni datos personales.
