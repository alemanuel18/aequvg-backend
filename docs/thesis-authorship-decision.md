# S6-05: modelo de autor principal y coautores

Estado: decisión aprobada en S6-05 e implementada en S6-06 en la rama `feature/thesis-authorship`. Este documento conserva la justificación y las reglas acordadas; el esquema y el contrato actuales ya incluyen la autoría estructurada.

Responsable: Luis. Tarea de decisión: S6-05, vinculada a SCRUM-320. Implementación: S6-06. Las reglas, incluida la política de identidad, quedaron confirmadas antes de implementar. La auditoría previa encontró 1 tesis, sin autores vacíos, sin nombres mayores a 160 caracteres y sin cadenas con patrones evidentes de múltiples personas.

## Hallazgo en el repositorio

Antes de S6-06, `ThesisLink` guardaba un solo texto `author` de hasta 300 caracteres. Ese valor permitía mostrar el autor principal, pero no representar personas separadas, coautoría, orden ni identidad reutilizable. En S6-06 se añadió la relación estructurada y `author` se conserva como alias de compatibilidad.

El modelo de publicaciones científicas ya incluye `AuthorPerson` y `PublicationContributor`. La tabla intermedia relaciona una persona con una publicación, asigna rol y orden; evita repetir una persona en la misma publicación mediante su clave compuesta, y evita repetir un orden en esa publicación. `AuthorPerson.name` admite 160 caracteres. Las restricciones de orden positivo están expresadas en migración SQL porque Prisma no las declara directamente.

## Cómo se manejan hoy las cuentas y las personas

- Las cuentas administrativas (`AdministrativeUser`) y estudiantiles (`StudentUser`) son modelos separados. Cada una administra correo, estado, sesiones y credenciales; las identidades de inicio de sesión pertenecen a la cuenta administrativa.
- Una cuenta administrativa puede ser responsable de crear una publicación científica o un enlace de tesis (`createdById`). Ese campo registra quién administra o carga el contenido, no quién escribió el trabajo.
- La autoría científica se guarda aparte: `ScientificPublication.createdById` identifica a la cuenta que registró el trabajo, mientras `PublicationContributor` apunta a `AuthorPerson` para sus autores y colaboradores.
- `AuthorPerson` es un registro académico simple con ID y nombre; no tiene correo, contraseña, sesión ni relación con una cuenta. Los autores no necesitan una cuenta AEQUV ni deben vincularse automáticamente a una cuenta estudiantil o administrativa.

Conclusión: reutilizar `AuthorPerson` mantiene la misma separación entre autoría académica y cuentas de acceso que ya aplica el módulo de publicaciones. Su ID permite seleccionar y reutilizar el mismo registro; el nombre por sí solo no demuestra identidad.

## Comparación de esquemas

| Alternativa | Ventajas | Límites para tesis |
| --- | --- | --- |
| Uno a muchos: `ThesisLink` → filas de autoría con el nombre dentro de cada fila | Sencillo de consultar y editar; no requiere resolver una identidad de persona compartida. | Si la misma persona participa en varias tesis se repite su registro y su nombre. No se puede reconocer de forma segura que es la misma persona ni consultar sus tesis como un conjunto. |
| Muchos a muchos con tabla intermedia: `ThesisLink` ↔ `AuthorPerson` mediante `ThesisContributor` | Una persona se puede relacionar con varias tesis y cada tesis con varias personas. El vínculo puede almacenar rol y orden. Sigue el patrón ya usado para publicaciones científicas. | Requiere decidir cuándo reutilizar una persona. Un nombre no identifica a alguien de forma única; la resolución y edición necesitan seleccionar explícitamente una persona y no deduplicar nombres automáticamente. |

## Recomendación técnica

Usar una relación muchos a muchos con `ThesisContributor` como entidad de unión y reutilizar `AuthorPerson`. Es el modelo adecuado si la misma persona puede aparecer en distintas tesis y mantiene consistencia con las publicaciones científicas. Ampliar `AuthorPerson.name` de 160 a 300 caracteres en la migración para conservar sin truncamiento los valores permitidos actualmente en `ThesisLink.author`.

Esquema implementado en `prisma/schema.prisma` y en la migración `20261122100000_thesis_contributors`:

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

La migración SQL agrega `CHECK (orden_autoria > 0)` y una restricción que permite `PRINCIPAL` solo en el orden 1 y `COAUTOR` solo en órdenes mayores que 1. `@@unique([thesisId, authorOrder])` y esa regla garantizan como máximo una persona principal; la clave compuesta impide asociar dos veces a la misma persona a una tesis. La aplicación valida que siempre exista una principal.

