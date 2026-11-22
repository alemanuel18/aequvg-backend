# S6-05: modelo de autor principal y coautores

Estado: investigación documentada; propuesta técnica pendiente de aprobación de la Asociación. No se implementaron cambios de esquema ni del contrato en esta tarea.

Responsable: Luis. Tarea: S6-05, vinculada a SCRUM-320. La autoría estructurada quedó fuera de S6-04 y debe aprobarse antes de iniciar implementación.

## Hallazgo en el repositorio

`ThesisLink` guarda actualmente un solo texto `author` de hasta 300 caracteres. Ese valor permite mostrar el autor principal como texto, pero no representa personas separadas, coautoría, orden ni identidad reutilizable.

El modelo de publicaciones científicas ya incluye `AuthorPerson` y `PublicationContributor`. La tabla intermedia relaciona una persona con una publicación, asigna rol y orden; evita repetir una persona en la misma publicación mediante su clave compuesta, y evita repetir un orden en esa publicación. `AuthorPerson.name` admite 160 caracteres. Las restricciones de orden positivo están expresadas en migración SQL porque Prisma no las declara directamente.

## Comparación de esquemas

| Alternativa | Ventajas | Límites para tesis |
| --- | --- | --- |
| Uno a muchos: `ThesisLink` → filas de autoría con el nombre dentro de cada fila | Sencillo de consultar y editar; no requiere resolver una identidad de persona compartida. | Si la misma persona participa en varias tesis se repite su registro y su nombre. No se puede reconocer de forma segura que es la misma persona ni consultar sus tesis como un conjunto. |
| Muchos a muchos con tabla intermedia: `ThesisLink` ↔ `AuthorPerson` mediante `ThesisContributor` | Una persona se puede relacionar con varias tesis y cada tesis con varias personas. El vínculo puede almacenar rol y orden. Sigue el patrón ya usado para publicaciones científicas. | Requiere decidir cuándo reutilizar una persona. Un nombre no identifica a alguien de forma única; la resolución y edición necesitan seleccionar explícitamente una persona y no deduplicar nombres automáticamente. |

## Recomendación técnica

Usar una relación muchos a muchos con `ThesisContributor` como entidad de unión y reutilizar `AuthorPerson`. Es el modelo adecuado si la misma persona puede aparecer en distintas tesis y mantiene consistencia con las publicaciones científicas. Ampliar `AuthorPerson.name` de 160 a 300 caracteres en la migración para conservar sin truncamiento los valores permitidos actualmente en `ThesisLink.author`.

Esquema conceptual propuesto (no aplicado):

```prisma
enum ThesisAuthorRole {
  PRINCIPAL
  COAUTOR

  @@map("rol_autoria_tesis")
}

model ThesisLink {
  // Campos actuales...
  contributors ThesisContributor[]
}

model AuthorPerson {
  // Campos actuales...
  thesisContributions ThesisContributor[]
}

model ThesisContributor {
  thesisId    Int             @map("id_enlace_tesis")
  personId    Int             @map("id_persona")
  role         ThesisAuthorRole @map("rol_autoria")
  authorOrder  Int             @map("orden_autoria") @db.SmallInt

  thesis ThesisLink   @relation(fields: [thesisId], references: [id], onDelete: Cascade)
  person AuthorPerson @relation(fields: [personId], references: [id], onDelete: Restrict)

  @@id([thesisId, personId])
  @@unique([thesisId, authorOrder])
  @@index([personId, authorOrder])
  @@map("tesis_contribuyente")
}
```

La migración SQL debe agregar `CHECK (orden_autoria > 0)` y un índice único parcial sobre `id_enlace_tesis` para `rol_autoria = 'PRINCIPAL'`. Prisma no expresa ese índice parcial en el modelo. La clave compuesta impide asociar dos veces a la misma persona a una tesis; el índice parcial impide dos personas principales en una tesis.

## Reglas propuestas para aprobación

