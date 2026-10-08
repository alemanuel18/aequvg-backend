# AEQUVG Backend

API REST de la Asociación de Estudiantes de Química de la Universidad del Valle de Guatemala. Expone contenido institucional, junta directiva y medios de contacto, y entrega por correo las consultas o solicitudes de reunión del sitio público.

## Tecnologías

- **Bun 1.4:** runtime, gestor de dependencias y ejecutor de scripts.
- **TypeScript:** tipado estático del dominio y de la API.
- **Elysia:** servidor HTTP y definición de rutas REST.
- **Prisma ORM:** esquema relacional, cliente tipado, migraciones y seed.
- **PostgreSQL 16:** fuente de verdad de la aplicación.
- **OpenAPI:** documentación generada por `@elysiajs/openapi`.
- **Vitest:** pruebas unitarias y de integración.
- **Docker Compose:** entorno reproducible para PostgreSQL y la API.

Las versiones y scripts exactos se encuentran en `package.json`; las dependencias están bloqueadas en `bun.lock`.

## Arquitectura

El backend es un monolito modular organizado por capas:

```text
src/
  modules/
    institutional/       # Inicio y promoción de la carrera
    board/               # Junta directiva
    contact/             # Medios oficiales y entrega directa por correo
    events/              # Estructura reservada para eventos
    news/                # Estructura reservada para noticias
    papers/              # Estructura reservada para papers
    projects/            # Estructura reservada para proyectos
    resources/           # Estructura reservada para recursos
    users/               # Estructura reservada para usuarios
  middleware/            # Autorización, rate limit y logs HTTP
  shared/                # Base de datos, errores, logging y utilidades
  app.ts                 # Composición de plugins y módulos
  server.ts              # Punto de entrada del servidor
prisma/
  schema.prisma          # Modelo relacional
  migrations/            # Migraciones SQL versionadas
  seed.ts                # Datos iniciales repetibles
scripts/
  smoke.ts               # Prueba rápida contra PostgreSQL real
tests/
  unit/
  integration/
docs/
  aequvg-hoppscotch.json # Colección para Hoppscotch
```

Cada módulo separa responsabilidades:

1. `controllers`: rutas, parámetros, códigos HTTP y serialización.
2. `dtos`: validación explícita de entradas.
3. `services`: reglas de negocio, normalización y permisos.
4. `repositories`: acceso a PostgreSQL mediante Prisma.

La API usa el prefijo `/api/v1`. OpenAPI se publica en `http://localhost:3000/openapi` y el healthcheck en `http://localhost:3000/health`.

## Autenticación y perfiles administrativos

Las cuentas administrativas deben aprovisionarse previamente con un correo `@uvg.edu.gt`. No existe registro público de administradores. Los cuatro perfiles definidos en la planificación son:

- `ASSOCIATION_REPRESENTATIVE`: representante de la Asociación.
- `FACULTY_REPRESENTATIVE`: representante de la Facultad de Química.
- `CAREER_DIRECTOR`: directora de la carrera.
- `CAREER_SECRETARY`: secretaria de la carrera.

Los perfiles permanecen separados para poder especializarlos después. Conforme al contrato vigente, los cuatro reciben inicialmente los mismos permisos. La seed crea de forma idempotente los roles, permisos y relaciones. `CONTENT_ADMIN`, el rol provisional anterior, queda inactivo.

### Administrador local de pruebas

Al ejecutar la seed con `NODE_ENV` distinto de `production`, se crea o restablece esta cuenta ficticia:

```text
Correo: admin.pruebas@uvg.edu.gt
Contraseña: AEQUVG-Pruebas-2026!
Rol: ASSOCIATION_REPRESENTATIVE
```

Estas credenciales son públicas y sirven exclusivamente para desarrollo y pruebas locales. La seed no crea esta cuenta cuando `NODE_ENV=production`; no debe copiarse manualmente ni utilizarse en un despliegue real.

La API admite dos formas de inicio de sesión:

- `POST /api/v1/auth/login`: correo institucional y contraseña. Las contraseñas se almacenan con `scrypt`; el JWT HS256 nunca se devuelve a JavaScript y se guarda en una cookie `HttpOnly`.
- `GET /api/v1/auth/microsoft`: crea un desafío OpenID Connect con Authorization Code, PKCE, `state` y `nonce`, y devuelve `authorizationUrl`. El callback es `GET /api/v1/auth/microsoft/callback`. Se validan firma RS256, tenant, audiencia, expiración y `nonce` del ID token.

Microsoft no crea administradores automáticamente. La cuenta debe existir en `usuario_administrativo`, estar activa y pertenecer a un rol activo; el primer acceso enlaza su `sub` de Microsoft con el usuario ya aprobado.

