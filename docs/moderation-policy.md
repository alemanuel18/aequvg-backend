# Política de moderación y reincidencias (S4-MOD)

> **Estado: borrador para acuerdo con la Asociación. No aprobado ni vigente como política.** Los valores pendientes de esta guía no deben convertirse en sanciones automáticas ni comunicarse como reglas aprobadas. La implementación actual descrita abajo es evidencia del código revisado, no una ratificación de su catálogo.

## Propósito y alcance

Definir, antes de automatizar sanciones, qué contenido infringe las reglas de la comunidad, cómo se normaliza para detectarlo, cómo se corrigen falsos positivos y cómo una infracción confirmada puede afectar el estado de una cuenta. Aplica a nombres del registro/perfil y a comentarios públicos (`AUTH`, `PERFIL`, `COM`, `ADMIN`). No define moderación de chat, tesis, reacciones ni otros canales.

La Asociación debe aprobar el catálogo, las excepciones, la ventana de reincidencia, cada umbral y duración de bloqueo, y el efecto de un desbloqueo sobre el contador. La persona responsable registra el acuerdo en la sección de aprobación antes de habilitar automatización.

## Situación observada en el repositorio

La rama revisada contiene estos comportamientos; son punto de partida técnico, no política aprobada:

- El alta y la edición de nombres llaman `containsOffensiveName`. Si encuentra un término, devuelven `OFFENSIVE_NAME`; el alta falla antes de crear la cuenta. El perfil también rechaza la edición.
- El filtro de nombres y MOD para comentarios tienen listas léxicas separadas. Comparten comparación por términos completos, pero su normalización difiere: nombres usa NFD, quita tildes, minúsculas y separadores; comentarios usa NFKD, quita caracteres invisibles específicos y separa por caracteres no alfanuméricos. Las listas no coinciden.
- MOD rechaza un comentario antes de persistirlo con `COMMENT_REJECTED_BY_MODERATION`. No registra un incidente ni incrementa reincidencias.
- Los estados actuales de cuenta son `ACTIVO`, `BLOQUEADO_TEMPORAL`, `BLOQUEADO_PERMANENTE` y `ELIMINADO`. Administración puede cambiar el estado, guardar actor, fecha, motivo y transición; al bloquear se revocan sesiones. El bloqueo temporal vence y se reactiva al procesar una autenticación; esa reactivación automática no agrega una fila al historial de estados.
- No existe contador/ventana de infracciones, catálogo configurable aprobado ni regla automática que convierta rechazos MOD en sanciones progresivas. Las pruebas actuales verifican el filtro y el rechazo de nombres, no un acuerdo de la Asociación.

## Decisiones para ratificar

Las propuestas son opciones para revisión. **Ninguna está aprobada por esta documentación.** El equipo puede reemplazarlas o rechazarlas en el registro de acuerdo.

| Decisión | Propuesta sometida a revisión | Valor/acuerdo de la Asociación | Estado |
| --- | --- | --- | --- |
| Catálogo inicial | Un catálogo versionado, mantenido por la Asociación, con términos directos y reglas por idioma. Consolidar y revisar las listas existentes antes de usarlas. | Pendiente: lista, idiomas, responsable y fecha de revisión | No aprobado |
| Qué constituye infracción | Separar `coincidencia automática`, `contenido rechazado` e `infracción confirmada`. Contar solo eventos que la política autorice; no equiparar cada coincidencia a una infracción. | Pendiente: qué coincidencias son suficientes y cuáles requieren revisión | No aprobado |
| Normalización | Un perfil común para nombres y comentarios: normalización Unicode, equivalencia de diacríticos, minúsculas, tratamiento de invisibles, separadores y coincidencia por término completo. Versionarlo y probar palabras compuestas y falsos positivos. | Pendiente: perfil exacto y casos de transliteración/obfuscación | No aprobado |
| Excepciones | Revisar contexto de cita, análisis académico, denuncia, referencia a una infracción o uso no dirigido antes de sancionar. No crear excepciones amplias que desactiven el filtro por subcadena sin revisión. | Pendiente: excepciones válidas y quién puede resolverlas | No aprobado |
| Primer rechazo de comentario | Rechazar el contenido que coincida con una regla aprobada; decidir por separado si el caso suma infracción. | Pendiente: relación rechazo/conteo | No aprobado |
| Falsos positivos | Mantener el contenido sin publicar; proveer un canal de revisión, resultado auditable y corrección del catálogo/regla. No sancionar mientras el caso esté disputado, si la Asociación aprueba este criterio. | Pendiente: canal, plazo, revisor y efecto del reclamo | No aprobado |
| Reincidencia | Ventana configurable y conteo de infracciones confirmadas, con una unidad por envío lógico; un reintento técnico no debe multiplicar eventos. | Pendiente: duración de ventana y deduplicación | No aprobado |
| Bloqueo temporal | Tabla configurable por ordinal/umbral de reincidencia, con duración explícita por paso. | Pendiente: número de pasos, umbrales y duración de cada uno | No aprobado |
| Bloqueo permanente | Aplicarlo solo según un umbral o revisión explícitamente aprobados. | Pendiente: umbral, revisión y autoridad | No aprobado |
| Desbloqueo antes del vencimiento | Elegir si conserva, reinicia o reduce el contador; registrar actor, motivo y valor antes/después. | Pendiente: efecto sobre el contador | No aprobado |
| Vencimiento automático | Decidir si reactiva automáticamente, requiere revisión o aplica otra regla; dejar constancia de la transición automática. | Pendiente: resultado y evidencia de auditoría | No aprobado |
| Alta/perfil con nombre rechazado | Rechazar sin crear/modificar la cuenta y mostrar un mensaje neutral, sin revelar la entrada del catálogo. Ofrecer revisión cuando haya posible falso positivo. | Pendiente: mensaje y canal de revisión | No aprobado |

