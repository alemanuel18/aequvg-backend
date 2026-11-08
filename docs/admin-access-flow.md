# Flujo de acceso al panel administrativo

## Alcance y estado de las pantallas

El acceso al panel usa sesión del backend. La pantalla disponible es `/administrador` (inicio/cierre de sesión). `/administrador/panel` muestra los módulos habilitados para la cuenta. Las rutas administrativas se protegen en el frontend para navegación y, de manera independiente, en cada endpoint del backend.

Hay una brecha entre API y pantallas que debe tenerse en cuenta al operar el sistema: el backend implementa solicitud de alta (`POST /api/v1/auth/registration-requests`), revisión (`/administrador/usuarios` usa hoy una pantalla “en construcción”), Microsoft y recuperación por correo; el frontend no contiene formularios/rutas de solicitud de alta, recuperación ni restablecimiento, ni un flujo de inicio con Microsoft. Por tanto esos procesos no pueden completarse desde la interfaz actual. La gestión de roles/estados tampoco está disponible en la pantalla de usuarios, aunque sus endpoints existen. Esta guía no presenta esas APIs como funciones de interfaz disponibles.

## Pasos de uso disponibles

1. Abrir `http://localhost:3001/administrador` (ajustar origen según despliegue).
2. Ingresar correo y contraseña de una cuenta administrativa previamente aprovisionada y activa. El dominio `@uvg.edu.gt` por sí solo no crea ni autoriza una cuenta.
3. Al autenticarse, se establece una sesión en cookies `HttpOnly`; el token no queda disponible para JavaScript. El frontend redirige al `returnTo` local seguro si venía de una ruta protegida; en otro caso abre `/administrador/panel`.
4. El panel muestra solo módulos presentes en los permisos devueltos por `/auth/me`. La autorización del backend siempre prevalece.
5. Usar **Cerrar sesión** en el menú. El servidor revoca la sesión y elimina sus cookies. Si la sesión ya expiró o fue revocada, volver a `/administrador` e iniciar sesión otra vez.

Las pantallas de acceso usan validación visible, etiquetas asociadas, foco en el primer campo inválido, estado de comprobación y bloqueo del botón mientras se envía. La navegación administrativa tiene enlace para saltar al contenido y menú adaptable a viewport estrecho.

## Contrato vigente

No se modifica ningún contrato API en esta entrega. Esquemas y respuestas exactos se mantienen en OpenAPI (`/openapi`) y en `docs/aequvg-hoppscotch.json`.

| Método y ruta | Permiso / protección | Uso y respuesta relevante |
| --- | --- | --- |
| `POST /api/v1/auth/login` | Público; rate limit | Recibe `email`, `password`; crea sesión y devuelve usuario, `csrfToken`, expiración. Cookies de sesión/dispositivo son `HttpOnly`. |
| `GET /api/v1/auth/me` | Sesión válida | Devuelve el perfil y permisos actuales. |
| `POST /api/v1/auth/logout` | Sesión y CSRF | Revoca sesión; responde `204`. |
| `GET /api/v1/auth/microsoft` y callback | Configuración Entra ID y cuenta ya aprovisionada | Flujo OpenID Connect con PKCE; no crea usuarios. Actualmente no está conectado a un botón de la UI. |
| `POST /api/v1/auth/registration-requests` | Público; rate limit | Solicita cuenta con `firstNames`, `lastNames`, correo y contraseña; queda pendiente, sin sesión ni acceso. |
| `GET /api/v1/admin/registration-requests` | `USERS_MANAGE` | Lista solicitudes pendientes. |
| `POST /api/v1/admin/registration-requests/:id/review` | `USERS_MANAGE` + CSRF | Recibe aprobación con `roleId` o rechazo. La aprobación crea la cuenta activa. |
| `GET /api/v1/admin/roles`, `/users` | `ROLES_READ` o `USERS_MANAGE` | Lee roles asignables o cuentas. |
| `POST /api/v1/admin/users` | `USERS_MANAGE` + CSRF | Alta administrativa directa. |
| `PATCH /api/v1/admin/users/:id` | `USERS_MANAGE` + CSRF | Edita perfil, rol o estado; no permite cambiar el propio rol/estado (`422 SELF_AUTHORIZATION_CHANGE`). |
| `PUT /api/v1/admin/users/:id/password` | `USERS_MANAGE` + CSRF | Establece contraseña y revoca sesiones anteriores. |
| `POST /api/v1/auth/password-recovery-requests` | Público; rate limit | Envía enlace si aplica y responde de forma genérica (`202`) para no revelar existencia de la cuenta. No hay formulario en el frontend. |
| `POST /api/v1/auth/password-resets` | Token de un solo uso | Recibe token y contraseña nueva; invalida las sesiones previas. No hay pantalla de restablecimiento en el frontend. |

