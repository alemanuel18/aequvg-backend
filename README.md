# AEQUVG Backend

Base del API REST de AEQUVG. El proyecto se inicializará con Bun, TypeScript,
Elysia, Prisma y PostgreSQL 16.

## Desarrollo con Docker

1. Copia `.env.example` como `.env` y reemplaza los valores de ejemplo.
2. Ejecuta `docker compose up --build`.

PostgreSQL queda disponible en `localhost:5432` y el API usará
`http://localhost:3000`. Mientras todavía no exista `package.json`, el
contenedor del backend permanece a la espera; al inicializar el proyecto,
instala las dependencias y ejecuta automáticamente el script `dev`.

El volumen `backend_storage` es únicamente el adaptador local de desarrollo.
No sustituye la definición posterior del proveedor de almacenamiento ni de la
estrategia institucional de respaldos.
