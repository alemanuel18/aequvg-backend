# Blog ACS: alcance implementado y contrato

## Estado del alcance

Este documento describe el comportamiento que hoy existe en el código y lo vincula con la tarea SCRUM-299. No se encontró un acta, contenido aprobado ni confirmación del cliente dentro del repositorio. Por eso, este alcance es una línea base técnica para revisión; no representa aprobación del cliente. Confirmar con Julián y el cliente el nombre y significado institucional de «ACS», los temas/contenido autorizados, ubicación definitiva en la navegación y criterios editoriales antes de dar la aceptación por cerrada.

La implementación usa «ACS» para referirse a la American Chemical Society, como aparece en los textos de las vistas. El cliente debe confirmar esa denominación.

## Vistas y ubicación

| Vista | Ruta | Acceso y función |
| --- | --- | --- |
| Listado público | `/blog` | Lista publicaciones vigentes, título, resumen, fecha y portada; enlaza al detalle. Se accede desde «Blog ACS» en navegación principal. |
| Detalle público | `/blog/:slug` | Presenta título, resumen, autor, fecha, portada y contenido enriquecido. |
| Lista administrativa | `/administrador/blog` | Requiere sesión y permiso `BLOG_MANAGE`; filtra por texto/estado y ofrece edición, archivo y eliminación. |
| Editor administrativo | `/administrador/blog/editor` y `?id=:id` | Requiere `BLOG_MANAGE`; permite redactar, generar slug, seleccionar portada, dar formato, insertar imágenes, guardar y elegir estado. El borrador sin enviar también se conserva localmente en el navegador. |

El contenido enriquecido admite párrafos, títulos 1–3, negrita, cursiva, subrayado, alineación, listas, citas e imágenes cargadas al sistema. El servidor sanitiza HTML y limita las imágenes enlazadas a las que pertenecen a la entrada.

## Perfiles y permisos

| Perfil | Listado y detalle público | Administración |
| --- | --- | --- |
| Visitante | Permitido, solo publicaciones `PUBLICADO` con fecha vigente. | Denegada (401). |
| Estudiante autenticado | Igual que visitante; su sesión estudiantil no se convierte en sesión administrativa. | Denegada (401). |
| Administrador sin `BLOG_MANAGE` | Igual que visitante. | Denegada (403). |
| Administrador con `BLOG_MANAGE` | Igual que visitante. | CRUD/editor e imágenes; las mutaciones además requieren CSRF. |

Estados de entrada: `BORRADOR`, `PUBLICADO`, `ARCHIVADO`. La API pública filtra estado y fecha en servidor. El autor se deriva de la sesión administrativa, nunca del cuerpo de creación.

## Contrato HTTP

Prefijo: `/api/v1`. El documento OpenAPI generado está en `/openapi/json` (interfaz en `/openapi`). Las respuestas de error usan `{ "error": { "code": "...", "message": "..." } }`.

| Método y ruta | Acceso | Respuesta esperada |
| --- | --- | --- |
| `GET /blog?page=1&pageSize=12` | Público | 200, `{ items, pagination }`; solo publicaciones vigentes. |
| `GET /blog/:slug` | Público | 200 entrada; 404 si no existe o no está publicada. |
| `GET /blog/:slug/image` | Público | 200 bytes de portada; 404 si no hay portada. |
| `GET /blog/:slug/images/:id` | Público | 200 bytes de una imagen insertada en esa publicación; 404 si no pertenece a ella. |
| `GET /admin/blog` | `BLOG_MANAGE` | 200 `{ items, pagination }`, incluye todos los estados. |
| `GET /admin/blog/:id` | `BLOG_MANAGE` | 200 entrada; 404 si no existe. |
| `POST /admin/blog` | `BLOG_MANAGE` + CSRF | 201 entrada creada. Requiere `title` (3–220), `summary` (10–2000), `content` (20–20000); admite `imageId`, `slug`, `status` y `publishedAt`. |
| `PUT /admin/blog/:id` | `BLOG_MANAGE` + CSRF | 200 entrada actualizada; 404/409/422 según caso. |
| `PATCH /admin/blog/:id/archive` | `BLOG_MANAGE` + CSRF | 200 entrada archivada. |
| `DELETE /admin/blog/:id` | `BLOG_MANAGE` + CSRF | 200 entrada eliminada. |
| `GET /admin/blog/images` | `BLOG_MANAGE` | 200 colección de imágenes reutilizables. |
| `POST /admin/blog/images` | `BLOG_MANAGE` + CSRF | 201 imagen cargada; multipart con campo `file`. |
| `GET /admin/blog/images/:id/preview` | `BLOG_MANAGE` | 200 bytes de imagen. |

Ejemplo de alta:

```json
{
  "title": "Experiencias de AsoQuímica en ACS",
  "slug": "experiencias-asoquimica-acs",
  "summary": "Una historia de colaboración y aprendizaje de nuestra comunidad química.",
  "content": "<h2>Una comunidad conectada</h2><p>Contenido editorial autorizado de al menos veinte caracteres.</p>",
  "status": "BORRADOR",
  "imageId": null
}
```

Las entradas, imágenes, respuestas y permisos completos están en la colección [Hoppscotch](./aequvg-hoppscotch.json). Los casos y su estado están en [ACS Testing](./acs-testing-evidence.md). No se modificó el esquema de datos para el editor; el módulo usa la migración existente `20261108120000_blog_posts`.

## Guía breve de administración

1. Ingresar al panel administrativo con una cuenta que tenga `BLOG_MANAGE`.
2. Abrir «Blog ACS» y elegir «Nueva entrada».
3. Completar título, resumen y contenido. El slug se genera desde el título hasta editarlo manualmente.
4. Opcionalmente cargar una portada e insertar imágenes en el editor; usar los controles para jerarquía y formato.
5. Elegir `BORRADOR` para conservar privado, `PUBLICADO` para mostrar públicamente o `ARCHIVADO` para retirar del listado público; guardar.
6. Volver a la lista para editar, archivar o eliminar. El borrador local del formulario se recupera si se recarga la página antes de guardar.

## Validación pendiente

- Aprobación del cliente del nombre, alcance editorial, ubicación pública, permisos y reglas de publicación.
- Confirmación del equipo de la estimación de 1 punto y de la relación con SCRUM-299.
