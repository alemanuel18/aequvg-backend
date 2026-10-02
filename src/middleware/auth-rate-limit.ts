import { AppError } from '../shared/errors/app-error'
import { sha256 } from '../shared/utils/auth-crypto'

const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

const rateLimitKey = (request: Request, email: string) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  return sha256(`${ip}\n${email.trim().toLowerCase()}`)
}

export const enforceAuthRateLimit = (request: Request, email: string) => {
  const key = rateLimitKey(request, email)
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) return
  if (current.count >= MAX_ATTEMPTS) throw new AppError(429, 'AUTH_RATE_LIMITED', 'Demasiados intentos de inicio de sesión. Intenta más tarde.')
}

export const recordAuthFailure = (request: Request, email: string) => {
  const key = rateLimitKey(request, email)
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
  else current.count += 1
}

export const clearAuthFailures = (request: Request, email: string) => attempts.delete(rateLimitKey(request, email))

export const resetAuthRateLimitForTests = () => attempts.clear()
