# Catálogo, reglas y operación del moderador (S4-MOD)

## Estado de aprobación

La política continúa **pendiente de aprobación por la Asociación**. Este documento describe el comportamiento técnico, un procedimiento operativo propuesto y el contrato compartido por MOD, AUTH y ADMIN; no aprueba términos, excepciones, plazos, umbrales ni efectos de contador. El registro de decisiones y aprobación sigue en [`moderation-policy.md`](moderation-policy.md).

No activar sanciones progresivas hasta conservar fuera del repositorio la evidencia de aprobación de la Asociación y desplegar el JSON revisado. El motor valida que `approved` sea `true` y que `approvedBy` y `approvedAt` tengan formato, pero **no autentica ni verifica la autoridad de esa aprobación**. La revisión y la autorización de despliegue son controles operativos.

## Configuración y cambios del catálogo

`MODERATION_POLICY_JSON` está vacío en ambos ejemplos de entorno. Vacío significa que el detector léxico local todavía puede rechazar nombres y comentarios, pero MOD no registra reincidencias ni aplica sanciones progresivas. Una configuración no vacía se valida al usarse; si es inválida, la operación moderada falla cerrada con `503 MODERATION_POLICY_INVALID`.

La configuración debe incluir `approved`, `version`, `approvedBy`, `approvedAt`, `recurrenceWindowHours`, `blockedTerms`, `sanctions`, `manualUnlockEffect` y `expiryEffect`. `exceptions` puede omitirse; `permanentReviewChannel` es obligatorio si existe un paso permanente. Las reglas usan `scope: NAME | COMMENT`; cada sanción temporal contiene `after`, `action: TEMPORARY` y `durationHours`; la permanente contiene `after` y `action: PERMANENT`. El parser exige identificadores de regla únicos, umbrales y valores positivos, severidad no decreciente y duración creciente entre pasos temporales.

No hay una interfaz para editar el catálogo: la fuente de operación es la configuración de entorno. El siguiente proceso es **propuesta operativa pendiente de asignar y ratificar**:

1. La Asociación designa responsable titular y suplente del catálogo, aprobadores y canal para revisar falsos positivos.
2. El responsable prepara un cambio versionado con regla, ámbito, justificación, ejemplos que deben rechazarse y casos inocuos que deben permitirse. No agrega reglas solo por coincidencia de subcadena.
3. La Asociación revisa el cambio junto con las decisiones de la política; se registra quién aprobó, fecha, versión y evidencia de acuerdo.
4. Ingeniería actualiza `MODERATION_POLICY_JSON` en un entorno no productivo, revisa la validación de configuración y ejecuta las pruebas indicadas abajo. Una versión aprobada y probada se promueve mediante el proceso de despliegue del entorno.
5. Se conserva la versión previa para rollback. Incidentes ya registrados mantienen `policyVersion`; cambiar el entorno no reescribe su evidencia.

No copiar a producción ejemplos con términos o umbrales de fixtures. El catálogo heredado de nombres y el de comentarios no son iguales; con política aprobada, las reglas se especifican por ámbito.

## Alcance y límites del detector

El detector implementado normaliza con Unicode NFKD, elimina diacríticos y caracteres de formato, convierte a minúsculas en español, mapea un conjunto acotado de caracteres visualmente similares y sustituciones leet, y compara términos completos. También compacta puntuación insertada dentro de un token para detectar evasiones sencillas. El comportamiento está en [`moderation-text.ts`](../src/shared/utils/moderation-text.ts).

Es un filtro léxico. No determina intención, destinatario, cita, ironía, contexto académico ni severidad; no detecta expresiones que no estén en el catálogo, ni garantiza detectar todas las transliteraciones o evasiones. La coincidencia por término completo evita parte de los falsos positivos por subcadenas, pero no elimina colisiones semánticas. `exceptions[].exactText` permite únicamente una excepción si el texto completo normalizado coincide; no hay excepciones parciales o por contexto.

Un texto detectado no se persiste al crear o editar el comentario ni al cambiar nombres. En alta, el nombre se revisa antes de crear la cuenta. El mensaje de respuesta no incluye el término detectado ni el hash de evidencia.

