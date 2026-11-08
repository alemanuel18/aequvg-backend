import { beforeEach, describe, expect, it } from 'vitest'
import { enforceAuthRateLimit, recordAuthFailure, resetAuthRateLimitForTests } from '../../src/middleware/auth-rate-limit'

describe('límite de intentos de autenticación', () => {
  beforeEach(resetAuthRateLimitForTests)

  it('bloquea el sexto intento fallido para el mismo origen y cuenta', () => {
    const request = new Request('http://localhost/login', { headers: { 'x-forwarded-for': '192.0.2.10' } })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => enforceAuthRateLimit(request, 'admin@uvg.edu.gt')).not.toThrow()
      recordAuthFailure(request, 'admin@uvg.edu.gt')
    }
    expect(() => enforceAuthRateLimit(request, 'ADMIN@uvg.edu.gt')).toThrowError(/demasiados intentos/i)
    expect(() => enforceAuthRateLimit(request, 'otra@uvg.edu.gt')).not.toThrow()
  })
})
