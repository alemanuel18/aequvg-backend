# AEQUVG Backend

API REST de la Asociación de Estudiantes de Química de la Universidad del Valle de Guatemala. Expone contenido institucional, junta directiva y medios de contacto, y recibe consultas o solicitudes de reunión desde el sitio público.

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
    contact/             # Medios y solicitudes de contacto
    events/              # Estructura reservada para eventos
    news/                # Estructura reservada para noticias
    papers/              # Estructura reservada para papers
    projects/            # Estructura reservada para proyectos
    resources/           # Estructura reservada para recursos
    users/               # Estructura reservada para usuarios
  middleware/            # Autorización y limitación contra abuso
  shared/                # Base de datos, errores y utilidades comunes
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
| `SESSION_SECRET` | Secreto reservado para sesiones administrativas. |
| `ADMIN_API_KEY` | Protección temporal de `/admin`; no usar el ejemplo en producción. |

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

Espera a que los servicios estén listos y aplica las migraciones:

```bash
docker compose exec backend bun run migrate:deploy
```

Carga los datos iniciales:

```bash
docker compose exec backend bun run db:seed
```

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
bun run db:seed
bun run dev
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

## Seed: cargar y agregar datos

El seed está en `prisma/seed.ts`. Actualmente carga:

- Medios oficiales: correo, teléfono, ubicación e Instagram.
- Integrantes y orden de la junta directiva.

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

La base debe tener las migraciones aplicadas antes de ejecutar el seed.

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

## Pruebas y calidad

```bash
bun run typecheck     # TypeScript
bun run test          # Pruebas unitarias e integración HTTP
bun run build         # Comprobación de compilación
bun run test:smoke    # Requiere PostgreSQL migrado y con seed
bun audit --production
```

El smoke test consulta junta y medios reales y crea una solicitud de contacto. Ejecútalo únicamente sobre una base local o de pruebas.

## Contrato público principal

```text
GET  /api/v1/institutional-content
GET  /api/v1/board-members
GET  /api/v1/contact-methods
POST /api/v1/contact-requests
```

Las operaciones administrativas están bajo `/api/v1/admin` y requieren `Authorization: Bearer <ADMIN_API_KEY>` mientras se integra el módulo definitivo de sesiones.
