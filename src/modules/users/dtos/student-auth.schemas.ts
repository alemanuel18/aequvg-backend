import { t } from 'elysia'

export const studentRegisterBody = t.Object({
  name: t.String({ minLength: 2, maxLength: 160 }),
  email: t.String({ format: 'email', maxLength: 254 }),
  password: t.String({ minLength: 12, maxLength: 128 }),
  isStudent: t.Literal(true),
  role: t.Optional(t.String({ maxLength: 120 }))
}, { additionalProperties: false })

export const studentLoginBody = t.Object({
  email: t.String({ format: 'email', maxLength: 254 }),
  password: t.String({ minLength: 1, maxLength: 256 })
}, { additionalProperties: false })

export const studentDeleteBody = t.Object({
  email: t.String({ format: 'email', maxLength: 254 }),
  password: t.String({ minLength: 1, maxLength: 256 }),
  confirm: t.Literal(true)
}, { additionalProperties: false })

export const studentUserResponse = t.Object({
  id: t.Integer(),
  name: t.String(),
  email: t.String(),
  isStudent: t.Boolean(),
  status: t.String(),
  role: t.Literal('STUDENT')
})

export const studentSessionResponse = t.Object({
  user: studentUserResponse,
  csrfToken: t.Optional(t.String()),
  expiresAt: t.Optional(t.String({ format: 'date-time' }))
})

export const studentAuthErrorResponse = t.Object({
  error: t.Object({ code: t.String(), message: t.String(), details: t.Optional(t.Record(t.String(), t.String())) })
})

export const studentStatusBody = t.Union([
  t.Object({ status: t.Literal('ACTIVO') }, { additionalProperties: false }),
  t.Object({
    status: t.Literal('BLOQUEADO_TEMPORAL'),
    blockedUntil: t.String({ format: 'date-time' })
  }, { additionalProperties: false }),
  t.Object({
    status: t.Literal('BLOQUEADO_PERMANENTE'),
    reviewChannel: t.String({ minLength: 2, maxLength: 255 })
  }, { additionalProperties: false })
])
