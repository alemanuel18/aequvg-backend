import { t } from 'elysia'

export const contactRequestBody = t.Object({
  name: t.String({ minLength: 2, maxLength: 160 }),
  email: t.String({ format: 'email', maxLength: 320 }),
  phone: t.String({ minLength: 7, maxLength: 40 }),
  type: t.Union([t.Literal('CONSULTA'), t.Literal('REUNION')]),
  subject: t.String({ minLength: 3, maxLength: 220 }),
  message: t.String({ minLength: 10, maxLength: 4000 }),
  preferredAt: t.Optional(t.Nullable(t.String({ format: 'date-time' }))),
  consent: t.Literal(true),
  privacyVersion: t.String({ minLength: 1, maxLength: 40 }),
  website: t.Optional(t.String({ maxLength: 0 }))
})

export const contactMethodBody = t.Object({
  type: t.Union([t.Literal('EMAIL'), t.Literal('TELEFONO'), t.Literal('UBICACION'), t.Literal('INSTAGRAM'), t.Literal('FACEBOOK'), t.Literal('OTRO')]),
  label: t.String({ minLength: 2, maxLength: 100 }),
  value: t.String({ minLength: 2, maxLength: 320 }),
  url: t.Optional(t.Nullable(t.String({ maxLength: 2048 }))),
  displayOrder: t.Optional(t.Integer({ minimum: 0 })),
  active: t.Optional(t.Boolean())
})
