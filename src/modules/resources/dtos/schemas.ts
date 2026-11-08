import { t } from 'elysia'

export const resourceStatus = t.Union([t.Literal('BORRADOR'), t.Literal('PUBLICADO'), t.Literal('ARCHIVADO')])

const resourceLinkBody = t.Object({
  label: t.String({ minLength: 2, maxLength: 160 }),
  url: t.String({ minLength: 8, maxLength: 2048, pattern: '^https?://' }),
  displayOrder: t.Optional(t.Integer({ minimum: 0 }))
})

const resourceFields = {
  categoryId: t.Integer({ minimum: 1 }),
  fileId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  title: t.String({ minLength: 3, maxLength: 220 }),
  description: t.String({ minLength: 10, maxLength: 20000 }),
  status: t.Optional(resourceStatus),
  publishedAt: t.Optional(t.Nullable(t.String({ format: 'date-time' }))),
  links: t.Optional(t.Array(resourceLinkBody, { maxItems: 50 }))
}

export const resourceCreateBody = t.Object(resourceFields)
export const resourceUpdateBody = t.Partial(t.Object(resourceFields))

export const resourcePublicQuery = t.Object({
  q: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  categoryId: t.Optional(t.Integer({ minimum: 1 })),
  page: t.Optional(t.Integer({ minimum: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 50 }))
})

export const resourceAdminQuery = t.Object({
  q: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  categoryId: t.Optional(t.Integer({ minimum: 1 })),
  page: t.Optional(t.Integer({ minimum: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
  status: t.Optional(resourceStatus)
})

export const resourceErrorResponse = t.Object({
  error: t.Object({ code: t.String(), message: t.String() })
})

export const resourceFileResponse = t.Object({ id: t.Integer(), uploadedById: t.Integer(), originalName: t.String(), mimeType: t.String(), sizeBytes: t.Integer(), sha256: t.String(), createdAt: t.Date() })

export const resourceCategoryResponse = t.Object({ id: t.Integer(), name: t.String(), active: t.Boolean() })
export const resourceLinkResponse = t.Object({ id: t.Integer(), label: t.String(), url: t.String(), displayOrder: t.Integer() })

export const resourceResponse = t.Object({
  id: t.Integer(),
  categoryId: t.Integer(),
  fileId: t.Nullable(t.Integer()),
  title: t.String(),
  description: t.String(),
  status: resourceStatus,
  createdAt: t.Date(),
  publishedAt: t.Nullable(t.Date()),
  category: resourceCategoryResponse,
  file: t.Nullable(t.Object({ id: t.Integer(), originalName: t.String(), mimeType: t.String(), downloadUrl: t.Optional(t.String()) })),
  links: t.Array(resourceLinkResponse),
  createdBy: t.Object({ id: t.Integer(), name: t.String() })
})

export const resourceListResponse = t.Object({
  items: t.Array(resourceResponse),
  pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
})

export const resourceCategoryListResponse = t.Array(t.Object({ id: t.Integer(), name: t.String() }))
