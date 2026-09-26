# AGENTS.md — Backend AEQUVG

## Alcance

Estas reglas aplican a todo `Back/aequvg-backend`. Antes de cambiar un contrato, una regla de privacidad o el esquema, revisa `../../Sprint1-Planificacion.docx`, `README.md`, `package.json`, `prisma/schema.prisma` y las migraciones. Si existe una contradicción que afecte al producto, seguridad o datos, documéntala y solicita validación; no inventes comportamiento.

## Estado actual

El backend es un monolito modular para el sitio público de la Asociación de Estudiantes de Química de UVG. En este sprint están implementados `institutional` (contenido de inicio/promoción), `board` (junta directiva) y `contact` (medios y solicitudes). `events`, `news`, `papers`, `projects`, `resources` y `users` solo tienen carpetas reservadas con `.gitkeep`; no agregues endpoints ficticios hasta que exista una tarea y contrato aprobado.

## Arquitectura

```text
src/
  app.ts                         # Elysia, CORS, OpenAPI y rutas
  server.ts                      # arranque, apagado y Prisma disconnect
  middleware/
    admin.ts                     # autorización administrativa
    rate-limit.ts                # límite de abuso público
    request-logger.ts            # requestId y log HTTP estructurado
  modules/<dominio>/
    controllers/routes.ts        # HTTP, parámetros, códigos y serialización
    dtos/schemas.ts              # validación de entrada/salida
    services/*.service.ts        # reglas, sanitización y permisos
    repositories/*.repository.ts# acceso Prisma, sin decisiones de autorización
  shared/database/prisma.ts      # cliente Prisma compartido
  shared/errors/app-error.ts     # errores públicos seguros
  shared/logging/logger.ts       # niveles y formato pretty/JSON
  shared/utils/                  # utilidades puras
prisma/schema.prisma             # modelo y enums
prisma/migrations/               # cambios versionados
prisma/seed.ts                   # datos iniciales, ejecución manual
tests/unit/                      # servicios y middleware aislados
tests/integration/               # rutas HTTP con app real
docs/aequvg-hoppscotch.json      # pruebas manuales
```

Mantén el flujo `ruta → DTO → servicio → repositorio → Prisma`. Los controladores no contienen consultas Prisma ni reglas complejas; los repositorios no deciden permisos ni aceptan estados arbitrarios. Evita ciclos entre módulos y comparte solo utilidades/contratos pequeños desde `shared`.

## Contrato y seguridad

- Las rutas públicas viven bajo `/api/v1`; OpenAPI está en `/openapi` y salud en `/health`.
- Mantén respuestas JSON, códigos HTTP y códigos de error estables. Si cambia el contrato, actualiza frontend, pruebas, Hoppscotch y README.
- Filtra datos publicados/activos en servicio o repositorio, nunca en el frontend.
- Valida y sanitiza con DTOs; aplica rate limiting a formularios públicos y no registres cuerpos de solicitudes.
- Mantén `CORS_ORIGIN` explícito; no uses `*` en producción.
- No expongas stack traces, SQL, rutas físicas, secretos ni datos administrativos.
- `ADMIN_API_KEY` protege las rutas administrativas actuales; no lo presentes como autenticación definitiva si sesiones aún no están implementadas.
- Las solicitudes de contacto requieren consentimiento y versión de privacidad.

## Prisma, migraciones y seed

- Cada cambio de `schema.prisma` requiere una migración nueva y revisada.
- Desarrollo: `bun run migrate:dev --name descripcion`; despliegue: `bun run migrate:deploy`.
- Nunca uses `prisma db push` en producción ni edites migraciones aplicadas.
- `prisma/seed.ts` es repetible para medios e integrantes de junta. `bun run dev`, `bun run start` y el Dockerfile no la ejecutan; el Compose de desarrollo la carga tras aplicar migraciones para preparar una base local limpia. Producción la conserva manual.
- Para agregar datos, modifica el arreglo/estrategia existente usando claves estables y ejecuta `bun run db:seed` después de migrar. No introduzcas credenciales o datos personales reales.
- En producción, migración y seed son servicios manuales del perfil `tools` de `docker-compose.prod.yml`.

## Logs y operación

Usa `shared/logging/logger.ts`; no uses `console.log` para eventos de aplicación. Niveles: `debug`, `info`, `warn`, `error`, `silent`; `LOG_FORMAT=pretty` en desarrollo y `json` en producción. El log HTTP solo contiene `requestId`, método, ruta sin query string, estado y duración. Nunca incluyas contraseñas, tokens, correos, teléfonos, mensajes, cuerpos ni headers sensibles. `/health` se omite salvo `LOG_HEALTHCHECKS=true`.

Toda variable nueva debe aparecer en `.env.example` y `.env.production.example`, sin secretos reales: `LOG_LEVEL`, `LOG_FORMAT`, `LOG_HEALTHCHECKS`, PostgreSQL, CORS y puertos.

