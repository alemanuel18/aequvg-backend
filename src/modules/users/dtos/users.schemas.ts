import { t } from 'elysia'
import { authErrorResponse } from './auth.schemas'

const roleSummary = t.Object({ id: t.Integer(), name: t.String() })
export const userResponse = t.Object({
  id: t.Integer(),
  name: t.String(),
  firstNames: t.String(),
  lastNames: t.String(),
  email: t.String(),
  status: t.Union([t.Literal('ACTIVO'), t.Literal('INACTIVO'), t.Literal('BLOQUEADO')]),
  role: roleSummary,
  authenticationProviders: t.Array(t.Union([t.Literal('PASSWORD'), t.Literal('MICROSOFT')])),
  createdAt: t.Date(),
  updatedAt: t.Date()
})
export const userListResponse = t.Array(userResponse)
export const roleListResponse = t.Array(t.Object({
  id: t.Integer(), name: t.String(), description: t.Nullable(t.String()), permissions: t.Array(t.String())
}))
export const createUserBody = t.Object({
  firstNames: t.String({ minLength: 2, maxLength: 80 }),
  lastNames: t.String({ minLength: 2, maxLength: 80 }),
  email: t.String({ format: 'email', maxLength: 254 }),
  roleId: t.Integer({ minimum: 1 }),
  password: t.Optional(t.String({ minLength: 12, maxLength: 128 }))
}, { additionalProperties: false })
export const updateUserBody = t.Object({
  firstNames: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
  lastNames: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
  roleId: t.Optional(t.Integer({ minimum: 1 })),
  status: t.Optional(t.Union([t.Literal('ACTIVO'), t.Literal('INACTIVO'), t.Literal('BLOQUEADO')]))
}, { additionalProperties: false, minProperties: 1 })
export const passwordBody = t.Object({ password: t.String({ minLength: 12, maxLength: 128 }) }, { additionalProperties: false })
export const userIdParams = t.Object({ id: t.Integer({ minimum: 1 }) })
export const usersErrorResponse = authErrorResponse