## Reglas confirmadas

Las siguientes decisiones funcionales fueron confirmadas en esta conversación:

1. Usar relación muchos a muchos entre tesis y `AuthorPerson` mediante `ThesisContributor`.
2. Cada tesis tendrá al menos una persona y exactamente una persona con rol `PRINCIPAL`; las demás serán `COAUTOR`.
3. El autor principal siempre ocupa el orden 1. Los coautores siguen en el orden aprobado por la junta, sin espacios, desde 2.
4. La junta podrá agregar, quitar, seleccionar y reordenar autores desde el panel; el reemplazo de la lista será atómico.
5. En la migración, cada valor actual de `author` se toma completo como un autor principal. No se separan automáticamente cadenas por comas o conjunciones; valores vacíos o que contengan varias personas requieren revisión manual.
6. La API mantiene temporalmente `author` como alias del nombre del autor principal mientras agrega la lista estructurada `contributors`; el alias se retira luego de migrar a todos los consumidores.
7. La autoría se mantiene independiente de las cuentas `StudentUser` y `AdministrativeUser`. Se permiten homónimos como personas distintas; no se fusionan automáticamente por nombre, la junta selecciona explícitamente una persona existente para reutilizarla y ORCID queda fuera de este alcance.

La confirmación de la regla 7 se recibió después de revisar el esquema de cuentas y personas del repositorio. `AuthorPerson` no tiene correo ni credenciales; su ID es interno a AEQUV y no verifica por sí solo la identidad académica. No se vincula una autoría a una cuenta solo porque coincidan los nombres.

## Migración de datos existentes

- La auditoría local previa al backfill encontró una tesis con autor válido; no hubo nulos/vacíos ni valores mayores a 160 caracteres. La migración aborta con error si encuentra un autor nulo o vacío, y amplía `AuthorPerson.name` antes de copiar valores.
- Para cada autor existente válido, la migración crea una asociación `PRINCIPAL` de orden 1. No separa una cadena por comas, conjunciones u otros signos: no demuestra dónde termina un nombre ni quién es coautor.
- No fusionar personas por igualdad de nombre durante el backfill; el esquema actual no posee un identificador estable para distinguir homónimos. Si se requiere reutilización retroactiva, hacerla solo mediante revisión humana.
- Mantener temporalmente el campo API `author` como alias derivado de la persona `PRINCIPAL` para no romper consumidores. Cambiar formularios, tipos y respuestas a una lista `contributors` en una entrega coordinada; retirar la columna antigua después de migrar consumidores y datos.
- La migración es aditiva y conserva `ThesisLink.author` como alias. Su integración verifica que cada tesis previa tenga una asociación principal de orden 1 y que el alias conserve el valor original. El alias no se retira en esta entrega.

## Consultas y edición

- Listas y detalles entregan `contributors` con `person`, ordenados por `authorOrder`; el índice por persona permite buscar las tesis de una persona sin escanear todas las asociaciones.
- La búsqueda por nombre recorre la relación persona → contribuciones → tesis y conserva el permiso y la visibilidad pública existentes.
- La edición recibe y reemplaza la lista ordenada dentro de una transacción. Para evitar conflictos temporales con la restricción única de orden al reordenar, borra y recrea solo las asociaciones de esa tesis, preservando las filas `AuthorPerson`.
- La respuesta entrega `author` como alias de compatibilidad y también `contributors`, conforme a la regla confirmada.
- Al eliminar una tesis, se eliminan sus filas de `ThesisContributor`, no la fila de `AuthorPerson`; una persona reutilizada debe sobrevivir al retiro de una tesis. Esta es una regla técnica de integridad referencial.

## Evidencia de migración y alcance restante

- Los valores que parezcan contener más de una persona se conservan completos como un único autor principal; la regla acordada prohíbe dividirlos automáticamente.
- La migración preserva el campo legado para compatibilidad; retirarlo requiere una tarea posterior coordinada con todos los consumidores de la API.
- La migración se desplegó en una base efímera con una tesis legado sintética y una consulta confirmó que el alias y el nombre relacionado coincidieron, con rol `PRINCIPAL` y orden 1. La integración PostgreSQL ejecutó 6/6 pruebas; E2E de tesis ejecutó 2/2.

Referencias: [`schema.prisma`](../prisma/schema.prisma), migración de autoría de publicaciones [`20260922170000_sprint_2_public_content`](../prisma/migrations/20260922170000_sprint_2_public_content/migration.sql), y matriz de campos S6-04 en el [estado de alcance del frontend](https://github.com/alemanuel18/aequvg-frontend/blob/feature/thesis-required-fields/docs/thesis-scope-status.md).
