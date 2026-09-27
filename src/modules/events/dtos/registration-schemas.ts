import { type Static, t } from 'elysia'

export const eventRegistrationBody = t.Object({
  fullName: t.String({ minLength: 2, maxLength: 160 }),
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
