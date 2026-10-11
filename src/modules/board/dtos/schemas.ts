import { t } from 'elysia'

export const boardMemberBody = t.Object({
  name: t.String({ minLength: 2, maxLength: 160 }),
  position: t.Union([t.Literal('Presidente'), t.Literal('Presidenta'), t.Literal('Vicepresidente'), t.Literal('Vicepresidenta'), t.Literal('Secretario'), t.Literal('Secretaria'), t.Literal('Tesorero'), t.Literal('Tesorera'), t.Literal('Vocal')]),
  description: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
  institutionalEmail: t.String({ format: 'email', maxLength: 320 }),
  termStartsAt: t.String({ format: 'date' }),
  termEndsAt: t.String({ format: 'date' }),
  displayOrder: t.Optional(t.Integer({ minimum: 0 })),
  status: t.Optional(t.Union([t.Literal('ACTIVO'), t.Literal('INACTIVO')]))
})
