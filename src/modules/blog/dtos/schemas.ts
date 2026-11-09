import { t } from 'elysia'

export const blogStatus = t.Union([t.Literal('BORRADOR'), t.Literal('PUBLICADO'), t.Literal('ARCHIVADO')])
export const blogErrorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String() }) })
const blogFields = {
  imageId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  title: t.String({ minLength: 3, maxLength: 220 }),
  slug: t.Optional(t.String({ minLength: 3, maxLength: 240, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })),
  summary: t.String({ minLength: 10, maxLength: 2000 }),
  content: t.String({ minLength: 20, maxLength: 20000 }),
  status: t.Optional(blogStatus),
  publishedAt: t.Optional(t.Nullable(t.String({ format: 'date-time' })))
}
export const blogCreateBody = t.Object(blogFields)
export const blogUpdateBody = t.Partial(t.Object({
  imageId: t.Nullable(t.Integer({ minimum: 1 })),
  title: t.String({ minLength: 3, maxLength: 220 }),
  slug: t.String({ minLength: 3, maxLength: 240, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
  summary: t.String({ minLength: 10, maxLength: 2000 }),
  content: t.String({ minLength: 20, maxLength: 20000 }),
  status: blogStatus,
  publishedAt: t.Nullable(t.String({ format: 'date-time' }))
}))
export const blogQuery = t.Object({ q: t.Optional(t.String({ minLength: 1, maxLength: 120 })), status: t.Optional(blogStatus), page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 50 })) })
export const blogResponse = t.Object({
  id: t.Integer(), imageId: t.Nullable(t.Integer()), title: t.String(), slug: t.String(), summary: t.String(), content: t.String(), status: blogStatus,
  createdAt: t.Date(), updatedAt: t.Date(), publishedAt: t.Nullable(t.Date()),
  image: t.Nullable(t.Object({ id: t.Integer(), originalName: t.String(), mimeType: t.String() })),
  createdBy: t.Object({ id: t.Integer(), name: t.String() })
})
export const blogListResponse = t.Object({ items: t.Array(blogResponse), pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer() }) })