## Docker y comandos

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run test:smoke             # requiere PostgreSQL migrado y seed
bun run dev                    # watch
bun run start                  # sin watch
bun run prisma:generate
```

`docker-compose.yml` usa el target `development`, monta código y expone la API en `3000`. `docker-compose.prod.yml` usa imagen de producción, usuario sin privilegios, healthchecks y logs JSON rotados. Antes de desplegar faltan dominio/TLS, secretos, respaldos, almacenamiento definitivo y observabilidad centralizada.

## Pruebas y entrega

Agrega unitarias para reglas de servicio/rate limit y de integración para rutas, códigos, `x-request-id`, errores y permisos. Ejecuta typecheck, pruebas y build; revisa OpenAPI y Hoppscotch cuando cambie el contrato. Usa una base aislada para smoke/integración y nunca borres volúmenes de otra persona. Al entregar, resume archivos, migraciones, variables, comandos, resultados y pendientes reales.

## Convención Obligatoria de Commits

La convención y reglas de commits de este proyecto están definidas en `AGENTS.md` y `commit-style.md`.

Todos los commits deben respetar estrictamente el siguiente formato:

```text
<tipo>(<scope-en-ingles>): <Mensaje descriptivo en español iniciando con Mayúscula y terminando con punto.>
```

### Reglas:

1. **Tipo (en minúsculas):**
    • `feat`: Nueva funcionalidad.
    • `fix`: Corrección de errores / bugs.
    • `test`: Añadir o modificar pruebas.
    • `chore`: Mantenimiento, dependencias, tareas generales.
    • `docs`: Documentación.
    • `refactor`: Refactorización de código sin cambio de comportamiento.
    • `style`: Formateo, estilos o estética sin afectar la lógica.
    • `ci`: Integración continua / pipelines.
    • `perf`: Mejoras de rendimiento.
2. **Scope (en inglés):**
    • Entre paréntesis `()` inmediatamente antes del separador `:`.
    • Describe el módulo o ámbito afectado en inglés.
    • Ejemplos: `(auth)`, `(cart)`, `(routes)`, `(services)`, `(ui-modals)`, `(nginx)`, `(csp)`.
3. **Separador:**
    • Dos puntos seguidos de un espacio obligatorio: `: `.
4. **Mensaje (en español):**
    • Debe iniciar obligatoriamente con Mayúscula (usando verbos en tercera persona / impersonal, ej: Se implementa..., Se actualiza..., Se corrige..., Se agrega...).
    • Debe terminar obligatoriamente con un punto final (`.`).
5. **Sin atribución de IA:**
    • No incluir firmas ni trailers en el commit como `Co-Authored-By: Assistant <...>` o menciones a herramientas de IA.

### Ejemplos válidos:

• `feat(auth): Se implementa la autenticación con tokens JWT.`
• `fix(cart): Se corrige el cálculo de impuestos en el resumen de compra.`
• `feat(routes): Se protegen los endpoints privados con validación de sesión.`
• `chore(deps): Se actualizan las dependencias principales del proyecto.`
• `test(services): Se agregan pruebas unitarias para el servicio de pagos.`
• `docs(readme): Se documentan los pasos de instalación y configuración local.`

## Convención Obligatoria de Pull Requests

La convención y reglas de ramas y Pull Requests de este proyecto están definidas en `AGENTS.md` y `pr-style.md`. La plantilla oficial se ubica en `.github/pull_request_template.md`.

### Nomenclatura de Ramas:
Las ramas deben crearse a partir de `develop` (o la rama base correspondiente) siguiendo el formato:
`<tipo>/<nombre-descriptivo-en-kebab-case>`

- `feature/`: Funcionalidades o módulos (ej: `feature/news-crud`, `feature/project-filters`, `feature/project-model`).
- `fix/`: Corrección de errores.
- `ci/`: Pipelines o infraestructura Docker de CI (ej: `ci/news-postgres-integration`).
- `test/`: Pruebas o contratos de API (ej: `feature/news-api-docs-tests` o `test/...`).
- `chore/`: Dependencias o tareas generales.
- `docs/`: Documentación técnica.
- `refactor/`: Refactorizaciones de código.
- `hotfix/`: Correcciones críticas.

### Formato del Título de Pull Request:
Debe seguir la misma estructura estricta de los commits:
```text
<tipo>(<scope-en-ingles>): <Título descriptivo en español iniciando con Mayúscula y terminando con punto.>
```

- **Tipo (en minúsculas):** `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `style`, `ci`, `perf`.
- **Scope (en inglés):** Nombre del módulo o ámbito afectado entre paréntesis (ej: `(news)`, `(projects)`, `(auth)`, `(ci)`).
- **Separador:** `: ` (dos puntos y espacio).
- **Mensaje (en español):** Inicia obligatoriamente con Mayúscula en tono impersonal y finaliza con punto (`.`).
- **Sin atribución de IA:** Prohibido incluir firmas, menciones o trailers de IA en el título o descripción de la PR.