Las escrituras administrativas requieren cookies con `credentials: include` y el valor `csrfToken` en `X-CSRF-Token`. No se deben copiar cookies ni tokens a reportes.

## Permisos y rechazo de acceso

| Situación | Resultado del backend |
| --- | --- |
| No existe sesión | `401 UNAUTHORIZED` |
| Sesión expirada, inválida o revocada | `401 INVALID_SESSION` o `401 SESSION_REVOKED` |
| Cuenta o rol desactivado | `403 ACCOUNT_DISABLED` |
| Sesión válida sin permiso de ruta | `403 FORBIDDEN` |
| Escritura sin CSRF válido | `403 CSRF_TOKEN_INVALID` |
| Autenticación fallida | `401 INVALID_CREDENTIALS`; intentos limitados (`429`) |

Los guards del frontend redirigen una visita sin sesión a `/administrador?returnTo=...` y un usuario sin permiso a `/administrador/panel`. Esto mejora navegación, pero no reemplaza `requireAdmin` en backend. La pantalla de acceso actual no distingue visualmente sesión expirada de otra sesión ausente: ambas terminan en el login. Registrar como defecto pendiente de UX.

Las contraseñas se derivan con `scrypt`; los JWT de sesión están en cookie `HttpOnly`, las sesiones persistidas se verifican en cada petición, y cambiar estado/rol/contraseña revoca sesiones afectadas en la misma transacción. Desactivar usuario o rol impide autorizaciones posteriores. La recuperación usa token aleatorio cuyo hash se guarda, vence en 30 minutos y se invalida al utilizarlo o emitir una solicitud nueva.

## Casos y evidencia

La matriz común de actores, respuestas y garantías de no mutación está en [`admin-flow-test-cases.md`](admin-flow-test-cases.md). Las pruebas automatizadas que cubren actualmente el contrato son `tests/integration/auth.database.test.ts`, `tests/unit/auth.service.test.ts`, `tests/unit/auth-crypto.test.ts`, `tests/unit/auth-rate-limit.test.ts` y `tests/unit/users.service.test.ts`. No existe todavía una suite dedicada de rutas para solicitudes de registro, revisión, permisos de usuarios y recuperación completa; se registra como brecha de cobertura, no como caso aprobado.

Los comandos y resultados de ejecución de esta revisión se mantienen en [`admin-flows-evidence.md`](admin-flows-evidence.md). Las pruebas que requieren PostgreSQL deben ejecutarse contra una base aislada migrada; no uses datos reales.

## Defectos registrados

- **Brecha de producto confirmada:** faltan formularios UI para solicitud de alta, recuperación/restablecimiento y acceso Microsoft; la vista de usuarios está en construcción pese a que existen endpoints. Se documenta como limitación verificable y requiere una tarea de interfaz para corregirse, sin ampliar contratos ni base de datos en esta entrega documental.
- **Defecto de experiencia confirmado:** una sesión expirada no muestra mensaje específico en login. La ruta queda protegida y el API rechaza la sesión, pero la causa se pierde al redirigir. Pendiente de corrección en la interfaz.
- No se encontró evidencia de autoasignación de rol/estado en el endpoint de usuarios: modificar el propio rol o estado se rechaza en backend.
