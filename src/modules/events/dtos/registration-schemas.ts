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
