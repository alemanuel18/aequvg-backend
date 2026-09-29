import { t } from 'elysia'

export const boardMemberBody = t.Object({
  name: t.String({ minLength: 2, maxLength: 160 }),
  position: t.String({ minLength: 2, maxLength: 120 }),
  description: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
  institutionalEmail: t.String({ format: 'email', maxLength: 320 }),
  term: t.String({ minLength: 2, maxLength: 80 }),
  termStartsAt: t.Optional(t.Nullable(t.String({ format: 'date' }))),
  termEndsAt: t.Optional(t.Nullable(t.String({ format: 'date' }))),
  displayOrder: t.Optional(t.Integer({ minimum: 0 })),
  status: t.Optional(t.Union([t.Literal('ACTIVO'), t.Literal('INACTIVO')]))
})
