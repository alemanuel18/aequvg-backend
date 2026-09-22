# AGENTS.md — Backend de AEQUVG

## Alcance de estas instrucciones

Estas instrucciones aplican a todo este repositorio. Están dirigidas tanto a agentes de desarrollo como a integrantes del equipo. La fuente funcional principal es `../../Sprint1-Planificacion.docx`; si el código, este archivo y la planificación se contradicen, no inventes una decisión: documenta la diferencia y solicita validación cuando afecte el contrato, la privacidad, la seguridad o el alcance.

El repositorio se encuentra inicialmente en fase de preparación. Antes de trabajar, inspecciona el árbol, `package.json`, el esquema Prisma y las migraciones existentes, porque la estructura descrita aquí es el objetivo acordado y puede haberse implementado parcialmente.

## Propósito y límites del producto

AEQUVG es la plataforma institucional de la Asociación de Estudiantes de Química de la Universidad del Valle de Guatemala. El backend sirve una API REST para el sitio público y el panel administrativo, y protege la publicación de contenido académico, la gestión de eventos y los datos personales.

Reglas de negocio no negociables del MVP:

- Los visitantes no necesitan cuenta para consultar contenido publicado, descargar documentos autorizados, inscribirse a eventos o enviar solicitudes de contacto.
- Toda cuenta administrativa debe usar un correo `@uvg.edu.gt` (validación sin distinguir mayúsculas/minúsculas).
- Se publican papers derivados de tesis y proyectos de investigación terminados; no se publican tesis completas.
- Los estudiantes no cargan ni editan sus propios trabajos.
- Para publicar un trabajo se requiere PDF y aprobación de representantes de Asociación, Facultad y Dirección.
- Un trabajo publicado no se modifica. Una ampliación se registra como una publicación nueva relacionada.
- La inscripción pública registra nombre, correo y teléfono y debe respetar la capacidad del evento.
- Lista de espera y cancelaciones avanzadas son futuras. También están fuera del MVP marketplace, tutorías, chat, pagos, multidioma e integraciones institucionales no confirmadas.

## Tecnologías y arquitectura

- Bun y TypeScript.
- Elysia para la API REST.
- PostgreSQL como fuente de verdad.
- Prisma para esquema, consultas tipadas, migraciones y seed.
- `@elysia/openapi` para publicar documentación en `/openapi`.
- Vitest para pruebas unitarias y de integración.
- Playwright se usa en el sistema para E2E desde el navegador; el backend debe ofrecer un entorno reproducible para esas pruebas.
- Docker y Docker Compose para desarrollo y despliegue reproducible.

Se implementa un monolito modular con arquitectura por capas, no microservicios:

```text
src/
  modules/
    users/
    papers/
    projects/
    events/
    news/
    resources/
    board/
    contact/
  middleware/   # autenticación, autorización, errores y concerns HTTP
  shared/       # utilidades e infraestructura compartida, sin lógica de dominio
  server.ts
prisma/
  schema.prisma
  migrations/
  seed.*
```

Dentro de cada módulo separa responsabilidades:

- Controlador/ruta: HTTP, parámetros, códigos de estado y serialización.
- DTO/schema: validación explícita de entrada y salida.
- Servicio: reglas de negocio, permisos y límites transaccionales.
- Repositorio: acceso a Prisma/PostgreSQL.

Los controladores no deben contener consultas Prisma ni reglas complejas. Los repositorios no deciden permisos ni transiciones de estado. Evita dependencias entre módulos que formen ciclos; comparte contratos pequeños o servicios explícitos.

## Contrato HTTP

- Prefijo de versión: `/api/v1`.
- Documentación OpenAPI: `/openapi`.
- JSON como formato normal, salvo carga/descarga de archivos.
- Mantén respuestas y errores consistentes, con códigos HTTP correctos y un identificador/código estable que el frontend pueda interpretar.
- Pagina colecciones potencialmente grandes. Los filtros deben validarse y traducirse a consultas parametrizadas por Prisma.
- No cambies nombres de campos, estados o rutas existentes sin coordinar frontend, OpenAPI, pruebas y migración/compatibilidad.

Operaciones iniciales acordadas:

```text
GET  /papers
GET  /papers/:id
POST /admin/papers
PUT  /admin/papers/:id
POST /admin/papers/:id/approvals
POST /admin/papers/:id/publish
GET  /projects
GET  /news
POST /admin/news
GET  /events
POST /admin/events
PUT  /admin/events/:id
POST /events/:id/registrations
GET  /admin/events/:id/registrations
GET  /resources
POST /admin/resources
GET  /board-members
POST /contact-requests
```

Recursos conceptuales adicionales: `/admin-users`, `/event-registrations` y administración de miembros/solicitudes. El contrato de Sprint 1 es inicial y no exhaustivo; diseña las operaciones faltantes siguiendo REST, permisos y OpenAPI, sin ampliar el producto fuera del MVP.

## Modelo relacional de referencia

Conserva estas entidades y relaciones, usando nombres Prisma idiomáticos si el mapeo hacia PostgreSQL permanece explícito y claro:

