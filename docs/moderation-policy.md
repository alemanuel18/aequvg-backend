# Política de moderación y reincidencias (S4-MOD)

> **Estado: borrador para acuerdo con la Asociación. No aprobado ni vigente como política.** Esta rama de implementación se basa en `fix/s4-comments-exclude-theses` e incorpora COM, MOD, AUTH y administración. No contiene valores sancionatorios aprobados; una política solo puede activarse mediante configuración ratificada fuera del repositorio.

## Propósito y alcance

Definir, antes de automatizar sanciones, qué contenido infringe las reglas de la comunidad, cómo se normaliza para detectarlo, cómo se corrigen falsos positivos y cómo una infracción confirmada puede afectar el estado de una cuenta. Aplica a nombres del registro/perfil y a comentarios públicos (`AUTH`, `PERFIL`, `COM`, `ADMIN`). No define moderación de chat, tesis, reacciones ni otros canales.

La Asociación debe aprobar el catálogo, las excepciones, la ventana de reincidencia, cada umbral y duración de bloqueo, y el efecto de un desbloqueo sobre el contador. La persona responsable registra el acuerdo en la sección de aprobación antes de habilitar automatización.

## Situación e implementación en esta rama

Esta rama integra el detector y el motor con nombres, comentarios, autenticación, perfil y administración. La implementación mantiene un catálogo local heredado solo para rechazar contenido mientras no exista configuración ratificada; ese catálogo tampoco se declara aprobado:

- Alta de nombre detectado responde `OFFENSIVE_NAME` antes de crear la cuenta. El cambio de nombre de una cuenta existente y crear/editar comentario ejecutan MOD antes de persistir; el contenido detectado no se publica.
- Nombres y comentarios comparten normalización Unicode NFKD, equivalencia de diacríticos, minúsculas, remoción de caracteres de formato, mapeo de algunas sustituciones visuales/leet y comparación de términos completos. También se comprimen separadores de puntuación dentro de un token para detectar evasiones simples sin buscar subcadenas en palabras ordinarias. El catálogo heredado de nombres y el de comentarios aún son distintos.
- `MODERATION_POLICY_JSON` está vacío por defecto. En ese modo se conserva el rechazo léxico local y no se cuentan infracciones ni se sanciona automáticamente. Con una política que valide como aprobada, MOD aplica los términos y excepciones configurados para nombres y comentarios, y solo entonces registra infracciones de cuentas existentes.
- El motor persiste una fila por operación idempotente, versión y regla, origen, número dentro de la ventana, acción, fecha, vencimiento/canal si aplica y hash del texto normalizado; no guarda el contenido ofensivo. La transacción bloquea la fila de cuenta, comprueba la clave de operación, cuenta eventos dentro de la ventana y actualiza el contador y estado atómicamente.
- `Idempotency-Key` requerido en crear/editar comentario y cambiar perfil permite deduplicar reintentos de una operación. El frontend genera una clave para el contenido enviado y la conserva si reintenta sin cambiarlo; una edición genera clave nueva. La clave se transforma en hash ligado a cuenta y origen. Si se repite con otra evidencia responde `409`.
- Al alcanzar un paso temporal o permanente, el motor registra la transición en historial de cuenta, aplica motivo de política y revoca sesiones en la misma transacción. El estado se verifica por AUTH en rutas privadas. Solo un administrador puede cambiar un bloqueo permanente; únicamente los temporales vencen automáticamente. Vencimiento y desbloqueo aplican el efecto de contador de la política y dejan la transición auditada.
- ADMIN puede consultar en detalle de cuenta el contador, historial de estados e incidentes con evidencia hash. Los incidentes conservan fecha/regla/acción y su vínculo a la cuenta se anula al borrar físicamente la cuenta.

## Dependencia de ratificación

