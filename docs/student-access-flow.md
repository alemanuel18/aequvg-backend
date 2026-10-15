# Acceso de estudiantes — S4-AUTH

## Alcance

Este flujo es exclusivo para estudiantes actuales de la Universidad del Valle de Guatemala. No contempla aspirantes. El acceso estudiantil y el administrativo son dominios separados: las cuentas estudiantiles se guardan en `usuario_estudiante` y las administrativas en `usuario_administrativo`.

Una cuenta estudiantil nunca contiene un rol configurable ni permisos administrativos. La API devuelve el rol fijo `STUDENT`, asignado por el servidor, y conserva `isStudent` como dato del perfil. Un payload de registro con campos adicionales, incluido `role`, se rechaza con `422 VALIDATION_ERROR`.

## Endpoints

| Método | Ruta | Sesión | Resultado |
| --- | --- | --- | --- |
| `POST` | `/api/v1/student-auth/register` | Anónima | Crea la cuenta estudiantil; exige nombre, correo `@uvg.edu.gt`, contraseña robusta e `isStudent: true`. |
| `POST` | `/api/v1/student-auth/login` | Anónima | Crea cookies estudiantiles separadas y devuelve perfil, CSRF y expiración. |
| `GET` | `/api/v1/student-auth/me` | Estudiante | Consulta la sesión vigente. |
| `POST` | `/api/v1/student-auth/logout` | Estudiante + CSRF | Revoca la sesión y elimina las cookies. |
| `DELETE` | `/api/v1/student-auth/account` | Revalidación | Da de baja con correo, contraseña y `confirm: true`, incluso si la cuenta está bloqueada. |
| `PATCH` | `/api/v1/admin/student-users/:id/status` | Admin + `USERS_MANAGE` + CSRF | Activa o bloquea la cuenta y revoca todas sus sesiones en la misma transacción. |

Las cookies son `aequvg_student_session` y `aequvg_student_device`, ambas `HttpOnly`, más `aequvg_student_csrf`, legible por el navegador para mutaciones. No sirven en `/api/v1/auth` ni en rutas `/api/v1/admin`; los JWT usan audiencia `aequvg-student`, distinta de `aequvg-admin`.

## Alta y credenciales

- El nombre se normaliza antes del alta y se rechaza con `OFFENSIVE_NAME` antes de persistir si contiene un término bloqueado.
- El correo se normaliza a minúsculas y debe terminar en `@uvg.edu.gt`.
- La contraseña tiene de 12 a 128 caracteres y debe incluir mayúscula, minúscula, número y símbolo. Solo se guarda su hash `scrypt`.
- `correo` es único en la tabla estudiantil; un duplicado responde `409 EMAIL_ALREADY_REGISTERED`.
- Una cuenta administrativa existente no puede autenticarse como estudiante por el solo hecho de existir en la tabla administrativa, ni una cuenta estudiantil puede entrar al login administrativo.

## Estados de cuenta

| Estado | Acceso normal | Respuesta de login/sesión |
| --- | --- | --- |
| `ACTIVO` | Permitido | Sesión de ocho horas vinculada al dispositivo. |
| `BLOQUEADO_TEMPORAL` | Denegado hasta la fecha | `403 ACCOUNT_TEMPORARILY_BLOCKED`, con `details.blockedUntil`. Al vencer, el siguiente acceso reactiva la cuenta. |
| `BLOQUEADO_PERMANENTE` | Denegado | `403 ACCOUNT_PERMANENTLY_BLOCKED`, con `details.reviewChannel`. |
| `ELIMINADO` | Denegado | `403 ACCOUNT_DELETED`; todas las sesiones quedan revocadas. |

MOD puede enviar `{ "status": "ACTIVO" }`, un bloqueo temporal con `blockedUntil` futuro o un bloqueo permanente con `reviewChannel`. La operación revoca todas las sesiones abiertas dentro de la misma transacción. BAJA aplica la misma regla al eliminar la cuenta. Las credenciales se conservan tras la baja lógica para impedir recreaciones ambiguas y permitir trazabilidad; no conceden acceso.

## Matriz de acceso

| Recurso | Anónimo | Estudiante | Administrador |
| --- | --- | --- | --- |
| Contenido público | Sí | Sí | Sí |
| Registro/login estudiantil | Sí | Sí, sin elevar permisos | No mediante su sesión administrativa |
| Panel personal `/mi-cuenta` | No | Sí | No mediante su sesión administrativa |
| Comentarios e inscripciones privadas futuras | Solicitan `/acceso` | Sí, según regla del módulo | No por implicación; requieren contrato propio |
| `/api/v1/admin/**` | No | No | Sí, según RBAC |
| `/administrador` | No | No | Sí |
| Baja propia estudiantil | Con revalidación | Con revalidación | No aplica |

La navegación pública permanece disponible sin sesión. Comentarios privados todavía no existen; cuando se implementen deben conservar el destino en `returnTo` y enviar a `/acceso`. Las inscripciones públicas actuales siguen disponibles sin sesión porque su contrato vigente exige datos y consentimiento propios.

## Respuestas y pruebas

Además de los códigos de estado anteriores, el login usa `401 INVALID_CREDENTIALS`, las sesiones vencidas o revocadas usan `401 INVALID_SESSION`, una copia en otro contexto usa `401 SESSION_REVOKED` y el límite de cinco fallos por ventana devuelve `429 AUTH_RATE_LIMITED`.

Pruebas reproducibles:

```bash
bun run typecheck
bun run test
bun run test:integration:student-auth
```

`tests/unit/student-auth.service.test.ts` cubre rol fijo, aislamiento de tablas, nombres, bloqueos y baja bloqueada. `tests/integration/student-auth.database.test.ts` cubre acceso anónimo, estudiante y administrador; payload manipulado; duplicados; login/logout/recarga; revocación; ambos bloqueos; baja y regresión administrativa con PostgreSQL migrado. La colección `docs/aequvg-hoppscotch.json` contiene las peticiones manuales sin secretos reales.
