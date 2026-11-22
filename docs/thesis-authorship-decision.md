# S6-05: modelo de autor principal y coautores

Estado: investigación documentada. Las reglas de modelo, principal, orden, migración, edición y compatibilidad fueron confirmadas en esta conversación. Falta cerrar cómo distinguir identidades de autoría; no se implementaron cambios de esquema ni del contrato en esta tarea.

Responsable: Luis. Tarea: S6-05, vinculada a SCRUM-320. La autoría estructurada quedó fuera de S6-04; la implementación espera cerrar la regla de identidad indicada abajo.

## Hallazgo en el repositorio

`ThesisLink` guarda actualmente un solo texto `author` de hasta 300 caracteres. Ese valor permite mostrar el autor principal como texto, pero no representa personas separadas, coautoría, orden ni identidad reutilizable.

El modelo de publicaciones científicas ya incluye `AuthorPerson` y `PublicationContributor`. La tabla intermedia relaciona una persona con una publicación, asigna rol y orden; evita repetir una persona en la misma publicación mediante su clave compuesta, y evita repetir un orden en esa publicación. `AuthorPerson.name` admite 160 caracteres. Las restricciones de orden positivo están expresadas en migración SQL porque Prisma no las declara directamente.

## Cómo se manejan hoy las cuentas y las personas

- Las cuentas administrativas (`AdministrativeUser`) y estudiantiles (`StudentUser`) son modelos separados. Cada una administra correo, estado, sesiones y credenciales; las identidades de inicio de sesión pertenecen a la cuenta administrativa.
- Una cuenta administrativa puede ser responsable de crear una publicación científica o un enlace de tesis (`createdById`). Ese campo registra quién administra o carga el contenido, no quién escribió el trabajo.
- La autoría científica se guarda aparte: `ScientificPublication.createdById` identifica a la cuenta que registró el trabajo, mientras `PublicationContributor` apunta a `AuthorPerson` para sus autores y colaboradores.
- `AuthorPerson` es un registro académico simple con ID y nombre; no tiene correo, contraseña, sesión ni relación con una cuenta. Una persona autora no necesita tener cuenta AEQUV ni debe vincularse automáticamente a una cuenta estudiantil o administrativa.

Conclusión: reutilizar `AuthorPerson` mantiene la misma separación entre autoría académica y cuentas de acceso que ya aplica el módulo de publicaciones. Su ID permite seleccionar y reutilizar el mismo registro; el nombre por sí solo no demuestra identidad.

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

La migración SQL debe agregar `CHECK (orden_autoria > 0)` y una restricción que permita `PRINCIPAL` solo en el orden 1 y `COAUTOR` solo en órdenes mayores que 1. `@@unique([thesisId, authorOrder])` y esa regla garantizan como máximo una persona principal; la clave compuesta impide asociar dos veces a la misma persona a una tesis. La aplicación valida que siempre exista una principal.

## Reglas confirmadas

Las siguientes decisiones funcionales fueron confirmadas en esta conversación:

1. Usar relación muchos a muchos entre tesis y `AuthorPerson` mediante `ThesisContributor`.
2. Cada tesis tendrá al menos una persona y exactamente una persona con rol `PRINCIPAL`; las demás serán `COAUTOR`.
3. La persona principal siempre ocupa el orden 1. Las coautoras siguen en el orden aprobado por la junta, sin espacios, desde 2.
4. La junta podrá agregar, quitar, seleccionar y reordenar autores desde el panel; el reemplazo de la lista será atómico.
5. En la migración, cada valor actual de `author` se toma completo como una autora principal. No se separan automáticamente cadenas por comas o conjunciones; valores vacíos o que contengan varias personas requieren revisión manual.
6. La API mantiene temporalmente `author` como alias del nombre de la autora principal mientras agrega la lista estructurada `contributors`; el alias se retira luego de migrar a todos los consumidores.

## Identidad de personas: propuesta pendiente de confirmación

Los modelos de usuarios no sirven como registro de autores: incluyen cuentas y controles de acceso que no son necesarios para atribuir una tesis. La recomendación es mantener `AuthorPerson` independiente de `StudentUser` y `AdministrativeUser`.

`AuthorPerson` no tiene ORCID ni otro identificador externo; su ID es único dentro de AEQUV, pero no verifica la identidad civil o académica. La propuesta es permitir homónimos como registros distintos, reutilizar una persona solo cuando la junta la seleccione explícitamente, impedir asociar el mismo `personId` dos veces a una tesis y dejar ORCID fuera del alcance actual. No se fusionan nombres automáticamente. Esta regla de duplicados e identidad aún requiere confirmación.

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
- La respuesta incluirá `author` como alias de compatibilidad durante la transición y además entregará `contributors`, conforme a la regla confirmada.

## Pendientes antes de implementar

- Confirmar la regla de identidad pendiente: personas académicas separadas de cuentas, homónimos permitidos sin fusión automática, misma persona no repetida dentro de una tesis y ORCID fuera del alcance por ahora.
- Revisar datos existentes: autores vacíos, nombres largos y cadenas que puedan contener más de una persona. La confirmación recibida indica revisión manual, no división automática.
- Confirmar como regla técnica de borrado que se eliminen las asociaciones de una tesis, pero se conserve `AuthorPerson` si se usa en otros trabajos.

Referencias: [`schema.prisma`](../prisma/schema.prisma), migración de autoría de publicaciones [`20260922170000_sprint_2_public_content`](../prisma/migrations/20260922170000_sprint_2_public_content/migration.sql), y matriz de campos S6-04 en el [estado de alcance del frontend](https://github.com/alemanuel18/aequvg-frontend/blob/feature/thesis-required-fields/docs/thesis-scope-status.md).
