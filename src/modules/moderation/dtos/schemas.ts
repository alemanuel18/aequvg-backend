import { t } from 'elysia'

export const moderationIdempotencyHeaders = t.Object({
  'idempotency-key': t.Optional(t.String({ minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_.:-]+$' }))
}, { additionalProperties: true })