### Tabla configurable propuesta

Usar configuración versionada y validada; no fijar los campos pendientes como constantes en código. Cada sanción debe guardar una copia de la versión de política y del paso aplicado para que un cambio futuro no reescriba decisiones pasadas.

| Clave propuesta | Tipo | Valor inicial | Efecto | Aprobación |
| --- | --- | --- | --- | --- |
| `catalog.version` | identificador/lista | Sin versión aprobada | Identifica catálogo vigente | Pendiente |
| `normalization.version` | identificador | Sin versión común aprobada | Identifica reglas de normalización | Pendiente |
| `review.requiredFor` | reglas/categorías | Sin definir | Envía coincidencias ambiguas a revisión | Pendiente |
| `reincidence.window` | duración | Sin definir | Limita qué infracciones confirmadas cuentan juntas | Pendiente |
| `sanctions.steps[]` | umbral + estado + duración | Vacío | Mapea reincidencia a bloqueo temporal | Pendiente |
| `sanctions.permanentThreshold` | umbral/revisión | Sin definir | Determina si se permite bloqueo permanente | Pendiente |
| `counter.onManualUnlock` | `PRESERVE`, `RESET` o `REDUCE` | Sin definir | Define impacto de desbloqueo temprano | Pendiente |
| `counter.onExpiry` | `PRESERVE`, `RESET` o `REDUCE` | Sin definir | Define efecto del vencimiento | Pendiente |
| `rejectedSubmission.counts` | booleano/regla | Sin definir | Separa rechazo de infracción confirmada | Pendiente |

El despliegue debe fallar cerrado para sanciones progresivas si falta una configuración aprobada: puede rechazar contenido según el filtro vigente, pero no inventar umbrales ni imponer un bloqueo progresivo sin regla ratificada.

## Estados y transiciones

La tabla de hoy refleja las rutas/servicios revisados. La columna de política propuesta requiere ratificación y no cambia el comportamiento por sí sola.

| Estado actual | Evento | Estado resultante | Registro/efecto actual | Regla progresiva propuesta |
| --- | --- | --- | --- | --- |
| `ACTIVO` | Administración bloquea temporalmente | `BLOQUEADO_TEMPORAL` | Motivo, actor, fecha, vencimiento; revoca sesiones | Duración debe salir de `sanctions.steps[]` solo tras aprobación |
| `ACTIVO` | Administración bloquea permanentemente | `BLOQUEADO_PERMANENTE` | Motivo, actor, fecha, canal de revisión; revoca sesiones | Umbral/autoridad pendientes |
| `BLOQUEADO_TEMPORAL` | Vence `blockedUntil` y ocurre autenticación | `ACTIVO` | Reactivación perezosa; hoy no crea historial de transición | Debe decidirse contador y registro del vencimiento |
| `BLOQUEADO_TEMPORAL` | Administración cambia estado | `ACTIVO`, temporal o permanente | Registra transición si hubo cambio; revoca sesiones si el destino no es activo | Efecto del desbloqueo sobre contador pendiente |
| `BLOQUEADO_PERMANENTE` | Administración cambia estado | `ACTIVO`, temporal o permanente | Registra transición si hubo cambio; requiere motivo | Revisión, autoridad y contador pendientes |
| Cualquier estado no eliminado | BAJA propia/administrativa | `ELIMINADO` | Servicio BAJA registra transición y revoca sesiones | Irreversible; fuera de la escalera de sanciones |
| `ELIMINADO` | Cualquier solicitud de cambio | Sin transición | Cuenta excluida de cambios administrativos normales | No reactivar por política MOD |

