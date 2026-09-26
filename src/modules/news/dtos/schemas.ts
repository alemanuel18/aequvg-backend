import { t } from 'elysia'

export const newsStatus = t.Union([t.Literal('BORRADOR'), t.Literal('PUBLICADO'), t.Literal('ARCHIVADO')])

export const newsCreateBody = t.Object({
  createdById: t.Integer({ minimum: 1 }),
  categoryId: t.Integer({ minimum: 1 }),
  imageId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  title: t.String({ minLength: 3, maxLength: 220 }),
  summary: t.String({ minLength: 10, maxLength: 2000 }),
  content: t.String({ minLength: 20, maxLength: 20000 }),
  status: t.Optional(newsStatus),
  publishedAt: t.Optional(t.Nullable(t.String({ format: 'date-time' })))
})

export const newsUpdateBody = t.Partial(t.Object({
  categoryId: t.Integer({ minimum: 1 }),
  imageId: t.Nullable(t.Integer({ minimum: 1 })),
  title: t.String({ minLength: 3, maxLength: 220 }),
  summary: t.String({ minLength: 10, maxLength: 2000 }),
  content: t.String({ minLength: 20, maxLength: 20000 }),
  status: newsStatus,
  publishedAt: t.Nullable(t.String({ format: 'date-time' }))
}))

export const newsPublicQuery = t.Object({
  q: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  categoryId: t.Optional(t.Integer({ minimum: 1 })),
  page: t.Optional(t.Integer({ minimum: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 50 }))
})

export const newsAdminQuery = t.Intersect([
  newsPublicQuery,
  t.Object({ status: t.Optional(newsStatus) })
])
