# Decisión de modalidad para tesis

Actualizado: 22 de noviembre de 2026. Este documento da seguimiento a SCRUM-308/S6-08 y a la investigación técnica 50309. Registra la respuesta de la Asociación recibida por mensaje el 22 de noviembre de 2026.

## Acuerdo de la Asociación

La Asociación eligió **mantener el registro manual con intervención humana**. El equipo agrega los datos de la tesis —autoría, resumen y enlace al repositorio, además de los demás campos acordados— y una persona decide su publicación. La razón expresada fue la sensibilidad y el tipo de trabajos e información que se maneja. La opción de consulta periódica de la API no fue elegida.

Esta decisión define la modalidad de SCRUM-323. Por ahora no se necesita autorización de UVG para sondear su API, porque AEQUVG no realizará consultas automáticas ni depósitos. Si la Asociación reabre esa opción, primero debe acordarse un nuevo alcance y solicitar confirmación escrita de UVG.

La implementación actual ya permite que una cuenta con `PAPERS_MANAGE` registre y publique tesis manualmente. S6-08 no autoriza cambios a esa operación ni crea una sincronización. La definición propuesta abajo queda archivada para una eventual reconsideración; no es un contrato vigente ni aprobado.

## Evidencia de la plataforma

- La [investigación técnica de SCRUM-308/50309](thesis-repository-research.md) consultó la colección `2a6d7418-69a2-4176-a004-5e1bc5d98434` y registros por endpoints DSpace de lectura; no envió altas, cambios ni cargas.
- DITA describe que la Unidad de Plataformas Académicas administra DSpace y presta soporte, gestión de roles, ajustes de metadatos y catálogos, monitoreo y reportes ([servicio de DITA](https://dita.uvg.edu.gt/servicios-sad/)). Bibliotecas presenta el repositorio como medio para consultar trabajos de graduación ([Bibliotecas UVG](https://bibliotecas.uvg.edu.gt/)). Estos datos señalan a quién consultar; no son autorización para automatizar.
- La documentación oficial de DSpace 8 describe la API REST bajo `/api/`, y el contrato general documenta flujos de depósito con autenticación y token CSRF ([API REST DSpace 8](https://wiki.lyrasis.org/spaces/DSDOC8x/pages/315720842/REST+API), [contrato de depósito](https://github.com/DSpace/RestContract/blob/main/submission.md)). Eso solo prueba capacidad general del producto DSpace; no confirma que UVG habilite esos endpoints, qué roles concede ni que AEQUVG tenga permiso para usarlos.

## Alcance manual vigente

| Aspecto | Modalidad acordada |
| --- | --- |
| Fuente | Una persona consulta el registro en el repositorio UVG e ingresa manualmente los metadatos y el enlace en AEQUVG. |
| Frecuencia | No hay sondeo automático ni calendario de sincronización. El registro se hace cuando la persona responsable incorpora una tesis. |
| Identificador y duplicados | El enlace ingresado identifica la ficha y la regla vigente de URL única evita registrar dos veces el mismo destino normalizado. No se usa UUID de DSpace para sincronización. |
| Cambios en UVG | La persona responsable comprueba y corrige la ficha manualmente cuando corresponda. No hay detección automática de cambios, restricciones o retiros. |
| Errores | Si el enlace o los metadatos no se pueden verificar, la persona no publica la ficha hasta revisarlos; no hay proceso automático de reintento o alerta. |
| Permisos | Una cuenta administrativa con `PAPERS_MANAGE` registra y publica. La intervención humana conserva la decisión editorial. No se usan credenciales de DSpace. |
| Archivos | Los documentos permanecen en UVG; AEQUVG guarda los datos y el enlace, no descarga los PDF. |

La respuesta no especifica una segunda etapa o rol de aprobación separado de la persona que ingresa y publica. Si la Asociación quiere exigir revisión por otra persona, debe precisarlo antes de cambiar el flujo.

## Automatización futura: condición de reapertura

La investigación técnica encontró consultas públicas de lectura a la colección de Química. Sin embargo, no hay autorización escrita de UVG para automatizar consultas, condiciones de frecuencia/cuota, credenciales, SLA ni permiso de depósito. Estos puntos no bloquean la modalidad manual elegida; se deben confirmar con la unidad correspondiente únicamente si la Asociación decide reconsiderar automatización.

Si se reabre, el contrato debe volver a definir y aprobar como mínimo: colección y API autorizadas; frecuencia y límites; UUID/handle estables; detección de duplicados; tratamiento de cambios, restricciones y retiros; recuperación de errores; permisos de lectura o depósito; y si la modalidad seguirá siendo carga humana asistida o publicación directa. La propuesta anterior de sincronización cada 24 horas y campos de importación no fue aceptada y queda retirada.

### Criterio de cierre

La modalidad de S6-08 queda definida como manual por decisión de la Asociación. La autorización de consulta a la API de UVG no se solicitó porque no es necesaria para el alcance seleccionado. SCRUM-324/S6-09 debe revisarse: implementar publicación automatizada contradice esta decisión y no debería comenzar sin una nueva aprobación de alcance.
