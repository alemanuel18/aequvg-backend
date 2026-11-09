# Investigación técnica: repositorio de tesis de Química UVG

Fecha de revisión: 8 de noviembre de 2026. Este informe resume las consultas de solo lectura realizadas para la tarea de investigación 50309. No se obtuvo confirmación del responsable del repositorio ni del cliente; por eso la investigación sobre condiciones institucionales y la decisión de automatizar quedan inconclusas.

## Fuentes y comprobaciones

- [Colección Tesis - Química](https://repositorio.uvg.edu.gt/collections/2a6d7418-69a2-4176-a004-5e1bc5d98434): la API DSpace `GET /server/api/core/collections/{uuid}` respondió HTTP 200, informó el nombre “Tesis - Química”, handle permanente `123456789/3316` y 65 ítems archivados.
- [Comunidad enlazada por el cliente](https://repositorio.uvg.edu.gt/communities/b173c00f-3834-4e8b-b78c-e80982771545): referencia de agrupación institucional; esta revisión no confirma la política editorial de toda la comunidad.
- La consulta pública `GET /server/api/discover/search/objects?scope=2a6d7418-69a2-4176-a004-5e1bc5d98434&size=100` devolvió los registros de esa colección. La ficha API de cada objeto incluye UUID, handle y metadatos Dublin Core.
- El ítem [123456789/4914](https://repositorio.uvg.edu.gt/handle/123456789/4914) aparece en la colección. Su título, autor y descripción identifican una tesis de Licenciatura en Química. `GET /server/api/core/items/{uuid}/accessStatus` devolvió `open.access`; una consulta sin sesión al PDF respondió HTTP 200 y `application/pdf`.
- Se consultó el estado de acceso de los 65 ítems encontrados en la colección: todos reportaron `open.access`. No se localizó un caso de Química con embargo o autenticación requerida.

Las peticiones fueron de lectura; no se enviaron altas, ediciones, retiros ni cargas al repositorio. La respuesta HTTP 403 que mostró inicialmente un lector web no se reprodujo con la solicitud HTTPS directa, que respondió HTTP 200. Ese 403 corresponde a la herramienta de lectura consultada, no demuestra que el repositorio exija autenticación.

## Filtrado, metadatos e identificadores

Para limitar la consulta a Química, el mecanismo probado es acotar la búsqueda DSpace al UUID de la colección `2a6d7418-69a2-4176-a004-5e1bc5d98434` y comprobar la pertenencia del registro. El metadato `dc.description` de la muestra identifica el grado y la carrera; el nombre de la colección brinda un segundo criterio. No se recomienda inferir la carrera solo por palabras del título.

La muestra devolvió:

```json
{
  "handle": "123456789/4914",
  "title": "Validación de un kit de campo para la determinación de fosfatos en pisos hechos de estuco del sitio arqueológico La Corona utilizando el método de Murphy y Riley.",
  "author": "Samayoa Juárez, Alan Roberto",
  "issued": "2023",
  "description": "Tesis. Licenciatura en Química. Facultad de Ciencias y Humanidades (47 p.).",
  "uri": "https://repositorio.uvg.edu.gt/handle/123456789/4914",
  "accessStatus": "open.access"
}
```

El handle funciona como enlace persistente en la muestra. La API proporciona UUID y URI del objeto. La respuesta consultada permite identificar autoría, fecha y colección; la consistencia o presencia de estos campos para registros futuros no se validó exhaustivamente. La API es observable públicamente en esta revisión, pero no se confirmó con UVG si el uso automatizado está autorizado, qué límites o SLA aplica, o si existe un canal preferido de integración.

## Viabilidad y decisión registrada

| Opción | Observación con la evidencia disponible | Estado |
| --- | --- | --- |
| Publicar automáticamente cada tesis nueva de Química | La búsqueda por UUID de colección permitiría explorar una consulta periódica, pero faltan términos de uso confirmados, política de frecuencia/límites, reglas de primera sincronización, deduplicación, retiros/cambios y conservación de rechazos. | No aprobada ni implementada. Viabilidad institucional pendiente. |
| Importar la tesis como pendiente para revisión de la junta | Reduce el riesgo de publicación incorrecta y permite revisión humana; requiere definir sincronización, tratamiento de cambios y persistencia de rechazos antes de construirla. | No aprobada ni implementada. Viabilidad institucional pendiente. |
| Cargar manualmente el enlace en AEQUVG | Es el único flujo implementado hoy: un administrador con `PAPERS_MANAGE` captura una URL y metadatos, y publica manualmente. Los archivos permanecen en UVG. | Base funcional actual; no consta una aprobación explícita del cliente en los artefactos revisados. |

No se documenta ninguna opción automática como disponible ni se recomienda activarla sin validación del cliente y del responsable del repositorio. La investigación técnica confirma endpoints públicos de lectura para la colección, pero no confirma las condiciones de uso para automatización.

## Pendientes y tareas futuras, si se acepta automatizar

1. Obtener confirmación del responsable UVG sobre API admitida, autorización de uso, límites, frecuencia, metadatos estables, identificadores y tratamiento de contenido con acceso restringido.
2. Acordar con el cliente la modalidad: publicación automática o importación como pendiente de aprobación.
3. Diseñar una primera sincronización segura, deduplicación por handle/UUID, actualizaciones y retiros, fallos y reintentos, y una lista persistente de registros rechazados para no volver a proponerlos.
4. Estimar e implementar la alternativa aprobada en tareas separadas; mantener siempre el archivo en el repositorio universitario.

Estos son pendientes de investigación/planificación. No implican que exista un proceso de sincronización en AEQUVG.