- `rol`: `id_rol`, nombre único, descripción, activo.
- `permiso`: `id_permiso`, código único, descripción.
- `rol_permiso`: clave compuesta entre rol y permiso.
- `usuario_administrativo`: rol, nombre, correo, estado y fecha de creación.
- `credencial_administrativa`: relación 1:1 con usuario, hash y fecha de actualización.
- `archivo`: usuario que carga, nombre original, clave de almacenamiento única, MIME, tamaño, SHA-256 y fecha.
- `publicacion_cientifica`: creador, PDF, título, tipo, resumen, área, palabras clave, año, datos bibliográficos, enlace externo, estado y fechas.
- `persona_autora`: nombre de la persona autora.
- `publicacion_contribuyente`: relación M:N, rol de contribución y orden de autoría.
- `aprobacion_publicacion`: publicación, usuario, responsabilidad, estado, observaciones y fecha.
- `noticia`: creador, imagen opcional, título, resumen, contenido, categoría, estado y fecha de publicación.
- `evento`: creador, imagen opcional, nombre, descripción, inicio, ubicación, capacidad máxima, información adicional y estado.
- `inscripcion_evento`: evento, nombre, correo, teléfono, estado, consentimiento, versión de privacidad y fecha.
- `recurso`: creador, archivo opcional, título, descripción, categoría, enlace externo, estado y fecha.
- `miembro_junta`: fotografía opcional, nombre, cargo, descripción, correo institucional, período y estado.
- `solicitud_contacto`: encargado opcional, nombre, correo, teléfono, asunto, mensaje, estado de atención, consentimiento, versión y fecha.

Cardinalidades centrales:

- Rol 1:N usuarios y rol M:N permisos mediante `rol_permiso`.
- Usuario 1:1 credencial.
- Publicación M:N autores mediante contribuyentes y 1:N aprobaciones.
- Evento 1:N inscripciones.
- Usuario 1:N aprobaciones, contenido y archivos creados.
- Solicitud de contacto puede no tener encargado mientras está pendiente.

## Restricciones e invariantes

Implementa invariantes en la base de datos cuando sea posible y repítelas en servicios para ofrecer errores claros:

- Índice único sobre `LOWER(usuario_administrativo.correo)` y sufijo `@uvg.edu.gt`.
- Nunca almacenes contraseñas en texto plano; la credencial se mantiene separada del usuario.
- Tipo de publicación limitado a `PAPER_DERIVADO_TESIS` y `PROYECTO_INVESTIGACION`.
- Estados preliminares: `PENDIENTE_APROBACION`, `APROBADO`, `PUBLICADO`, `RECHAZADO`, `ARCHIVADO`.
- Una publicación pasa a `PUBLICADO` únicamente con PDF y aprobaciones de Asociación, Facultad y Dirección.
- Aprobación única por `(id_publicacion, id_usuario)`.
- Índices para publicación por `(estado, tipo, anio_publicacion)`, título normalizado y contribuyentes.
- `evento.capacidad_maxima > 0`; los cupos disponibles se calculan, no se almacenan.
- Índice de evento por `(estado, inicia_en)`.
- Una inscripción por `(id_evento, LOWER(correo))`.
- Consentimiento, versión de política y fecha son obligatorios en inscripciones y solicitudes públicas.
- Un recurso debe tener al menos archivo o enlace externo.
- Archivo con tamaño positivo, clave única y checksum obligatorio.

No uses borrado en cascada sin analizar auditoría, publicaciones, inscripciones y datos personales. Prefiere estados/inactivación cuando el dominio exige historia; cualquier política definitiva de retención debe validarse con UVG.

## Transacciones y concurrencia

- La validación de cupo y creación de inscripción ocurren en una sola transacción con bloqueo o una estrategia equivalente que impida sobrecupo bajo concurrencia.
- La creación de publicación, contribuyentes y metadatos se confirma atómicamente.
- Registrar una aprobación y ejecutar su transición de estado relacionada forman una unidad atómica.
- No implementes operaciones críticas con secuencias de lectura/escritura vulnerables a carreras.
- Los cambios de estado pasan por servicios y validan transiciones permitidas; una ruta no puede asignar libremente cualquier estado recibido.

El MVP debe responder correctamente con al menos 50 usuarios concurrentes en uso normal. Incluye pruebas específicas para el límite de cupo y duplicados.

## Archivos y almacenamiento

- PostgreSQL conserva metadatos, checksum y clave lógica, nunca el binario del PDF.
- Solo el backend carga archivos.
- Valida MIME y firma/contenido, extensión, tamaño configurado, nombre seguro y checksum SHA-256. No confíes solo en el nombre o `Content-Type` enviado.
- La descarga pública solo se permite cuando la publicación está en `PUBLICADO`.
- Implementa una interfaz de almacenamiento reemplazable. El proveedor definitivo (volumen local, MinIO, S3, GCS u otro aprobado) sigue pendiente de UVG.
- Para desarrollo/MVP puede existir un adaptador de volumen separado; no filtres rutas físicas al cliente.
- Evita archivos huérfanos: coordina escritura/borrado con persistencia y define compensación cuando una parte falle.