## Revisión de falsos positivos

No existe hoy un endpoint o bandeja de apelaciones MOD. La interfaz ofrece el canal institucional de contacto; el equipo debe acordar quién recibe esas consultas, cómo confirma la identidad sin pedir credenciales, el plazo de revisión y dónde registra la resolución. Hasta aprobar ese flujo, trátese como procedimiento manual y no como capacidad automatizada.

Flujo operativo propuesto:

1. La persona informa por el canal institucional el momento aproximado, pantalla u operación y el texto que desea revisar. No se le debe pedir contraseña, cookie, token CSRF ni otros secretos.
2. El moderador busca en el detalle administrativo el incidente, origen, versión de política, regla y fecha. El sistema no conserva el texto original, por lo que el hash no permite recuperar el mensaje para revisión; se usa el contexto entregado por la persona y las reglas de esa versión.
3. Si se confirma un falso positivo, el administrador autorizado puede cambiar la cuenta a `ACTIVO` con motivo concreto y referencia al caso. El cambio no elimina el incidente ni restaura sesiones revocadas: la persona vuelve a iniciar sesión.
4. El responsable del catálogo propone una corrección; la excepción o cambio de regla solo se despliega después de la aprobación aplicable. Se agregan un caso detectado y uno inocuo a la suite para evitar regresiones.
5. Si la detección fue correcta, se comunica el estado y canal de revisión aprobado sin repetir públicamente el contenido ni compartir evidencia con terceros.

El endpoint administrativo valida motivo, actor y CSRF, y deja historial de estado. La herramienta no registra la conversación de contacto ni el resultado de una apelación como entidad propia; ese registro externo y su retención siguen pendientes de definición.

## Evidencia mínima, privacidad y auditoría

Una infracción bajo política aprobada conserva: identificador, vínculo a la fila de cuenta (que permanece anonimizada en la baja lógica vigente), hash de clave de operación, origen (`COMMENT_CREATE`, `COMMENT_EDIT` o `PROFILE_NAME_UPDATE`), versión de política, regla, hash SHA-256 del texto normalizado, número de ocurrencia, sanción, vencimiento/canal si aplica, indicador de reincidencia y fecha. **No se guarda el texto ofensivo original.** Los hashes pueden permitir correlación de operaciones o textos iguales; su acceso debe limitarse al personal autorizado.

Las transiciones de cuenta conservan estado anterior y nuevo, actor administrativo (nulo para acción automática), motivo, fecha, fin de bloqueo y canal de revisión. Bloquear revoca sesiones activas y registra la razón de revocación; la persona debe iniciar una sesión nueva después de reactivarse. ADMIN consulta incidencias e historial mediante el detalle de cuenta, protegido con `USERS_MANAGE`.

No exportar hashes, reglas internas, comentarios privados ni motivos administrativos a registros públicos ni solicitudes de contacto; `evidenceHash` y `ruleId` solo aparecen en el detalle del panel ADMIN autorizado. Una aprobación de catálogo/configuración es evidencia separada: la tabla de incidentes conserva su versión, no el acta de la Asociación. El esquema no define un plazo de retención/purga para incidentes; la Asociación debe ratificarlo antes de establecer una eliminación automática de auditoría.

## Contrato compartido MOD, AUTH y ADMIN

Los estados proceden del enum `StudentAccountStatus` de Prisma y se comparten con autenticación estudiantil y administración:

| Estado | Significado para AUTH | Vencimiento y transición | Administración |
| --- | --- | --- | --- |
| `ACTIVO` | Puede iniciar sesión y usar rutas privadas con sesión válida. | Estado normal. | Bloqueo manual o MOD puede cambiarlo si la política está habilitada. |
| `BLOQUEADO_TEMPORAL` | Login y rutas privadas rechazan acceso; la respuesta puede incluir `blockedUntil`. Las sesiones activas se revocan. | Al iniciar sesión después de la fecha, AUTH reactiva la cuenta, aplica `expiryEffect` y registra transición automática. | ADMIN puede desbloquear antes con motivo y actor. |
| `BLOQUEADO_PERMANENTE` | Login y rutas privadas rechazan acceso; la respuesta puede incluir `reviewChannel`. | No vence automáticamente; `blockedUntil` es nulo para este estado. | Solo ADMIN puede revisarlo y cambiarlo a `ACTIVO`, dejando actor, motivo y transición. |
| `ELIMINADO` | No puede autenticarse ni recuperar acceso. | No se reactiva por vencimiento ni desbloqueo ordinario. | Se resuelve por BAJA; está fuera del flujo de bloqueo MOD/ADMIN. |