Para la política aprobada, conservar la separación entre **incidente MOD** y **estado de cuenta**. Un desbloqueo cambia el acceso; no borra auditoría. El contador solo cambia según la opción aprobada y debe guardar motivo, actor, instante y valores anteriores/nuevos. El vencimiento automático también debe tener auditoría si la Asociación lo adopta.

## Casos de acuerdo y prueba

Los resultados de política de esta matriz quedan pendientes hasta aprobación. Las pruebas técnicas deben distinguir el comportamiento actual del comportamiento que se autorice.

| Caso | Entrada/situación | Resultado técnico actual | Resultado de política por acordar |
| --- | --- | --- | --- |
| Nombre con término exacto del catálogo candidato | En nombres o apellidos | Rechaza con `OFFENSIVE_NAME`; alta no crea usuario | Confirmar término, excepción, mensaje y canal de revisión |
| Perfil con nombre coincidente | Edición de nombres/apellidos | Rechaza la actualización | Confirmar revisión y si cuenta como infracción |
| Coincidencia con mayúsculas o tildes | Texto con variación ortográfica | Los filtros actuales normalizan de forma distinta | Ratificar normalización común y pruebas de equivalencia |
| Coincidencia dentro de otra palabra | Término candidato como parte de un nombre propio/topónimo | La comparación por token completo no bloquea el fragmento | Ratificar límites y falsos positivos |
| Caracteres invisibles/separadores insertados | Variación ofuscada | Comentarios quita ciertos invisibles; nombres no | Decidir cobertura común y comportamiento esperado |
| Cita o uso académico | Texto contiene término candidato sin insultar a una persona | El filtro léxico de comentarios puede rechazarlo; no hay revisión implementada | Definir excepción/revisión y si cuenta como infracción |
| Comentario rechazado varias veces por reintento de red | Mismo envío lógico | Cada petición vuelve a MOD; no existe conteo de sanción | Deduplicar incidente para que reintentos no incrementen reincidencia |
| Envíos diferentes rechazados | Varias infracciones potenciales | Se rechaza cada texto; no se persiste historial MOD | Definir confirmación, ventana y conteo |
| Cuenta bloqueada comenta o inicia sesión | Estado no activo | AUTH impide el acceso según estado; bloque temporal devuelve fecha | Verificar que duración y texto de UI correspondan a configuración aprobada |
| Vence bloqueo temporal | Hora actual supera `blockedUntil` | Se activa al autenticar; sin transición en historial | Ratificar reactivación y si conserva/reinicia/reduce contador |
| Desbloqueo manual | ADMIN cambia estado a `ACTIVO` | Se registra actor/motivo/transición; no hay contador MOD | Elegir efecto sobre el contador y requerir revisión/motivo |
| Catálogo causa falso positivo | Persona disputa el rechazo | No hay endpoint o flujo de apelación MOD observado | Definir responsable, plazo, evidencia y corrección |

## Acuerdo de la Asociación

Completar en una revisión formal; el documento no sustituye ese acuerdo.

| Campo | Registro |
| --- | --- |
| Asociación/representantes que revisaron | Pendiente |
| Fecha y versión aprobada | Pendiente |
| Catálogo y excepciones adjuntos | Pendiente |
| Normalización aprobada | Pendiente |
| Umbrales, ventana y duración por paso | Pendiente |
| Efecto de desbloqueo/vencimiento | Pendiente |
| Tratamiento de falsos positivos y canal | Pendiente |
| Responsable de actualizar configuración | Pendiente |

Tras aprobar, actualizar casos de prueba, contrato de MOD, comportamiento de AUTH/PERFIL/COM/ADMIN, mensajes frontend y evidencia de auditoría. No agregar contador, modelo de incidentes ni automatización de sanciones hasta que estos campos tengan valores aprobados y responsables.
