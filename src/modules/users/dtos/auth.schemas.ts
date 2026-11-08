import { t } from 'elysia'

export const loginBody = t.Object({
  email: t.String({ format: 'email', maxLength: 254 }),
  password: t.String({ minLength: 1, maxLength: 256 })
}, { additionalProperties: false })
export const registrationRequestBody = t.Object({
  firstNames: t.String({ minLength: 2, maxLength: 80 }),
  lastNames: t.String({ minLength: 2, maxLength: 80 }),
  email: t.String({ format: 'email', maxLength: 254 }),
  password: t.String({ minLength: 12, maxLength: 128 })
}, { additionalProperties: false })
export const recoveryRequestBody = t.Object({
  email: t.String({ format: 'email', maxLength: 254 })
}, { additionalProperties: false })
export const passwordResetBody = t.Object({
  token: t.String({ minLength: 32, maxLength: 128 }),
  password: t.String({ minLength: 12, maxLength: 128 })
}, { additionalProperties: false })

export const microsoftStartQuery = t.Object({
  returnTo: t.Optional(t.String({ maxLength: 2048 }))
})

export const microsoftCallbackQuery = t.Object({
  code: t.String({ minLength: 1, maxLength: 4096 }),
  state: t.String({ minLength: 32, maxLength: 512 })
})

export const authenticatedUserResponse = t.Object({
  user: t.Object({
    id: t.Integer(),
    name: t.String(),
    firstNames: t.String(),
    lastNames: t.String(),
    email: t.String(),
    status: t.String(),
    role: t.String(),
    permissions: t.Array(t.String())
  }),
  csrfToken: t.Optional(t.String()),
  expiresAt: t.Optional(t.String({ format: 'date-time' }))
})

export const authErrorResponse = t.Object({
  error: t.Object({ code: t.String(), message: t.String(), details: t.Optional(t.Record(t.String(), t.String())) })
})
