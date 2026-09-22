# AEQUVG Backend

API REST de AEQUVG implementada con Bun, TypeScript, Elysia, Prisma y PostgreSQL 16.

## Desarrollo con Docker

1. Copia `.env.example` como `.env` y reemplaza los valores de ejemplo.
2. Ejecuta `docker compose up --build`.

PostgreSQL queda disponible en `localhost:5432` y el API usará
`http://localhost:3000`. Mientras todavía no exista `package.json`, el
contenedor del backend permanece a la espera; al inicializar el proyecto,
instala las dependencias y ejecuta automáticamente el script `dev`.

La API pública incluye contenido institucional, junta directiva, medios de
contacto y recepción de solicitudes. OpenAPI está disponible en `/openapi` y
la colección de Hoppscotch en `docs/aequvg-hoppscotch.json`.

Antes de iniciar ejecuta `bun install`, `bun run prisma:generate`,
`bun run migrate:dev` y `bun run db:seed`. El seed refleja los datos del
prototipo aprobado en septiembre de 2026; deben reconfirmarse cuando cambie la
junta o los canales oficiales.

El volumen `backend_storage` es únicamente el adaptador local de desarrollo.
No sustituye la definición posterior del proveedor de almacenamiento ni de la
estrategia institucional de respaldos.
