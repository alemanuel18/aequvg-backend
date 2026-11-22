# Propuesta de contrato para automatizar el catálogo de tesis

Actualizado: 22 de noviembre de 2026. Este documento da seguimiento a SCRUM-308 y a la investigación técnica 50309. Describe una propuesta para discutir; no es una decisión aprobada por la Asociación ni una autorización de UVG.

## Estado y recomendación

La evidencia pública confirma que el repositorio UVG usa DSpace y que la colección “Tesis - Química” puede consultarse mediante la API de lectura. La página institucional de DITA asigna a la Unidad de Plataformas Académicas la administración de DSpace, incluidos roles, metadatos, catálogos y monitoreo. La página de Bibliotecas identifica el repositorio como el lugar para consultar trabajos de graduación. Ninguna fuente consultada publica permiso para que AEQUVG automatice consultas, sus límites de uso, garantía de disponibilidad o una autorización de depósito.

**Recomendación para validar con la Asociación:** importar registros nuevos como propuestas pendientes y exigir revisión de una persona con `PAPERS_MANAGE` antes de publicarlos en AEQUVG. No publicar automáticamente ni crear/editar ítems en DSpace. Esta opción conserva el control editorial de la junta y reduce el riesgo de mostrar tesis fuera de alcance, metadatos incorrectos o registros con acceso restringido.

La recomendación no equivale al acuerdo requerido en S6-08. Hasta que la Asociación elija la modalidad y UVG confirme por escrito las condiciones de uso de la API, el sistema debe continuar únicamente con el alta manual ya implementada. No se habilita sincronización ni escritura externa.

## Evidencia de la plataforma

- La [investigación técnica de SCRUM-308/50309](thesis-repository-research.md) consultó la colección `2a6d7418-69a2-4176-a004-5e1bc5d98434` y registros por endpoints DSpace de lectura; no envió altas, cambios ni cargas.
- DITA describe que la Unidad de Plataformas Académicas administra DSpace y presta soporte, gestión de roles, ajustes de metadatos y catálogos, monitoreo y reportes ([servicio de DITA](https://dita.uvg.edu.gt/servicios-sad/)). Bibliotecas presenta el repositorio como medio para consultar trabajos de graduación ([Bibliotecas UVG](https://bibliotecas.uvg.edu.gt/)). Estos datos señalan a quién consultar; no son autorización para automatizar.
- La documentación oficial de DSpace 8 describe la API REST bajo `/api/`, y el contrato general documenta flujos de depósito con autenticación y token CSRF ([API REST DSpace 8](https://wiki.lyrasis.org/spaces/DSDOC8x/pages/315720842/REST+API), [contrato de depósito](https://github.com/DSpace/RestContract/blob/main/submission.md)). Eso solo prueba capacidad general del producto DSpace; no confirma que UVG habilite esos endpoints, qué roles concede ni que AEQUVG tenga permiso para usarlos.

## Contrato propuesto para importar y revisar

| Aspecto | Propuesta para aprobación |
| --- | --- |
| Fuente | API REST DSpace de `https://repositorio.uvg.edu.gt`, restringida a la colección UUID `2a6d7418-69a2-4176-a004-5e1bc5d98434`. Usar endpoints JSON documentados/confirmados por UVG; no extraer HTML ni descargar documentos. |
| Frecuencia | Una sincronización cada 24 horas, fuera de horario hábil, después de autorización. Primera carga manual y limitada a la colección acordada. La frecuencia es una propuesta, no un límite confirmado por UVG. |
| Identificador estable | UUID del ítem DSpace como clave primaria externa (`source = UVG_DSPACE`, `sourceItemUuid`). Handle como identificador persistente alterno y enlace canónico. Mantener ambos; no derivar identidad solo del título, autor o URL. |
| Duplicados | Antes de crear propuesta, buscar por `(source, sourceItemUuid)`, handle normalizado y URL canónica normalizada. Si coincide UUID/handle, actualizar la propuesta existente. Si coincide solo una tesis manual por URL u otros metadatos, marcar posible duplicado para revisión; no fusionar ni reemplazar automáticamente. |
| Campos importables | UUID, handle, URL canónica, título, autores, fecha/año, resumen y datos mínimos de colección/acceso que estén disponibles y tengan mapeo aprobado. Guardar la respuesta de origen de forma acotada para auditoría; no importar archivos, tokens ni metadatos personales ajenos al trabajo académico. |
| Publicación y revisión | Cada ítem nuevo nace como propuesta privada `PENDIENTE_REVISION`; no aparece en listados públicos. Una persona autorizada valida pertenencia a Química, campos, enlace y estado de acceso y después lo publica o descarta con motivo. Solo la acción de esa persona puede cambiar la visibilidad pública. |
| Actualizaciones | Comparar campos externos con la última captura y mostrar diferencias. No sobrescribir automáticamente una tesis ya publicada; solicitar revisión si cambia título, autoría, año, resumen, handle o acceso. Si el origen deja de devolver el ítem o cambia a restringido, marcar `REVISAR_ORIGEN`; no borrar ni despublicar automáticamente hasta una decisión editorial. |
| Errores | Respetar `Retry-After` para `429`; reintentar errores de red y `5xx` con espera incremental y máximo de 3 intentos por ciclo. Ante `401/403`, detener la sincronización y requerir revisión de autorización/configuración. Registrar ciclo, colección, UUID si existe, estado HTTP, intento y último éxito; nunca registrar credenciales ni cuerpos que incluyan secretos. Un resultado parcial o fallido no se interpreta como eliminación de registros. |
| Permisos | Lector externo sin permisos de escritura, cuando UVG autorice el acceso. Credenciales en secretos de servidor si fueran necesarias; nunca en frontend. En AEQUVG, solo `PAPERS_MANAGE` consulta, acepta o descarta propuestas y publica; registrar actor, fecha, decisión y cambios. No almacenar ni usar credenciales de depósito DSpace. |
| Retención | Conservar UUID/handle, estado de revisión, metadatos visibles importados, huella/versión de captura y auditoría de decisión según el plazo que apruebe la Asociación. No guardar los PDF de UVG. La política de retención aún necesita acuerdo. |

Los nombres de estado y detalles de persistencia son una propuesta de dominio; no existen en la implementación actual. Se deben convertir en contrato técnico solo después de las aprobaciones institucionales y de producto.

## Acuerdos y bloqueos para cerrar S6-08

**Bloqueo externo:** no se encontró autorización escrita de la Unidad de Plataformas Académicas/administrador de DSpace para consultas automatizadas, límites/frecuencia permitidos, credencial técnica o SLA. Tampoco se encontró aprobación de la Asociación sobre publicación directa frente a revisión previa. Por ello no se implementa ni se activa la automatización.

Antes de seleccionar modalidad, la Asociación debe confirmar si acepta la recomendación de revisión previa o solicita publicación directa. Luego, la Asociación debe pedir a UVG —por el canal institucional que determine— confirmación de: API y colección autorizadas, frecuencia/cuotas, autenticación y permisos, metadatos estables, tratamiento de tesis restringidas/retiradas, condiciones de depósito si se contempla escribir, y contacto para incidentes. No enviar escrituras ni iniciar un sondeo periódico mientras estas respuestas falten.

### Criterio de cierre

S6-08 puede cerrarse documentalmente cuando la Asociación registre su modalidad y reglas funcionales, y UVG responda sobre las condiciones de uso que correspondan. Hasta entonces, el contrato de arriba queda como propuesta de trabajo, el bloqueo permanece abierto y el flujo manual es el único activo.
