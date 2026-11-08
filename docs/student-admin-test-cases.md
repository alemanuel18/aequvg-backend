# Administración de cuentas normales — S4-ADMIN

## Contrato y permisos

Las rutas son `GET /api/v1/admin/student-users`, `GET /api/v1/admin/student-users/:id`, `PATCH /api/v1/admin/student-users/:id/status` y `DELETE /api/v1/admin/student-users/:id`. Listado y detalle requieren sesión administrativa autenticada y permiso `USERS_MANAGE`. Las mutaciones también requieren `X-CSRF-Token`. Las cookies/sesiones estudiantiles no autorizan estas rutas. Todas operan solamente sobre cuentas normales (`ESTUDIANTE` e `INTERESADO`); no aceptan rol como entrada ni exponen cuentas administrativas.

El listado permite búsqueda `q`, filtro `type` y `status`, además de `page` y `pageSize` (1–100). El detalle incluye historial con actor, fecha, motivo, transición y metadatos de bloqueo. Los motivos de bloqueo, desbloqueo y baja son obligatorios y deben tener entre 5 y 1000 caracteres.

## Acciones y política de reincidencia

| Acción | Datos requeridos | Efecto y reversibilidad |
| --- | --- | --- |
| Bloqueo temporal | `status: BLOQUEADO_TEMPORAL`, `blockedUntil` futuro y `reason` | Deniega el acceso y revoca sesiones activas. Al vencer, se reactiva en el siguiente acceso. Un nuevo bloqueo requiere una decisión administrativa nueva. |
| Bloqueo permanente | `status: BLOQUEADO_PERMANENTE`, `reviewChannel` y `reason` | Deniega acceso y revoca sesiones. No vence ni se levanta automáticamente, aunque haya una fecha antigua en datos; exige desbloqueo administrativo explícito. |
| Desbloqueo | `status: ACTIVO` y `reason` | Conserva cuenta e historial. No restaura sesiones revocadas; la persona inicia sesión de nuevo. Sirve para corregir un falso positivo. |
| Baja administrativa | `reason` en `DELETE` | Invoca BAJA; establece `ELIMINADO`, anonimiza datos personales, revoca sesiones y conserva comentarios e inscripciones anonimizados. No admite reactivación. Una repetición devuelve `409`. |

El sistema registra actor, fecha, motivo y transición de estado. Las repeticiones que no cambian el estado efectivo no crean una transición duplicada. No existe una regla de escalamiento automático por reincidencia en la implementación: la respuesta a una nueva incidencia queda a criterio administrativo, y cada acción debe registrar su motivo. Los cambios efectivos limpian el contador de intentos fallidos de acceso del correo.

## Matriz de regresión y evidencia

| Escenario | Comportamiento esperado | Evidencia existente |
| --- | --- | --- |
| Visitante: listado, detalle, bloqueo, desbloqueo y baja | `401`; sin cambios persistidos | `tests/integration/student-auth.database.test.ts`, matriz de métodos sin sesión |
| Sesión estudiantil: mismos cinco intentos | `403`; no eleva permisos ni cambia cuenta | `tests/integration/student-auth.database.test.ts`, matriz de autorización |
| Administrador sin `USERS_MANAGE` | `403`; no opera sobre cuentas normales | `tests/integration/student-auth.database.test.ts`, configuración de admin no autorizado |
| Payload con intento de modificar rol/campos extra | `422`; las rutas no conceden rol o permisos | DTO estricto `studentStatusBody` / `managedStudentDeleteBody` y pruebas de contrato |
| Buscar, filtrar y paginar estudiantes/interesados | `q`, `type`, `status`, `page` y `pageSize` producen resultados aislados y deterministas | `tests/integration/student-auth.database.test.ts`, prueba de listado administrativo |
| Detalle de cuenta normal | Perfil más historial de actor, motivo, fecha y transición; nunca una cuenta administrativa | `tests/integration/student-auth.database.test.ts`, prueba de administración e historial |
| Bloqueo temporal y permanente | Valida motivo y metadatos; bloqueo revoca sesión inmediatamente | `tests/integration/student-auth.database.test.ts`, pruebas de MOD y sesión |
| Falso positivo / desbloqueo | La cuenta vuelve a `ACTIVO`, se audita el cambio y se requiere login nuevo | `tests/integration/student-auth.database.test.ts`, pruebas de desbloqueo y repetición |
| Permanente con vencimiento pasado | Sigue bloqueada hasta acción manual; no hay desbloqueo automático | `tests/unit/student-auth.service.test.ts` |
| Baja de usuario activo o bloqueado | BAJA anonimiza identidad y revoca sesiones; mantiene comentarios e inscripciones/cupos; repetición no duplica efectos | `tests/integration/student-auth.database.test.ts`; `tests/integration/comments.database.test.ts` |
| Regresión del panel S3 | La pantalla mantiene búsqueda, filtros por tipo/estado, paginación, detalle e historial; motivo y consecuencias aparecen antes de confirmar; doble clic no duplica acciones; la lista contiene solo cuentas normales | Backend: `tests/integration/student-auth.database.test.ts`. Frontend: checklist manual abajo sobre `StudentAccountManagementPanel.vue`; actualmente no hay E2E dedicado a este panel. |

