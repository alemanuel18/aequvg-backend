import { t } from 'elysia'
import { AppError } from '../../../shared/errors/app-error'

export const moderationIdempotencyHeaders = t.Object({
  'idempotency-key': t.String({ minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_.:-]+$' })
}, { additionalProperties: true })

export const moderationIdempotencyParameter = {
  name: 'idempotency-key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_.:-]+$' }
}

export const requireModerationIdempotencyKey = (value: string | null) => {
  if (!value?.trim()) throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'Envía Idempotency-Key y reutiliza la misma clave al reintentar esta operación.')
  return value.trim()
}