Contrato de errores de contenido y cuenta:

| HTTP / `error.code` | Uso | Datos permitidos al cliente |
| --- | --- | --- |
| `422 OFFENSIVE_NAME` | Alta o cambio de nombres rechazado antes de guardar. | Mensaje neutral; sin término ni regla interna. |
| `422 COMMENT_REJECTED_BY_MODERATION` | Comentario nuevo/editado rechazado antes de guardar. | Mensaje neutral; no devuelve el texto marcado. |
| `403 ACCOUNT_TEMPORARILY_BLOCKED` | Cuenta en bloqueo temporal. | `details.blockedUntil` en ISO 8601 cuando está disponible. |
| `403 ACCOUNT_PERMANENTLY_BLOCKED` | Cuenta con bloqueo permanente. | `details.reviewChannel` si fue definido en la configuración aprobada. |
| `503 MODERATION_POLICY_INVALID` / `COMMENT_MODERATION_UNAVAILABLE` | Configuración inválida o moderación no disponible. | Error genérico; no se publica el texto. |
| `409 MODERATION_OPERATION_KEY_REUSED` | Se reutilizó una clave para otra cuenta, origen o evidencia. | Mensaje genérico; no expone la evidencia existente. |

`POST /api/v1/student-auth/register` y `PATCH /api/v1/student-auth/me` moderan nombres. El cambio de perfil exige sesión, CSRF e `Idempotency-Key`. `POST /api/v1/publications/{targetType}/{targetId}/comments` y `PUT /api/v1/student-auth/me/comments/{id}` moderan comentarios antes de persistir y requieren sesión, CSRF e `Idempotency-Key`; el mismo cliente conserva la clave al reintentar la misma operación.

ADMIN gestiona el estado con `PATCH /api/v1/admin/student-users/{id}/status`, sesión administrativa, permiso `USERS_MANAGE` y `X-CSRF-Token`. El cuerpo contiene `status` y `reason` (5–1000 caracteres); temporal agrega `blockedUntil` futuro y permanente agrega `reviewChannel`. Para desbloquear se envían `status: ACTIVO` y motivo. El detalle `GET /api/v1/admin/student-users/{id}` devuelve contador, historial e incidentes, incluido `evidenceHash`; nunca debe exponerse fuera del panel autorizado.

## Pruebas y evidencia reproducible

Ejecutar desde el backend:

```sh
bunx vitest run tests/unit/moderation-engine.test.ts tests/unit/name-moderation.test.ts tests/unit/public-text-moderation.test.ts tests/unit/student-auth.service.test.ts tests/unit/comments.service.test.ts
bun run test:integration:moderation
bun run test:integration:student-auth
```

Las integraciones PostgreSQL requieren una base migrada y variables de conexión locales. La prueba de MOD está opt-in y debe ejecutarse explícitamente; una suite omitida no cuenta como evidencia. Las fixtures usan una política técnica y no aprueban valores productivos. Cubren normalización/excepciones técnicas, no la decisión humana de contexto ni el proceso externo de apelación. Véanse `tests/unit/moderation-engine.test.ts`, `tests/integration/moderation.database.test.ts` y `tests/integration/student-auth.database.test.ts`.

## Decisiones aún necesarias para cerrar la tarea madre

La Asociación debe registrar el catálogo y excepciones aprobados, normalización, definición de infracción, canal/plazo/responsable de falsos positivos, ventana/umbrales/duraciones, efectos de desbloqueo y expiración, y aprobadores/operadores del catálogo. Hasta entonces este documento es contrato operativo y lista de pendientes, no una política acordada.