## Pruebas manuales con Hoppscotch

1. Iniciar sesión como administrador de pruebas y conservar las cookies administrativas; obtener token CSRF del login.
2. Ejecutar `S4 — listar cuentas normales` variando `q`, `type`, `status`, `page` y `pageSize`; guardar un `id` normal como `studentUserId`.
3. Consultar detalle y verificar `statusHistory`.
4. Probar bloqueo temporal con `blockedUntil` futuro, verificar que la sesión del estudiante queda revocada y comprobar el historial.
5. Desbloquear con `status: ACTIVO`, motivo de revisión y hacer login nuevo. Repetir el PATCH y verificar que no aparece una transición duplicada.
6. Probar bloqueo permanente y confirmar que no se reactiva al vencer una fecha. Para limpieza manual, usar una cuenta de prueba separada y ejecutar la baja: comprobar anonimización, conservación de comentarios/inscripciones y respuesta `409` al repetirla.
7. Ejecutar solicitudes negativas de visitante y estudiante. Deben devolver `401`/`403` y no afectar la cuenta.

La colección usa variables locales, no contiene credenciales reales y requiere adaptar `baseUrl`, cookies, CSRF e IDs al entorno aislado. No ejecutar la baja sobre cuentas reales.

### Checklist manual del panel S3

En `/administrador` con una cuenta que tenga `USERS_MANAGE`:

1. Abrir «Cuentas normales» y confirmar búsqueda por nombre/correo, filtros de estudiante/interesado y estado, botones de página anterior/siguiente y conteo de resultados.
2. Abrir un detalle; verificar tipo, estado, canal o fecha del bloqueo e historial con actor, fecha, transición y motivo. Confirmar que usuarios del panel administrativo no aparecen en este listado.
3. Intentar continuar con motivo vacío o menor de cinco caracteres. Para bloqueo temporal probar fecha vencida; para permanente probar canal vacío. El panel debe mostrar validación y no enviar la acción.
4. Aplicar bloqueo y revisar la confirmación de consecuencias (revocación de sesiones y fin/canal de revisión); pulsar confirmar repetidamente durante la carga y verificar un único cambio e historial.
5. Desbloquear una cuenta y verificar confirmación, conservación de identidad e historial y necesidad de iniciar sesión de nuevo.
6. En una cuenta de prueba, dar de baja y comprobar confirmación irreversible, datos anonimizados y conservación de comentarios e inscripciones/cupos. Actualizar el listado y verificar estado `ELIMINADO` sin opción de desbloqueo.
7. Recargar y volver a consultar detalle después de cada acción para verificar estado e historial persistidos.

## Comandos de evidencia

```bash
bun run test -- tests/integration/app.test.ts tests/unit/student-auth.service.test.ts
bun run test:integration:student-auth
bun run typecheck
```

La prueba de integración de cuentas requiere PostgreSQL con las migraciones aplicadas. Mantener la base de pruebas aislada; las acciones de baja son intencionalmente irreversibles.
