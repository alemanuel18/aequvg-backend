# Revisión de integración: sesión, usuarios y recuperación

## Contratos revisados

- Sesión: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` y el callback de Microsoft.
- Usuarios y roles: `GET /api/v1/admin/users`, `POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id`, `PUT /api/v1/admin/users/:id/password` y `GET /api/v1/admin/roles`.
- Alta y recuperación: solicitudes de registro, revisión administrativa, solicitudes de recuperación y restablecimiento de contraseña.
- Autorización común: `requireAdmin` delega en `authService.authenticate`, que comprueba sesión, vinculación de dispositivo, estado activo, permiso actual y CSRF en escrituras.

## Brecha detectada

`PATCH /admin/users/:id` persistía el cambio de rol/estado y luego revocaba las sesiones en una consulta independiente. `PUT /admin/users/:id/password` hacía lo mismo al guardar la contraseña. Si la revocación fallaba después del primer commit, podían quedar sesiones activas con credenciales o autorizaciones anteriores. El estado y los permisos se vuelven a consultar en cada petición, pero una sesión no revocada podría recuperar acceso si la cuenta o el rol se reactiva.

## Corrección aplicada

Persistir el cambio de usuario o contraseña y revocar sus sesiones dentro de una sola transacción. Se conserva el contrato HTTP, los permisos existentes y el esquema Prisma; no se agrega CRUD de roles.

## Referencias revisadas y límite

Se revisaron `README.md`, `package.json`, `prisma/schema.prisma`, las migraciones y los endpoints existentes. El archivo `../../Sprint1-Planificacion.docx` mencionado en `AGENTS.md` no está disponible en el workspace.