Otros endpoints:

```text
GET  /api/v1/auth/me
POST /api/v1/auth/logout
GET  /api/v1/admin/roles
GET  /api/v1/admin/users
POST /api/v1/admin/users
PATCH /api/v1/admin/users/:id
PUT   /api/v1/admin/users/:id/password
```

Las rutas administrativas usan cookies y requieren `credentials: "include"` en el frontend. Para `POST`, `PUT`, `PATCH` y `DELETE`, el cliente debe reenviar en `X-CSRF-Token` el `csrfToken` recibido al iniciar sesión. El autor o revisor de una operación se obtiene de la sesión y no puede elegirse en el cuerpo.

Cada JWT referencia una sesión persistida y no contiene roles ni permisos. En cada solicitud se consulta el usuario y su rol vigente. Cambiar rol, estado o contraseña revoca sus sesiones. El JWT se vincula además a una cookie secreta de dispositivo y al contexto básico del navegador; una copia incompleta o usada desde otro contexto revoca la sesión. Si un atacante clona todas las cookies y suplanta exactamente el navegador, las cookies por sí solas no permiten distinguir físicamente ambos dispositivos; una garantía superior requiere WebAuthn o una credencial ligada por hardware.

Para configurar Microsoft Entra ID, registra una aplicación de tenant único, agrega exactamente `MICROSOFT_REDIRECT_URI` como redirect URI de tipo Web y crea un secreto de cliente. No configures el tenant `common`: el backend exige el identificador del tenant UVG.

## Noticias

La API pública expone `GET /api/v1/news`, `GET /api/v1/news/:id` y `GET /api/v1/news/categories`. El listado acepta `q`, `categoryId`, `page` y `pageSize`; solo devuelve publicaciones `PUBLICADO` cuya fecha ya llegó y cuya categoría está activa.