Estas reglas son una propuesta, no un acuerdo confirmado. No implementar el modelo ni cambiar el contrato hasta registrar la aprobación de la Asociación.

1. Cada tesis debe tener al menos una persona y exactamente una persona con rol `PRINCIPAL`; las demás tendrán rol `COAUTOR`.
2. `authorOrder` define el orden de presentación y crédito, inicia en 1, es único y no tiene saltos al guardar la lista completa. El rol principal es explícito; no se deduce solo del orden.
3. Una misma persona no puede aparecer dos veces en una tesis. El mismo `AuthorPerson` sí puede participar en distintas tesis.
4. Dos personas con el mismo nombre pueden ser distintas. No se deben combinar registros ni rechazar personas solo por igualdad de nombre. Para reutilizar una persona existente, la junta debe seleccionarla explícitamente. No se agregará ORCID u otro identificador externo sin aprobarlo como alcance.
5. La lista de autoría de una tesis se edita completa y atómicamente. El backend valida que quede un principal, que los órdenes sean válidos y que no haya personas repetidas; si algo falla, conserva íntegra la lista anterior.
6. Al eliminar una tesis se eliminan sus vínculos de autoría; no se elimina automáticamente una persona reutilizada en otras publicaciones o tesis.

## Migración de datos existentes

- Antes de migrar, medir tesis con `author` nulo o vacío y valores de autor con más de 160 caracteres. Resolver nulos o vacíos con la Asociación antes de exigir la nueva relación. Ampliar `AuthorPerson.name` antes de copiar valores largos.
- Para cada autor existente válido, crear una asociación `PRINCIPAL` de orden 1. No separar una cadena por comas, conjunciones u otros signos: no demuestra dónde termina un nombre ni quién es coautor.
- No fusionar personas por igualdad de nombre durante el backfill; el esquema actual no posee un identificador estable para distinguir homónimos. Si se requiere reutilización retroactiva, hacerla solo mediante revisión humana.
- Mantener temporalmente el campo API `author` como alias derivado de la persona `PRINCIPAL` para no romper consumidores. Cambiar formularios, tipos y respuestas a una lista `contributors` en una entrega coordinada; retirar la columna antigua después de migrar consumidores y datos.
- La migración debe ser aditiva y reversible mientras se valida el backfill. Verificar recuentos antes/después, una autoría principal por tesis migrada y ausencia de vínculos duplicados antes de retirar `author`.

## Consultas y edición

- Listas y detalles pueden traer `contributors` con `person` y ordenar por `authorOrder`; agregar el índice por persona permite buscar las tesis de una persona sin escanear todas las asociaciones.
- La búsqueda por nombre debe recorrer la relación persona → contribuciones → tesis y conservar el permiso y la visibilidad pública existentes.
- La edición debe recibir y reemplazar la lista ordenada dentro de una transacción. Para evitar conflictos temporales con la restricción única de orden al reordenar, se puede borrar y recrear solo las asociaciones de esa tesis en la transacción, preservando las filas `AuthorPerson`.
- La respuesta puede incluir `author` como alias de compatibilidad durante la transición y además entregar `contributors`. El cliente debe confirmar si ese alias temporal es aceptable.

## Decisiones que faltan antes de implementar

- Aprobación de las seis reglas propuestas y de la representación de una persona compartida con publicaciones científicas.
- Confirmar si el campo de compatibilidad `author` se mantiene durante una transición o se cambia de una vez junto con todos los consumidores.
- Revisar datos existentes: autores vacíos, nombres largos, cadenas que puedan contener más de una persona y posible reutilización de autores.

Referencias: [`schema.prisma`](../prisma/schema.prisma), migración de autoría de publicaciones [`20260922170000_sprint_2_public_content`](../prisma/migrations/20260922170000_sprint_2_public_content/migration.sql), y matriz de campos S6-04 en el [estado de alcance del frontend](https://github.com/alemanuel18/aequvg-frontend/blob/feature/thesis-required-fields/docs/thesis-scope-status.md).
