import { type Static, t } from 'elysia'

export const eventRegistrationBody = t.Object({
  firstNames: t.String({ minLength: 2, maxLength: 80 }),
  lastNames: t.String({ minLength: 2, maxLength: 80 }),
  email: t.String({ format: 'email', maxLength: 320 }),
  phone: t.String({ minLength: 7, maxLength: 40 }),
  consent: t.Literal(true),
  privacyVersion: t.String({ minLength: 1, maxLength: 40 }),
  website: t.Optional(t.String({ maxLength: 120 }))
})

export type EventRegistrationBody = Static<typeof eventRegistrationBody>

export const eventRegistrationResponse = t.Object({
  id: t.Integer(),
  eventId: t.Integer(),
  status: t.Literal('CONFIRMADA'),
  registeredAt: t.Date()
})

export type EventRegistrationResponse = Static<typeof eventRegistrationResponse>

export const eventRegistrationStatus = t.Union([
  t.Literal('CONFIRMADA'),
  t.Literal('CANCELADA')
])

export type EventRegistrationStatus = Static<typeof eventRegistrationStatus>

export const eventRegistrationAdminQuery = t.Object({
  page: t.Optional(t.Integer({ minimum: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  status: t.Optional(eventRegistrationStatus),
  q: t.Optional(t.String({ minLength: 1, maxLength: 120 }))
})

export type EventRegistrationAdminQuery = Static<typeof eventRegistrationAdminQuery>

export const eventRegistrationAdminItemResponse = t.Object({
  id: t.Integer(),
  fullName: t.String(),
  email: t.String(),
  phone: t.String(),
  status: eventRegistrationStatus,
  registeredAt: t.Date()
})

export type EventRegistrationAdminItemResponse = Static<typeof eventRegistrationAdminItemResponse>

export const eventRegistrationAdminListResponse = t.Object({
  items: t.Array(eventRegistrationAdminItemResponse),
  pagination: t.Object({
    page: t.Integer(),
    pageSize: t.Integer(),
    total: t.Integer()
  })
})

export type EventRegistrationAdminListResponse = Static<typeof eventRegistrationAdminListResponse>

export const eventRegistrationOwnQuery = t.Object({
  page: t.Optional(t.Integer({ minimum: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
  status: t.Optional(eventRegistrationStatus)
})

export type EventRegistrationOwnQuery = Static<typeof eventRegistrationOwnQuery>

export const eventRegistrationOwnItemResponse = t.Object({
  id: t.Integer(),
  status: eventRegistrationStatus,
  registeredAt: t.Date(),
  event: t.Object({
    id: t.Integer(),
    name: t.String(),
    startsAt: t.Date(),
    location: t.String(),
    status: t.Union([
      t.Literal('BORRADOR'),
      t.Literal('PUBLICADO'),
      t.Literal('FINALIZADO'),
      t.Literal('CANCELADO'),
      t.Literal('ARCHIVADO')
    ])
  })
})

export const eventRegistrationOwnListResponse = t.Object({
  items: t.Array(eventRegistrationOwnItemResponse),
  pagination: t.Object({
    page: t.Integer(),
    pageSize: t.Integer(),
    total: t.Integer()
  })
})