## Autenticación, autorización y privacidad

- Aplica autenticación y autorización en middleware/guards y vuelve a validar permisos en las operaciones sensibles.
- Roles previstos: Asociación, representante de Facultad, Dirección y Secretaría. Aunque inicialmente compartan permisos administrativos, conserva roles distintos y registra quién ejecuta cada acción.
- Aplica mínimo privilegio y deniega por defecto. El frontend nunca es una barrera de seguridad.
- Usa hash de contraseña moderno y seguro; no cifrado reversible. Mantén secretos y parámetros de sesión en variables de entorno.
- Protege formularios contra inyección, abuso y entradas maliciosas mediante schemas, límites, sanitización contextual y rate limiting cuando corresponda.
- No registres contraseñas, tokens, correos/teléfonos de participantes, mensajes de contacto ni contenido sensible en logs.
- Restringe inscripciones, solicitudes y documentos no públicos a usuarios autorizados.
- Registra consentimiento, fecha y versión de política. No inventes la retención definitiva: sigue pendiente de confirmación institucional.
- CORS debe usar `CORS_ORIGIN`; no abras todos los orígenes en producción.
- Los mensajes de error públicos no deben filtrar stack traces, SQL, rutas físicas ni existencia de datos restringidos.

## Prisma, migraciones y datos iniciales

- Cada cambio de esquema requiere una migración versionada y revisada en Git.
- Usa `prisma migrate dev` en desarrollo y `prisma migrate deploy` en despliegue.
- Nunca uses `prisma db push` en producción.
- No edites una migración ya aplicada; corrige mediante una migración nueva.
- El seed incluye roles, permisos y estados de referencia, y debe ser repetible sin duplicarlos.
- El primer administrador se crea mediante un procedimiento documentado y variables locales. Nunca confirmes credenciales reales.
- Revisa el SQL generado: nulabilidad, índices, claves únicas, `ON DELETE`, constraints y costo sobre datos existentes.

## Configuración y operación

Variables actuales esperadas en `.env.example`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `BACKEND_PORT`, `CORS_ORIGIN`, `DATABASE_URL` y `SESSION_SECRET`. Agrega cualquier variable nueva al ejemplo con un valor seguro/no secreto y documenta su propósito.

La aplicación escucha en el puerto interno `3000`. Docker Compose levanta PostgreSQL 16 y espera su healthcheck. Conserva scripts reproducibles de instalación, migración, seed, pruebas y arranque. No dependas de estado manual no documentado.

El plan exige respaldos diarios de PostgreSQL y archivos, cifrados y fuera del volumen principal, con retención inicial de 30 días y restauración probada mensualmente. La infraestructura final sigue pendiente; no afirmes que esto está resuelto si solo existe la configuración local. El objetivo de recuperación es 24 horas y disponibilidad mensual del 99 %, excluido mantenimiento programado.

## Calidad y pruebas

Para cada cambio:

1. Ejecuta primero los scripts reales de `package.json`; no inventes nombres si aún no existen.
2. Ejecuta comprobación de tipos, lint, pruebas relacionadas y build cuando estén disponibles.
3. Agrega pruebas unitarias a servicios/transiciones y pruebas de integración a rutas, permisos y repositorios.
4. Prueba autenticación, roles, aprobación/publicación, archivos, inscripción duplicada, cupo lleno y concurrencia.
5. Prueba casos negativos y límites, no solo el camino feliz.
6. Mantén OpenAPI actualizado y verifica que no documente campos secretos.
7. Usa una base de datos aislada para pruebas; las pruebas deben ser deterministas y limpiar solo sus propios datos.

Una corrección de seguridad o concurrencia debe incluir una prueba de regresión. No marques una tarea terminada usando únicamente mocks si la regla depende de constraints, transacciones o PostgreSQL.

## Forma de trabajar

- Lee el módulo completo y migraciones relacionadas antes de editar.
- Mantén cambios pequeños y enfocados; evita reformateos o refactors ajenos.
- No modifiques `.env`, no confirmes secretos ni datos personales y no subas PDFs reales sin autorización.
- No agregues dependencias sin justificar necesidad, mantenimiento y compatibilidad con Bun/Elysia.
- No cambies contratos, roles, estados, política de privacidad o esquema unilateralmente. Coordina frontend y documentación.
- Si almacenamiento, infraestructura, responsables nominales o políticas UVG siguen sin resolverse, trabaja contra interfaces/configuración y deja el pendiente explícito.
- Usa ramas, commits descriptivos y pull requests. El PR debe explicar cambio, migraciones, variables nuevas, efecto en API/seguridad y comandos de verificación.
- Al entregar, resume archivos modificados, migraciones, comandos ejecutados, resultados y riesgos pendientes.

## Criterio de terminado

Una tarea backend está terminada cuando aplica las reglas del dominio y permisos en el servidor, mantiene integridad y concurrencia, actualiza esquema/migraciones y OpenAPI cuando corresponda, protege datos y archivos, incluye pruebas proporcionales al riesgo, supera las verificaciones disponibles y deja configuración/despliegue reproducibles sin secretos.