La implementación es configurable y comprobable con políticas de fixture, pero no contiene política productiva acordada. El modo sin configuración no activa progresión. La tarea no puede cerrarse como política hasta que la Asociación registre su versión, catálogo, excepciones, ventanas, pasos/duraciones, reversión y tratamiento de falsos positivos en la sección de aprobación.

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
| Reincidencia | Ventana configurable y conteo de infracciones confirmadas, con una unidad por envío lógico; el cliente reusa la clave al reintentar el mismo contenido. | Pendiente: duración de ventana y qué eventos confirmados cuentan | No aprobado |
| Bloqueo temporal | Tabla configurable por ordinal/umbral de reincidencia, con duración explícita por paso. | Pendiente: número de pasos, umbrales y duración de cada uno | No aprobado |
| Bloqueo permanente | Aplicarlo solo según un umbral o revisión explícitamente aprobados. | Pendiente: umbral, revisión y autoridad | No aprobado |
| Desbloqueo antes del vencimiento | Elegir si conserva, reinicia o reduce el contador; registrar actor, motivo y valor antes/después. | Pendiente: efecto sobre el contador | No aprobado |
| Vencimiento automático | Decidir si reactiva automáticamente, requiere revisión o aplica otra regla; dejar constancia de la transición automática. | Pendiente: resultado y evidencia de auditoría | No aprobado |
| Alta/perfil con nombre rechazado | Rechazar sin crear/modificar la cuenta y mostrar un mensaje neutral, sin revelar la entrada del catálogo. Ofrecer revisión cuando haya posible falso positivo. | Pendiente: mensaje y canal de revisión | No aprobado |

### Tabla configurable de `MODERATION_POLICY_JSON`

La configuración se valida al usar MOD. El repositorio no incluye un JSON aprobado; con la variable vacía solo se aplica el filtro local y no hay progresión. Cada incidente guarda la versión de política y el paso aplicado para que un cambio futuro no reescriba decisiones pasadas.

| Clave | Tipo | Valor productivo distribuido | Efecto | Aprobación |
| --- | --- | --- | --- | --- |
| `approved`, `version`, `approvedBy`, `approvedAt` | aprobación/versionado | Vacío; política inactiva | Identifica la ratificación y versión usada | Pendiente |
| `blockedTerms[]` | `{ id, scope: NAME\|COMMENT, term }` | Sin catálogo aprobado | Define detecciones aplicables a nombre/comentario | Pendiente |
| `exceptions[]` | `{ scope, exactText }` | Vacío | Exime coincidencia solo si el texto normalizado completo coincide exactamente | Pendiente: falsos positivos/contexto |
| `recurrenceWindowHours` | entero positivo | Sin definir | Ventana móvil para contar incidencias vigentes | Pendiente |
| `sanctions[]` | `{ after, action: TEMPORARY, durationHours }` o `{ after, action: PERMANENT }` | Vacío | Umbral y duración por paso, en orden no decreciente de severidad | Pendiente |
| `manualUnlockEffect` | `PRESERVE`, `RESET` o `REDUCE` | Sin definir | Aplica al contador y marca evidencia no contada, sin borrarla | Pendiente |
| `expiryEffect` | `PRESERVE`, `RESET` o `REDUCE` | Sin definir | Efecto del vencimiento temporal | Pendiente |
| `permanentReviewChannel` | texto | Sin definir | Canal devuelto al bloquear permanentemente; requerido si hay paso permanente | Pendiente |

Al aparecer una regla permanente, el parser exige `permanentReviewChannel`. Umbrales y duraciones deben ser enteros positivos, y cada bloqueo temporal posterior debe durar más que el anterior. Un JSON malformado/incompleto falla cerrado con `503 MODERATION_POLICY_INVALID`; una variable vacía mantiene el filtro local de rechazo, sin contador ni sanciones progresivas.

## Estados y transiciones

La tabla de hoy refleja las rutas/servicios revisados. La columna de política propuesta requiere ratificación y no cambia el comportamiento por sí sola.

| Estado actual | Evento | Estado resultante | Registro/efecto actual | Regla progresiva propuesta |
| --- | --- | --- | --- | --- |
| `ACTIVO` | Incidencia alcanza un paso configurado | `BLOQUEADO_TEMPORAL` o `BLOQUEADO_PERMANENTE` | Guarda incidencia/hash, transición de sistema y revoca sesiones; cada petición privada vuelve a validar estado | Solo disponible con política ratificada |
| `ACTIVO` | Administración bloquea | `BLOQUEADO_TEMPORAL` o `BLOQUEADO_PERMANENTE` | Registra actor, motivo, fecha/vencimiento/canal y revoca sesiones | Flujo ADMIN existente; sin conteo MOD implícito |
| `BLOQUEADO_TEMPORAL` | Vence `blockedUntil` y ocurre autenticación | `ACTIVO` | Reactivación perezosa con transición de sistema y efecto de contador configurable | Efecto pendiente de ratificación |
| `BLOQUEADO_TEMPORAL` | Administración desbloquea/cambia estado | `ACTIVO`, temporal o permanente | Registra actor/motivo/transición; aplica efecto configurado si pasa a activo | Efecto pendiente de ratificación |
| `BLOQUEADO_PERMANENTE` | Administración revisa y cambia estado | `ACTIVO` o temporal | No vence automáticamente; el endpoint de administración registra la transición | Autoridad/canal de revisión pendientes |
| Cualquier estado no eliminado | BAJA propia/administrativa | `ELIMINADO` | Servicio BAJA registra transición y revoca sesiones | Irreversible; fuera de la escalera de sanciones |
| `ELIMINADO` | Cualquier solicitud de cambio | Sin transición | Cuenta excluida de cambios administrativos normales | No reactivar por política MOD |

