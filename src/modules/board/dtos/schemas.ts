import { t } from 'elysia'

export const boardMemberBody = t.Object({
  firstNames: t.String({ minLength: 2, maxLength: 80 }),
  lastNames: t.String({ minLength: 2, maxLength: 80 }),
  position: t.Union([t.Literal('Presidente'), t.Literal('Presidenta'), t.Literal('Vicepresidente'), t.Literal('Vicepresidenta'), t.Literal('Secretario'), t.Literal('Secretaria'), t.Literal('Tesorero'), t.Literal('Tesorera'), t.Literal('Vocal')]),
  description: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
  institutionalEmail: t.String({ format: 'email', maxLength: 320 }),
  termStartsAt: t.String({ format: 'date' }),
  termEndsAt: t.String({ format: 'date' }),
  displayOrder: t.Optional(t.Integer({ minimum: 0 })),
  status: t.Union([t.Literal('ACTIVO'), t.Literal('INACTIVO')])
})
