# Política de moderación y reincidencias

## Acuerdo vigente

La Asociación de Estudiantes de Química UVG comunicó el siguiente esquema, aplicado en la política técnica `aeq-2026-11-21`:

- Se cuenta una falta por cada envío lógico rechazado en comentarios o actualización de nombres de una cuenta existente. Los reintentos idempotentes no duplican faltas.
- Se cuentan faltas de los últimos 12 meses.
- Primera falta: se rechaza el contenido y se muestra una advertencia.
- Segunda falta: bloqueo temporal de 7 días.
- Tercera falta: bloqueo permanente.
- El desbloqueo temporal conserva las faltas que aún estén dentro de la ventana de 12 meses.
- La persona puede apelar un bloqueo permanente después de seis meses escribiendo a `asoquimica@uvg.edu.gt`. El bloqueo no vence automáticamente; se requiere revisión administrativa.
- Un administrador puede corregir antes un falso positivo. Debe escribir «falso positivo» o «error de moderación» en el motivo para dejar constancia.

## Alcance del detector

MOD revisa nombres y comentarios públicos. La política versionada y el catálogo están en `src/modules/moderation/services/moderation-policy.ts`; si `MODERATION_POLICY_JSON` está vacío, se carga la política incluida en código. Un valor no vacío sustituye la política y debe satisfacer su esquema.

El catálogo incluye insultos y vulgaridades frecuentes en español de Guatemala y expresiones comunes en inglés. La normalización contempla Unicode, diacríticos, caracteres invisibles y sustituciones visuales configuradas. La coincidencia se hace por término completo. No hay un catálogo literalmente exhaustivo: el vocabulario cambia, aparecen variantes y el filtro no entiende intención, cita, ironía o contexto académico. Puede producir falsos positivos; reportarlos a `asoquimica@uvg.edu.gt` para revisión.

El texto rechazado no se persiste. Los incidentes conservan origen, regla, versión, contador, fecha y hash del texto normalizado, pero no el texto ofensivo. Si ADMIN confirma un falso positivo, puede excluir esa incidencia del contador desde el detalle de cuenta; se conserva el incidente y se registra revisor, fecha y motivo. La exclusión no desbloquea automáticamente una cuenta sancionada; el desbloqueo se registra como una acción administrativa separada.

## Operación y privacidad

ADMIN consulta incidentes e historial con permiso `USERS_MANAGE`. Los cambios manuales requieren CSRF y guardan actor, motivo y transición. La cuenta vuelve a estar disponible después de resolver la apelación; el admin debe registrar el motivo. No se almacena la conversación de apelación como entidad del sistema, así que su registro y retención se coordinan por el correo de la Asociación.

La aprobación indicada es la confirmación de la Asociación compartida en esta conversación. El validador técnico verifica estructura y metadata, pero no autentica por sí mismo a quien aprobó una política.
