# Acceso de estudiantes — S4-AUTH

## Alcance

Este flujo es exclusivo para estudiantes actuales de la Universidad del Valle de Guatemala. No contempla aspirantes. El acceso estudiantil y el administrativo son dominios separados: las cuentas estudiantiles se guardan en `usuario_estudiante` y las administrativas en `usuario_administrativo`.

Una cuenta estudiantil nunca contiene un rol configurable ni permisos administrativos. La API devuelve el rol fijo `STUDENT`, asignado por el servidor, y conserva `isStudent` como dato del perfil. Un payload de registro con campos adicionales, incluido `role`, se rechaza con `422 VALIDATION_ERROR`.

## Endpoints

| Método | Ruta | Sesión | Resultado |
| --- | --- | --- | --- |
| `POST` | `/api/v1/student-auth/register` | Anónima | Crea la cuenta estudiantil; exige `firstNames`, `lastNames`, correo `@uvg.edu.gt`, contraseña robusta e `isStudent: true`. |
| `POST` | `/api/v1/student-auth/login` | Anónima | Crea cookies estudiantiles separadas y devuelve perfil, CSRF y expiración. |
| `GET` | `/api/v1/student-auth/me` | Estudiante | Consulta la sesión vigente. |
| `PATCH` | `/api/v1/student-auth/me` | Estudiante + CSRF | Actualiza nombres y apellidos del usuario de la sesión. No admite ID, correo, rol ni estado. |
| `POST` | `/api/v1/student-auth/logout` | Estudiante + CSRF | Revoca la sesión y elimina las cookies. |
| `DELETE` | `/api/v1/student-auth/account` | Revalidación | Da de baja con correo, contraseña y `confirm: true`, incluso si la cuenta está bloqueada. |
| `GET` | `/api/v1/admin/student-users` | Admin + `USERS_MANAGE` | Lista estudiantes e interesados con búsqueda `q`, filtros `status` y `type` (`ESTUDIANTE`/`INTERESADO`) y paginación. La migración `20261025140000_allow_interested_accounts` habilita el segundo tipo en la base. |
| `GET` | `/api/v1/admin/student-users/:id` | Admin + `USERS_MANAGE` | Consulta perfil e historial de cambios, actor y motivo. |
| `PATCH` | `/api/v1/admin/student-users/:id/status` | Admin + `USERS_MANAGE` + CSRF | Activa o bloquea; exige motivo, registra actor/fecha/transición y revoca sesiones al bloquear. |
| `DELETE` | `/api/v1/admin/student-users/:id` | Admin + `USERS_MANAGE` + CSRF | Da de baja con motivo mediante el servicio común de BAJA. |

Las cookies son `aequvg_student_session` y `aequvg_student_device`, ambas `HttpOnly`, más `aequvg_student_csrf`, legible por el navegador para mutaciones. No sirven en `/api/v1/auth` ni en rutas `/api/v1/admin`; los JWT usan audiencia `aequvg-student`, distinta de `aequvg-admin`.

## Alta y credenciales

- El nombre se normaliza antes del alta y se rechaza con `OFFENSIVE_NAME` antes de persistir si contiene un término bloqueado.
- La edición usa la identidad autenticada de la cookie, normaliza y modera ambos campos antes de guardar; si el nombre no pasa moderación, no hay cambios parciales. La cuenta y el tipo estudiante son de solo lectura para el usuario.
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

MOD envía un estado (`ACTIVO`, bloqueo temporal con `blockedUntil` futuro o bloqueo permanente con `reviewChannel`) y un `reason` de al menos cinco caracteres. La transacción guarda estado anterior/nuevo, motivo, fecha y actor en `historial_estado_cuenta_estudiante`. Al bloquear se revocan las sesiones; al activar no se revocan. Los cambios efectivos también limpian el contador en memoria de intentos fallidos para ese correo (cinco fallos por combinación IP/correo durante quince minutos). No se permite modificar o reactivar una cuenta dada de baja. BAJA propia y administrativa usan el mismo servicio de baja lógica, registran su motivo y revocan sesiones; la baja administrativa requiere `reason`. No hay borrado en cascada: el registro queda como `Usuario anónimo`, se eliminan credenciales, y las inscripciones existentes se conservan con nombre y contacto anonimizados. La tabla de comentarios todavía no existe en este backend; si se agrega con FK a la cuenta, su autoría podrá presentarse usando el registro anonimizado. Las rutas consultan exclusivamente `usuario_estudiante` (estudiantes e interesados); nunca listan ni modifican usuarios administrativos.

## Matriz de acceso

| Recurso | Anónimo | Estudiante | Administrador |
| --- | --- | --- | --- |
| Contenido público | Sí | Sí | Sí |
| Registro/login estudiantil | Sí | Sí, sin elevar permisos | No mediante su sesión administrativa |
| Panel personal `/mi-cuenta` | No | Sí | No mediante su sesión administrativa |
| Inscripciones a eventos | No; la interfaz solicita `/acceso` | Sí, con CSRF y reglas del evento | No mediante su sesión administrativa |
| Comentarios privados futuros | Solicitan `/acceso` | Sí, según regla del módulo | No por implicación; requieren contrato propio |
| `/api/v1/admin/**` | No | No | Sí, según RBAC |
| `/administrador` | No | No | Sí |
| Baja propia estudiantil | Con revalidación | Con revalidación | No aplica |

La navegación y el detalle de eventos permanecen disponibles sin sesión. Abrir una inscripción conserva el evento y el ancla en `returnTo`, y envía a `/acceso`; el `POST` exige cookies estudiantiles y CSRF. Comentarios privados todavía no existen; cuando se implementen deben aplicar el mismo patrón sin crear rutas ficticias por anticipado.

El panel frontend S4 presenta navegación para `Mi perfil`, `Mis eventos` y `Mis comentarios`. En esta entrega solo se edita el perfil; los listados de eventos y comentarios se conectarán desde sus módulos responsables. El perfil permite cambiar `firstNames` y `lastNames`; `email` se presenta como solo lectura y el tipo de cuenta indica Estudiante UVG.

## Respuestas y pruebas

Además de los códigos de estado anteriores, el login usa `401 INVALID_CREDENTIALS`, las sesiones vencidas o revocadas usan `401 INVALID_SESSION`, una copia en otro contexto usa `401 SESSION_REVOKED` y el límite de cinco fallos por ventana devuelve `429 AUTH_RATE_LIMITED`.

Pruebas reproducibles:

```bash
bun run typecheck
bun run test
bun run test:integration:student-auth
```

`tests/unit/student-auth.service.test.ts` cubre rol fijo, aislamiento de tablas, moderación de nombres de alta y edición, bloqueos y baja bloqueada. `tests/integration/student-auth.database.test.ts` cubre listado/detalle administrativos, historial del actor y motivo, revocación de sesiones, ambos bloqueos, baja propia y aislamiento entre dominios con PostgreSQL migrado. La colección `docs/aequvg-hoppscotch.json` contiene las peticiones manuales sin secretos reales.
