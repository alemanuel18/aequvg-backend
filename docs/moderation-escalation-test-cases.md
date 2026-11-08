# Evidencia de escalamiento MOD (S4-MOD)

La prueba `tests/integration/moderation.database.test.ts` usa una política y cuentas desechables de fixture. Sus umbrales **no son valores aprobados ni configuración productiva**. Para ejecutarla se requiere PostgreSQL migrado:

```sh
MODERATION_DATABASE_TEST=true bunx vitest run tests/integration/moderation.database.test.ts
```

| Escenario | Comprobación persistente o de API |
| --- | --- |
| Misma infracción simultánea | Dos llamadas concurrentes con la misma clave producen un incidente, un número de ocurrencia y una sola transición temporal al alcanzar el límite fixture. |
| Umbrales fixture | La segunda operación única bloquea temporalmente; la tercera, después de desbloqueo administrativo, aplica bloqueo permanente. |
| Token ya emitido | El token previo al bloqueo deja de servir para `/student-auth/me` y sigue revocado después de un desbloqueo; debe iniciarse una sesión nueva. |
| Comentarios e inscripciones bloqueados | Las solicitudes con la sesión revocada fallan y los conteos de comentarios e inscripciones no cambian. |
| Bloqueo permanente sin vencimiento | El estado permanente conserva `blockedUntil: null`; un nuevo login sigue rechazado con `ACCOUNT_PERMANENTLY_BLOCKED`, sin transición automática ni nueva fila de auditoría. |
| Desbloqueo | La ruta administrativa rechaza una solicitud sin sesión; con permiso `USERS_MANAGE`, el historial registra actor, origen, destino y motivo para desbloqueos temporal y permanente. AUTH impide el auto desbloqueo desde perfil, cubierto también por `tests/integration/student-auth.database.test.ts`. |
| Vencimiento temporal | El login después de la fecha límite reactiva la cuenta, aplica el efecto fixture del contador, registra transición automática y emite una sesión nueva funcional. |

La suite puede omitirse deliberadamente si no se define `MODERATION_DATABASE_TEST=true`; no se considera evidencia ejecutada en ese caso. El acuerdo de catálogo, excepciones, umbrales y duraciones de la Asociación permanece fuera del alcance de esta fixture y sigue pendiente para cerrar la tarea madre.
