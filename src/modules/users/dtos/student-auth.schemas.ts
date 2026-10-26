import { t } from 'elysia'

export const studentRegisterBody = t.Object({
  firstNames: t.String({ minLength: 2, maxLength: 80 }),
  lastNames: t.String({ minLength: 2, maxLength: 80 }),
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

export const studentProfileBody = t.Object({
  firstNames: t.String({ minLength: 2, maxLength: 80 }),
  lastNames: t.String({ minLength: 2, maxLength: 80 })
}, { additionalProperties: true, minProperties: 1 })

export const studentUserResponse = t.Object({
  id: t.Integer(),
  name: t.String(),
  firstNames: t.String(),
  lastNames: t.String(),
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
  t.Object({ status: t.Literal('ACTIVO'), reason: t.String({ minLength: 5, maxLength: 1000 }) }, { additionalProperties: true }),
  t.Object({
    status: t.Literal('BLOQUEADO_TEMPORAL'),
    blockedUntil: t.String({ format: 'date-time' }),
    reason: t.String({ minLength: 5, maxLength: 1000 })
  }, { additionalProperties: true }),
  t.Object({
    status: t.Literal('BLOQUEADO_PERMANENTE'),
    reviewChannel: t.String({ minLength: 2, maxLength: 255 }),
    reason: t.String({ minLength: 5, maxLength: 1000 })
  }, { additionalProperties: true })
])

export const managedStudentListQuery = t.Object({
  q: t.Optional(t.String({ maxLength: 160 })),
  type: t.Optional(t.Union([t.Literal('ESTUDIANTE'), t.Literal('INTERESADO')])),
  status: t.Optional(t.Union([t.Literal('ACTIVO'), t.Literal('BLOQUEADO_TEMPORAL'), t.Literal('BLOQUEADO_PERMANENTE'), t.Literal('ELIMINADO')])),
  page: t.Optional(t.Numeric({ minimum: 1, maximum: 100000 })),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 }))
})

export const managedStudentDeleteBody = t.Object({ reason: t.String({ minLength: 5, maxLength: 1000 }) }, { additionalProperties: false })

const managedStudent = t.Object({
  id: t.Integer(), name: t.String(), firstNames: t.String(), lastNames: t.String(), email: t.String(),
  isStudent: t.Boolean(), status: t.String(), blockedUntil: t.Nullable(t.Date()), reviewChannel: t.Nullable(t.String()),
  deletedAt: t.Nullable(t.Date()), createdAt: t.Date(), updatedAt: t.Date()
})
export const managedStudentListResponse = t.Object({
  items: t.Array(managedStudent),
  pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
})
export const managedStudentDetailResponse = t.Intersect([managedStudent, t.Object({
  isStudent: t.Boolean(), moderationViolationCount: t.Integer(), moderationIncidents: t.Array(t.Object({
    id: t.Integer(), source: t.String(), policyVersion: t.String(), ruleId: t.String(), evidenceHash: t.String(),
    occurrenceNumber: t.Integer(), sanction: t.String(), blockedUntil: t.Nullable(t.Date()),
    reviewChannel: t.Nullable(t.String()), createdAt: t.Date()
  })), statusHistory: t.Array(t.Object({
    id: t.Integer(), fromStatus: t.String(), toStatus: t.String(), reason: t.String(),
    blockedUntil: t.Nullable(t.Date()), reviewChannel: t.Nullable(t.String()), createdAt: t.Date(),
    actor: t.Nullable(t.Object({ id: t.Integer(), name: t.String() }))
  }))
})])
