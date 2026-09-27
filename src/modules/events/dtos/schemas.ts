import { t } from 'elysia'

export const eventStatus = t.Union([
  t.Literal('BORRADOR'),
  t.Literal('PUBLICADO'),
  t.Literal('FINALIZADO'),
  t.Literal('CANCELADO'),
  t.Literal('ARCHIVADO')
])

export const idParams = t.Object({
  id: t.Integer({ minimum: 1 })
})

export const eventCreateBody = t.Object({
  createdById: t.Integer({ minimum: 1 }),
  imageId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  name: t.String({ minLength: 3, maxLength: 220 }),
  description: t.String({ minLength: 10, maxLength: 10000 }),
  startsAt: t.String({ format: 'date-time' }),
  location: t.String({ minLength: 3, maxLength: 255 }),
  maximumCapacity: t.Integer({ minimum: 1 }),
  additionalInformation: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
  status: t.Optional(eventStatus)
})

export const eventUpdateBody = t.Partial(t.Object({
  imageId: t.Nullable(t.Integer({ minimum: 1 })),
  name: t.String({ minLength: 3, maxLength: 220 }),
  description: t.String({ minLength: 10, maxLength: 10000 }),
  startsAt: t.String({ format: 'date-time' }),
  location: t.String({ minLength: 3, maxLength: 255 }),
  maximumCapacity: t.Integer({ minimum: 1 }),
  additionalInformation: t.Nullable(t.String({ maxLength: 5000 })),
  status: eventStatus
}))

export const eventAdminQuery = t.Object({
  q: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  status: t.Optional(eventStatus),
  page: t.Optional(t.Integer({ minimum: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 50 }))
})

export const eventResponse = t.Object({
  id: t.Integer(),
  createdById: t.Integer(),
  imageId: t.Nullable(t.Integer()),
  name: t.String(),
  description: t.String(),
  startsAt: t.Date(),
  location: t.String(),
  maximumCapacity: t.Integer(),
  additionalInformation: t.Nullable(t.String()),
  status: eventStatus,
  createdAt: t.Date(),
  image: t.Nullable(t.Object({ id: t.Integer(), originalName: t.String(), mimeType: t.String() })),
  createdBy: t.Object({ id: t.Integer(), name: t.String() })
})

export const eventListResponse = t.Object({
  items: t.Array(eventResponse),
  pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
})

export const eventErrorResponse = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String()
  })
})
