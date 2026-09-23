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
- `prisma/seed.ts` es repetible para medios e integrantes de junta. La seed es **manual**: `bun run dev`, `bun run start`, Docker y el Dockerfile no la ejecutan.
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