El sistema conserva la separación entre **incidente MOD** y **estado de cuenta**. Un desbloqueo cambia el acceso; no borra auditoría. El contador solo cambia según la opción configurada y la transición registra el efecto aplicado. El actor de sanción automática queda como sistema; el desbloqueo administrativo conserva el actor de sesión.

## Casos de acuerdo y prueba

Los resultados de política de esta matriz quedan pendientes hasta aprobación. Las pruebas técnicas deben distinguir el comportamiento actual del comportamiento que se autorice.

| Caso | Entrada/situación | Evidencia técnica en esta rama | Resultado de política por acordar |
| --- | --- | --- | --- |
| Nombre con término exacto del catálogo candidato | En nombres o apellidos | Rechaza con `OFFENSIVE_NAME`; alta no crea usuario | Confirmar término, excepción, mensaje y canal de revisión |
| Perfil con nombre coincidente | Edición de nombres/apellidos | Rechaza la actualización | Confirmar revisión y si cuenta como infracción |
| Coincidencia con mayúsculas o tildes | Texto con variación ortográfica | Normalización común detecta la misma regla | Ratificar el perfil común y ejemplos |
| Coincidencia dentro de otra palabra | Término candidato como parte de un nombre propio/topónimo | La comparación por token completo no bloquea el fragmento | Ratificar límites y falsos positivos |
| Caracteres invisibles/separadores insertados | Variación ofuscada | Normalización elimina caracteres de formato y comprime puntuación dentro de un token | Ratificar cobertura y casos de colisión inocua |
| Excepción inocua | Texto normalizado coincide en su totalidad con `exceptions[].exactText` | Se permite; excepciones de contexto parcial no se aplican | Ratificar canal para falsos positivos que no sean excepciones exactas |
| Comentario detectado | Texto de comentario coincide con regla | No se publica; sin política aprobada solo rechaza. Con política aprobada registra incidente | Confirmar qué coincidencias cuentan como infracción |
| Perfil detectado | Cuenta existente intenta guardar nombre | No actualiza el perfil; con política aprobada registra incidente y puede sancionar | Confirmar qué coincidencias cuentan como infracción |
| Alta detectada | Nombre coincide antes de alta | Devuelve `OFFENSIVE_NAME`; `createUser` no se llama ni se crea cuenta | Confirmar catálogo/mensaje y canal de revisión |
| Reintento con misma clave | Mismo usuario, origen, clave y evidencia | La API requiere la clave y reutiliza el incidente existente; evidencia distinta con la misma clave da 409 | Verificar que los clientes mantengan la clave por intento lógico |
| Envíos distintos dentro/fuera de ventana | Diferentes claves para el usuario | Cuenta atómicamente solo incidencias con `createdAt` dentro de la ventana configurada | Ratificar ventana y umbrales |
| Cuenta bloqueada comenta o inicia sesión | Estado no activo | AUTH impide ruta privada; comentario detectado aplica sanción antes de persistir y revoca sesiones | Ratificar duración y mensajes visibles |
| Vence bloqueo temporal | Hora actual supera `blockedUntil` | Se reactiva en autenticación, registra transición y aplica `expiryEffect` | Ratificar efecto sobre contador |
| Desbloqueo manual/permanente | ADMIN cambia estado a `ACTIVO` | Registra actor/transición; permanente no tiene vencimiento automático; aplica `manualUnlockEffect` | Ratificar efecto/autoridad |
| Catálogo causa falso positivo | Persona disputa el rechazo | No hay flujo de apelación implementado; una excepción exacta configurada permite el texto | Definir responsable, plazo, evidencia y proceso de ajuste |

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

Tras aprobar, registrar la configuración ratificada en el entorno, actualizar casos de prueba y mensajes frontend, y revisar el contrato de MOD y la evidencia de auditoría. El esquema y motor ya están implementados; con `MODERATION_POLICY_JSON` vacío no cuentan infracciones ni se aplican sanciones progresivas.