Las rutas administrativas bajo `/api/v1/admin/news` requieren una sesión con `NEWS_MANAGE` y permiten listar, consultar, crear, actualizar, archivar y eliminar noticias. Los contratos de entrada, respuesta y errores están disponibles en [OpenAPI](http://localhost:3000/openapi) y en `docs/aequvg-hoppscotch.json`.

La integración real del módulo se ejecuta únicamente contra una PostgreSQL aislada para no modificar datos locales:

```bash
bun run test:integration:news
```

GitHub Actions ejecuta esa misma prueba contra PostgreSQL 16 en cada pull request, después de aplicar las migraciones. El job se llama `news-postgres`; configúralo como required status check de la rama `develop` desde las reglas de protección del repositorio.

### Catálogo público de proyectos

`GET /api/v1/projects` devuelve únicamente proyectos con estado `APROBADO`. Acepta los parámetros opcionales `search` (coincidencia parcial en título o nombre de autor), `year` (año UTC de `createdAt`), `type` (`TESIS` o `PROYECTO`), `sortBy` (`createdAt`, `title` o `author`), `sortOrder` (`asc` o `desc`), `page` (predeterminado `1`) y `pageSize` (predeterminado `12`, máximo `100`).

La respuesta contiene `{ items, pagination: { page, pageSize, total, totalPages } }`. La búsqueda parcial se apoya en índices trigram de PostgreSQL sobre título y nombre de autor; el filtro de estado y fecha usa el índice compuesto existente.

El CRUD administrativo vive bajo `/api/v1/admin/projects` y requiere una sesión con `PROJECTS_MANAGE`. Incluye listar, consultar, crear, actualizar, revisar y eliminar. Autor y revisor se obtienen de la sesión; el proyecto inicia en `EN_REVISION`.

La integración del CRUD usa una base PostgreSQL aislada y se habilita con `bun run test:integration:projects`.

## Persistencia de eventos e inscripciones (SCRUM-119 / SCRUM-123)

El contrato de persistencia ya está en `prisma/schema.prisma` y en la migración
`20260922170000_sprint_2_public_content`. No necesita campos adicionales ni una
migración nueva. Las rutas y reglas de negocio de eventos siguen pendientes.

`Event` se mapea a `evento`: `id` → `id_evento`, `createdById` → `creado_por`,
`imageId` → `id_imagen` (opcional), `name` → `nombre`, `description` → `descripcion`,
`startsAt` → `inicia_en`, `location` → `ubicacion`, `maximumCapacity` →
`capacidad_maxima`, `additionalInformation` → `informacion_adicional` (opcional),
`status` → `estado` y `createdAt` → `creado_en`. Incluye la relación `registrations`.
Los estados son `BORRADOR` (default), `PUBLICADO`, `FINALIZADO`, `CANCELADO` y
`ARCHIVADO`. PostgreSQL garantiza capacidad positiva con
`evento_capacidad_positiva_check`. Los índices cubren `(estado, inicia_en)`, creador
e imagen. Las FK al administrador y archivo usan `ON DELETE RESTRICT` y
`ON UPDATE CASCADE`.

`EventRegistration` se mapea a `inscripcion_evento`: `id` → `id_inscripcion`,
`eventId` → `id_evento`, `fullName` → `nombre_completo`, `email` → `correo`, `phone`
→ `telefono`, `status` → `estado`, `consentedAt` → `consentimiento_en`,
`privacyVersion` → `version_privacidad` y `registeredAt` → `inscrito_en`. Todos
son obligatorios. La FK al evento usa las mismas políticas RESTRICT/CASCADE.
Los estados son `CONFIRMADA` (default) y `CANCELADA`; el índice `(id_evento, estado)`
soporta el conteo de confirmadas. Los IDs son enteros autoincrementales y las
fechas son `TIMESTAMPTZ(3)`; creación e inscripción tienen default de fecha actual.

### Decisión MVP: unicidad, cancelación y privacidad

- Se conserva `UNIQUE(eventId, email)`. `CITEXT` compara correos sin distinguir
  mayúsculas, incluso al consultar con Prisma. No elimina espacios ni transforma
  el valor almacenado; la futura normalización seguirá el patrón de contacto.
- Hay como máximo un registro por evento/correo, incluido cuando está cancelado.
  Cancelar y eventualmente reinscribirse significa cambiar el estado del mismo
  registro. Este PR verifica que la persistencia lo permite; no implementa ese flujo.
- Los cupos disponibles se calcularán desde capacidad e inscripciones válidas;
  no se persiste un contador. El CHECK de capacidad no evita sobreinscripción:
  la transacción atómica corresponde a SCRUM-127.
- Como en contacto, consentimiento se representa mediante `consentedAt` obligatorio,
  junto con `privacyVersion`. NOT NULL garantiza su presencia, no prueba aceptación
  del visitante ni valida texto vacío o una versión oficial. La futura entrada HTTP
  deberá exigir aceptación explícita, generar la fecha de consentimiento en el
  servidor y registrar la versión de privacidad aplicable.
- No se agregan IP, user agent ni datos personales adicionales. La retención y
  eliminación quedan pendientes de política UVG. Los logs no deben incluir PII.

## Contacto y entrega por correo

`GET /api/v1/contact-methods` devuelve solo medios activos, ordenados de forma estable por `displayOrder` e ID. Las ubicaciones exigen una URL de Google Maps y siempre se entregan después de los demás medios, independientemente de su orden almacenado. Las redes conocidas usan `INSTAGRAM` o `FACEBOOK`; cualquier red futura se registra como `OTRO` con etiqueta, valor y URL HTTPS, sin requerir una migración.

`POST /api/v1/contact-requests` permanece público, exige consentimiento, versión de privacidad y el honeypot vacío, y conserva el rate limit por IP. Ya no persiste una bandeja ni acepta estados internos: normaliza la entrada, selecciona el medio `EMAIL` activo con menor orden y entrega el mensaje mediante la API de Resend. Cada contenido genera una clave de idempotencia por minuto para que reintentos o dobles envíos equivalentes no dupliquen el correo. Responde `202 { "accepted": true }` únicamente cuando el proveedor aceptó el correo. La tabla histórica `solicitud_contacto` se conserva sin uso para evitar una migración destructiva.

Configura:

- `RESEND_API_KEY`: secreto del proveedor; nunca se expone al frontend.
- `CONTACT_FROM_EMAIL`: remitente verificado en Resend, por ejemplo `AsoQuimica UVG <contacto@dominio-verificado.gt>`.
- El destinatario se cambia desde `PUT /api/v1/admin/contact-methods/:id` o desde `/administrador/contacto`, no mediante variables de entorno.

Las rutas administrativas disponibles son `GET`, `POST`, `PUT` y `DELETE /api/v1/admin/contact-methods`. Requieren sesión activa, permiso `CONTACT_MANAGE` y CSRF en escrituras. `PUT /api/v1/admin/contact-methods/order` recibe `{ "orderedIds": [3, 1, 4] }`: debe incluir una sola vez todos los medios que no sean ubicaciones y persiste posiciones únicas en una transacción. Crear un medio lo añade al final y editarlo conserva su posición; si deja de ser ubicación, pasa al final. `DELETE` desactiva el medio, no lo elimina. Las antiguas rutas `/api/v1/admin/contact-requests` fueron retiradas porque el producto no administra solicitudes.

Errores propios: `422 INVALID_CONTACT_EMAIL`, `INVALID_CONTACT_PHONE`, `CONTACT_URL_REQUIRED`, `GOOGLE_MAPS_URL_REQUIRED` o `INVALID_CONTACT_ORDER`; `404 CONTACT_METHOD_NOT_FOUND`; `503 CONTACT_RECIPIENT_NOT_CONFIGURED` o `CONTACT_DELIVERY_NOT_CONFIGURED`; `502 CONTACT_DELIVERY_FAILED`.

## Eventos e inscripciones

### API pública de eventos

La API pública expone:

- `GET /api/v1/events`: listado paginado (`page`, `pageSize`, `q`), ordenado deterministamente por `inicia_en ASC, id_evento ASC`, únicamente para eventos en estado `PUBLICADO`.
- `GET /api/v1/events/:id`: detalle de un evento público activo. Eventos en otro estado o inexistentes devuelven `404`.

Ambos endpoints exponen el campo dinámico `availableCapacity` (entero >= 0), calculado como `Math.max(0, maximumCapacity - confirmedRegistrations)`. No exponen contadores internos ni datos personales (`registrations`).

### Inscripción pública

`POST /api/v1/events/:id/registrations` permite a los usuarios inscribirse a un evento público:

- **Campos requeridos:** `fullName` (mínimo 2 caracteres), `email`, `phone` (mínimo 7 caracteres), `consent` (`true` obligatorio) y `privacyVersion` (cadena no vacía). Campo opcional: `website` (honeypot).
- **Consentimiento y privacidad:** `consent: true` es obligatorio; el servidor genera y sella `consentedAt` con la fecha y hora de la solicitud y persiste `privacyVersion`. La respuesta pública `{ id, eventId, status, registeredAt }` no expone PII.
- **Protección anti-spam y rate limit:** incluye campo honeypot invisible `website` (si viene lleno devuelve `400 INVALID_REQUEST`) y límite de tasa (`429 RATE_LIMITED`) de máximo 5 solicitudes por minuto por IP.
- **Control atómico de cupos:** transacción con bloqueo de fila (`SELECT ... FOR UPDATE`) que decrementa cupos de forma atómica y previene sobreinscripción concurrente. Las inscripciones con estado `CANCELADA` no consumen cupo disponible.
- **Errores principales:**
  - `400 INVALID_REQUEST`: detección de spam por campo honeypot completado.
  - `404 EVENT_NOT_FOUND`: el evento no existe, o está en estado `BORRADOR` o `ARCHIVADO`.
  - `409 ALREADY_REGISTERED`: ya existe una inscripción registrada con ese correo (`CITEXT`, insensible a mayúsculas y minúsculas, incluso si estaba `CANCELADA`).
  - `409 EVENT_FULL`: el evento ha alcanzado su capacidad máxima sin cupos disponibles.
  - `422 EVENT_NOT_OPEN`: el evento está en estado `CANCELADO`, `FINALIZADO` o distinto de `PUBLICADO`.
  - `422 EVENT_ALREADY_STARTED`: el evento ya inició o concluyó en el pasado.
  - `422 VALIDATION_ERROR`: datos incompletos o con formato inválido (incluye consentimiento faltante o falso).
  - `422 INVALID_PRIVACY_VERSION`: versión de privacidad vacía o con solo espacios.
  - `429 RATE_LIMITED`: límite de solicitudes por IP excedido.

### Administración de eventos y participantes

Las rutas bajo `/api/v1/admin` requieren una sesión administrativa y el permiso del módulo:

- `GET /api/v1/admin/events`: listado administrativo con soporte de filtros por `status`, búsqueda `q` y paginación.
- `GET /api/v1/admin/events/:id`: consulta de evento por identificador en cualquier estado.
- `POST /api/v1/admin/events`: creación de evento (estado inicial `BORRADOR` por defecto).
- `PUT /api/v1/admin/events/:id`: actualización de campos editables (rechaza reducir capacidad por debajo de confirmadas con `422 CAPACITY_BELOW_REGISTRATIONS`).
- `PATCH /api/v1/admin/events/:id/archive`: archivado de eventos sin eliminar el registro.
- `DELETE /api/v1/admin/events/:id`: eliminación física únicamente si el evento no posee inscripciones registradas (`409 EVENT_HAS_REGISTRATIONS` en caso contrario).
- `GET /api/v1/admin/events/:id/registrations`: listado paginado y filtrable (`q`, `status`) de participantes con PII operativa para la gestión del evento.

### Modelo de concurrencia e integridad de cupos

- **Cálculo dinámico:** `availableCapacity = Math.max(0, maximumCapacity - count(CONFIRMADA))`. No existe un contador persistido de disponibilidad en base de datos.
- **Semántica de estados:** las inscripciones en estado `CONFIRMADA` consumen cupo disponible. Las inscripciones en estado `CANCELADA` no consumen cupo, pero conservan la fila y participan en la restricción de unicidad `UNIQUE(eventId, email)`.
- **Snapshot vs autoridad:** los endpoints `GET /api/v1/events` y `GET /api/v1/events/:id` entregan un snapshot informativo para la interfaz; dicho snapshot **no reserva cupo**. El endpoint `POST /api/v1/events/:id/registrations` es la única autoridad definitiva para confirmar un registro.
- **Aislamiento transaccional:** la inscripción se ejecuta en una transacción interactiva de Prisma mediante `SELECT ... FOR UPDATE` sobre la fila del evento en PostgreSQL. Las solicitudes concurrentes para un mismo evento quedan serializadas por este bloqueo a nivel de fila.
- **Validación bajo lock:** tras adquirir el bloqueo, se validan atómicamente el estado del evento, la fecha de inicio, la unicidad del correo y la cantidad de inscripciones confirmadas antes de crear el nuevo registro. Si no queda capacidad disponible, se devuelve `409 EVENT_FULL`.
- **Coordinación con administración:** el cambio administrativo de `maximumCapacity` (`PUT /api/v1/admin/events/:id`) utiliza el mismo bloqueo pesimista `SELECT ... FOR UPDATE` antes de verificar y actualizar, garantizando que `maximumCapacity` nunca quede por debajo de las confirmadas bajo los flujos soportados (`422 CAPACITY_BELOW_REGISTRATIONS`).
- **Independencia entre eventos:** las operaciones sobre eventos distintos bloquean filas independientes en PostgreSQL, evitando contención cruzada o interferencia funcional entre diferentes actividades.
- **Defensa definitiva contra duplicados:** la restricción de base de datos `UNIQUE(id_evento, correo)` junto con la extensión `CITEXT` actúa como salvaguarda estricta frente a carreras por el mismo correo en el mismo evento.

### Persistencia y base de datos (SCRUM-119 / SCRUM-123)

El contrato de persistencia reside en `prisma/schema.prisma` y en la migración `20260922170000_sprint_2_public_content`:

`Event` se mapea a `evento`: `id` → `id_evento`, `createdById` → `creado_por`, `imageId` → `id_imagen` (opcional), `name` → `nombre`, `description` → `descripcion`, `startsAt` → `inicia_en`, `location` → `ubicacion`, `maximumCapacity` → `capacidad_maxima`, `additionalInformation` → `informacion_adicional` (opcional), `status` → `estado` y `createdAt` → `creado_en`. Incluye la relación `registrations`. Los estados son `BORRADOR` (default), `PUBLICADO`, `FINALIZADO`, `CANCELADO` y `ARCHIVADO`. PostgreSQL garantiza capacidad positiva con `evento_capacidad_positiva_check`. Los índices cubren `(estado, inicia_en)`, creador e imagen. Las FK al administrador y archivo usan `ON DELETE RESTRICT` y `ON UPDATE CASCADE`.

`EventRegistration` se mapea a `inscripcion_evento`: `id` → `id_inscripcion`, `eventId` → `id_evento`, `fullName` → `nombre_completo`, `email` → `correo`, `phone` → `telefono`, `status` → `estado`, `consentedAt` → `consentimiento_en`, `privacyVersion` → `version_privacidad` y `registeredAt` → `inscrito_en`. Todos son obligatorios. La FK al evento usa las mismas políticas RESTRICT/CASCADE. Los estados son `CONFIRMADA` (default) y `CANCELADA`; el índice `(id_evento, estado)` soporta el conteo de confirmadas. Los IDs son enteros autoincrementales y las fechas son `TIMESTAMPTZ(3)`.

- `UNIQUE(eventId, email)` con `CITEXT` garantiza como máximo un registro por evento y correo, insensible a mayúsculas/minúsculas.
- Los logs no registran PII (nombres, correos o teléfonos).

### Verificación con PostgreSQL aislado

Las pruebas siguen el patrón Vitest/Prisma con base de datos aislada:

```bash
bun run test:integration:events               # restricciones de esquema, CHECK y FKs
bun run test:integration:events:api           # API pública, disponibilidad y administración
bun run test:integration:events:registration  # inscripción pública, control de cupos y participantes
```

Las suites se habilitan con `EVENTS_DATABASE_TEST=true`. `bun run test` las omite por defecto.

Para reproducir desde una instalación limpia con Compose:

```bash
POSTGRES_DB=aequvg POSTGRES_USER=aequvg POSTGRES_PASSWORD=events-test docker compose -p aequvg-events-test up -d db
DATABASE_URL=postgresql://aequvg:events-test@db:5432/aequvg docker compose -p aequvg-events-test run --rm --no-deps backend sh -c 'bun install --frozen-lockfile && bun run prisma:generate && bun run migrate:deploy && bun run test:integration:events && bun run test:integration:events:api && bun run test:integration:events:registration && bun run test && bun run typecheck && bun run build'
```

Tras revisar los resultados, se pueden eliminar los recursos de prueba con `docker compose -p aequvg-events-test down -v`.

## Variables de entorno

```bash
cp .env.example .env
```

| Variable | Uso |
| --- | --- |
| `POSTGRES_DB` | Nombre de la base creada por Docker. |
| `POSTGRES_USER` | Usuario de PostgreSQL. |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL. Debe cambiarse fuera de desarrollo. |
| `POSTGRES_PORT` | Puerto publicado por Docker, normalmente `5432`. |
| `BACKEND_PORT` | Puerto público de la API, normalmente `3000`. |
| `DATABASE_URL` | Cadena de conexión utilizada por Prisma. |
| `CORS_ORIGIN` | Origen autorizado del frontend. |
| `FRONTEND_URL` | URL base usada al regresar del inicio con Microsoft. |
| `SESSION_SECRET` | Secreto aleatorio de al menos 32 bytes para firmar JWT y vínculos de sesión. |
| `COOKIE_SECURE` | Debe ser `true` con HTTPS; producción lo fuerza en Compose. |
| `SEED_ADMIN_PASSWORD` | Contraseña local opcional para el usuario de desarrollo creado por la seed. |
| `MICROSOFT_TENANT_ID` | UUID del tenant Microsoft Entra ID de UVG. |
| `MICROSOFT_CLIENT_ID` | UUID de la aplicación registrada en Entra ID. |
| `MICROSOFT_CLIENT_SECRET` | Secreto de cliente; nunca debe versionarse. |
| `MICROSOFT_REDIRECT_URI` | Callback exacto registrado en Entra ID. |
| `LOG_LEVEL` | Nivel mínimo: `debug`, `info`, `warn`, `error` o `silent`. |
| `LOG_FORMAT` | `pretty` para desarrollo o `json` para agregadores de producción. |
| `LOG_HEALTHCHECKS` | Define si `/health` debe aparecer en los logs HTTP. |

Dentro de Docker, el host de PostgreSQL es `db`. Fuera de Docker debe cambiarse por `localhost`:

```env
DATABASE_URL=postgresql://aequvg:change-me@localhost:5432/aequvg
```

## Ejecución con Docker

Requisitos: Docker Engine y Docker Compose.

```bash
cp .env.example .env
docker compose up --build -d
```

Este comando inicia PostgreSQL y la API en modo desarrollo con recarga automática. Cuando PostgreSQL está saludable, el backend aplica las migraciones versionadas y ejecuta la seed idempotente antes de iniciar. Por ello, una base local vacía queda lista con datos de desarrollo usando un solo comando.

Servicios disponibles:

- API: `http://localhost:3000/api/v1`
- OpenAPI: `http://localhost:3000/openapi`
- Healthcheck: `http://localhost:3000/health`
- PostgreSQL: `localhost:5432`

Comandos habituales:

```bash
docker compose ps
docker compose logs -f backend
docker compose stop # Detiene y conserva contenedores y datos
docker compose down # Elimina contenedores y conserva volúmenes
```

`docker compose down -v` también elimina la base y los archivos de los volúmenes. Úsalo únicamente si realmente deseas reiniciar todos los datos locales.

## Ejecución sin Docker

Requisitos:

- Bun `1.4.2` o compatible.
- PostgreSQL 16 en ejecución.
- Una base y un usuario coherentes con `DATABASE_URL`.

```bash
bun install --frozen-lockfile
cp .env.example .env
# Edita DATABASE_URL para usar localhost.
bun run prisma:generate
bun run migrate:deploy
bun run dev
```

La seed es opcional y siempre manual:

```bash
bun run db:seed
```

`bun run dev` activa recarga automática. Para iniciar sin observar archivos usa:

```bash
bun run start
```

## Migraciones

Después de modificar `prisma/schema.prisma`, crea una migración durante el desarrollo:

```bash
bun run migrate:dev --name descripcion_del_cambio
```

En despliegues aplica únicamente migraciones ya versionadas:

```bash
bun run migrate:deploy
```

No uses `prisma db push` en producción ni edites una migración que ya haya sido aplicada.

### Verificar una base limpia

La migración inicial integra las tablas del MVP público, sus claves foráneas, restricciones e índices. Para comprobarla sin afectar tu volumen de desarrollo, usa un proyecto Compose aislado:

```bash
docker compose --project-name aequvg-mvp-clean -f docker-compose.yml up -d db
docker compose --project-name aequvg-mvp-clean -f docker-compose.yml run --rm backend bun run migrate:deploy
docker compose --project-name aequvg-mvp-clean -f docker-compose.yml run --rm backend bun run db:seed
docker compose --project-name aequvg-mvp-clean -f docker-compose.yml run --rm backend bun run db:verify
```

`db:verify` revisa que estén las tablas, claves foráneas, `CHECK`, índices y datos de desarrollo esperados. También falla si detecta una columna `BYTEA` en el esquema público. Cuando termines, elimina únicamente ese entorno aislado con:

```bash
docker compose --project-name aequvg-mvp-clean -f docker-compose.yml down -v
```

No uses ese último comando con el nombre de tu proyecto de desarrollo habitual.

## Seed: cargar y agregar datos

El seed está en `prisma/seed.ts`. Carga de forma idempotente:

- Cuatro roles administrativos y permisos RBAC.
- Un usuario ficticio de contenido; si se define `SEED_ADMIN_PASSWORD`, recibe credencial local.
- El administrador local `admin.pruebas@uvg.edu.gt`, con la contraseña documentada en la sección de autenticación, únicamente fuera de producción.
- Medios de contacto, integrantes y orden de la junta directiva.
- Bloques institucionales, una noticia y un recurso publicados de ejemplo.
- Metadatos de un PDF de ejemplo para comprobar la relación entre recursos y archivos.

Puede ejecutarse varias veces. La junta se busca por correo institucional; si existe, se actualiza. Los medios se buscan por `type` y `value`; una entrada idéntica se actualiza en lugar de duplicarse.

### Ejecutar el seed

Con Docker:

```bash
docker compose exec backend bun run db:seed
```

Sin Docker:

```bash
bun run db:seed
```

La base debe tener las migraciones aplicadas antes de ejecutar el seed. Los datos de ejemplo están marcados como contenido de desarrollo y no reemplazan contenido institucional aprobado.

Fuera de Docker la seed sigue siendo manual. El Compose de desarrollo sí la ejecuta automáticamente; el Compose de producción conserva la seed como herramienta manual.

### Archivos y PDF

PostgreSQL no almacena el contenido de PDFs ni de ningún archivo. La tabla `archivo` conserva únicamente metadatos: nombre original, `storageKey`, MIME type, tamaño, checksum, fecha y usuario que lo cargó. El binario debe vivir en el volumen `storage/` o en el proveedor externo de almacenamiento que se defina; `storageKey` es la referencia persistida en la base. La comprobación `bun run db:verify` detecta columnas binarias (`BYTEA`) en el esquema público.

### Agregar un integrante

Añade una tupla al arreglo `board` de `prisma/seed.ts`:

```ts
const board = [
  // ...integrantes existentes
  ['Nombre completo', 'Cargo', 'usuario@uvg.edu.gt']
] as const
```

El orden del arreglo se convierte en `displayOrder`, empezando en `1`. El período y el estado se definen en el objeto `data` dentro del ciclo. Después de guardar, vuelve a ejecutar el seed.

Si cambia el correo de alguien existente, actualízalo mediante la API administrativa o modifica cuidadosamente la estrategia de búsqueda: un correo nuevo se considera una persona nueva.

### Agregar un medio de contacto

Añade un objeto al arreglo `methods`:

```ts
{
  type: 'EMAIL' as const,
  label: 'Correo de divulgación',
  value: 'divulgacion@uvg.edu.gt',
  url: 'mailto:divulgacion@uvg.edu.gt',
  displayOrder: 5
}
```

Tipos permitidos: `EMAIL`, `TELEFONO`, `UBICACION`, `INSTAGRAM`, `FACEBOOK` y `OTRO`. Para cambiar el valor de un medio existente sin crear otro, usa el CRUD administrativo o adapta la búsqueda del seed para emplear una clave estable.

### Agregar otra entidad

Usa el mismo patrón repetible: busca una clave estable y luego actualiza o crea.

```ts
const existing = await prisma.institutionalBlock.findFirst({
  where: { type: 'CAMPO_LABORAL', title: 'Industria' }
})

const data = {
  type: 'CAMPO_LABORAL' as const,
  title: 'Industria',
  body: 'Contenido aprobado por la Asociación.',
  displayOrder: 1,
  status: 'PUBLICADO' as const
}

if (existing) {
  await prisma.institutionalBlock.update({ where: { id: existing.id }, data })
} else {
  await prisma.institutionalBlock.create({ data })
}
```

Solo agrega contenido autorizado y evita datos personales de prueba. Revisa el seed cuando cambien la junta, los medios o las políticas institucionales.

## Logs

El backend emite logs estructurados y configurables a `stdout`/`stderr`, para que Docker o una plataforma de observabilidad puedan recolectarlos sin depender de archivos dentro del contenedor.

En desarrollo se recomienda:

```env
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_HEALTHCHECKS=false
```

En producción:

```env
LOG_LEVEL=info
LOG_FORMAT=json
LOG_HEALTHCHECKS=false
```

Cada respuesta incluye `x-request-id`. Los logs HTTP registran únicamente identificador, método, ruta sin query string, estado y duración. No se registran cuerpos, contraseñas, tokens, correos, teléfonos ni mensajes de contacto.

Con Docker:

```bash
docker compose logs -f backend
```

Los logs de producción tienen rotación local de `10 MB` y cinco archivos en `docker-compose.prod.yml`. Para una operación real deben enviarse además a la solución de observabilidad aprobada por UVG.

## Preparación de producción

Desarrollo y producción están separados:

- `docker-compose.yml`: recarga automática, código montado y logs legibles.
- `docker-compose.prod.yml`: imagen inmutable, usuario sin privilegios, healthchecks, PostgreSQL sin puerto público y logs JSON con rotación.
- `.env.production.example`: plantilla sin secretos reales.

Prepara las variables:

```bash
cp .env.production.example .env.production
# Reemplaza todos los valores de ejemplo y usa secretos independientes.
```

Construye las imágenes:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

Aplica las migraciones de forma explícita antes de iniciar o actualizar la API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
```

Inicia los servicios sin cargar datos de ejemplo:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d db backend
```

La seed de producción también existe como herramienta manual, pero no se ejecuta durante el despliegue:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm seed
```

Ejecuta ese comando solo cuando los datos del archivo hayan sido revisados y autorizados. Antes de un despliegue real todavía deben definirse TLS/proxy inverso, almacenamiento definitivo, gestión de secretos, monitoreo centralizado y la estrategia efectiva de respaldos/restauración.

## Pruebas y calidad

```bash
bun run typecheck     # TypeScript
bun run test          # Pruebas unitarias e integración HTTP
bun run build         # Comprobación de compilación
bun run test:smoke    # Requiere PostgreSQL migrado y con seed
bun run test:integration:auth # Requiere PostgreSQL migrado
bun audit --production
```

El smoke test consulta junta y medios reales y envía un correo de contacto mediante el proveedor configurado. Ejecútalo únicamente con una dirección receptora de pruebas.

## Contrato público principal

```text
GET  /api/v1/institutional-content
GET  /api/v1/board-members
GET  /api/v1/contact-methods
POST /api/v1/contact-requests
```

Las operaciones administrativas están bajo `/api/v1/admin`, usan la sesión JWT en cookie y validan el permiso correspondiente en PostgreSQL.

## Junta Directiva e historial

`GET /api/v1/board-members` devuelve todos los integrantes con estado `ACTIVO`, no solo el periodo más reciente. La respuesta se ordena por inicio de periodo descendente, etiqueta de periodo, orden público y nombre; el frontend agrupa esos registros para consultar juntas de distintos años. Cada registro incluye `photoId` y metadatos seguros de `photo` cuando existe.

El panel usa `GET/POST/PUT/DELETE /api/v1/admin/board-members` con el permiso `BOARD_MANAGE` y CSRF en las escrituras. `DELETE` es un retiro lógico: cambia el estado a `INACTIVO` y conserva el registro. El cuerpo de alta/edición acepta nombre, cargo, descripción, correo institucional exacto `@uvg.edu.gt`, periodo visible, fechas opcionales de inicio/fin, orden, estado y `photoId` opcional. Si se indica una foto debe existir en `archivo` y tener MIME `image/*`; la carga de archivos continúa siendo un flujo separado.

Errores propios: `422 INVALID_BOARD_CONTENT`, `INVALID_INSTITUTIONAL_EMAIL`, `INVALID_TERM`, `INVALID_BOARD_PHOTO` o `INVALID_BOARD_ORDER`; `404 BOARD_MEMBER_NOT_FOUND`. El dominio institucional del integrante no concede acceso al panel ni crea permisos administrativos.
