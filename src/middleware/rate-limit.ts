import { AppError } from '../shared/errors/app-error'

const attempts = new Map<string, number[]>()

export const enforceRateLimit = (key: string, limit = 5, windowMs = 60_000) => {
  const now = Date.now()
  const active = (attempts.get(key) ?? []).filter(time => now - time < windowMs)
  if (active.length >= limit) throw new AppError(429, 'RATE_LIMITED', 'Has enviado varias solicitudes. Intenta de nuevo en un minuto.')
  active.push(now)
  attempts.set(key, active)
}

export const clearRateLimitsForTests = () => attempts.clear()
