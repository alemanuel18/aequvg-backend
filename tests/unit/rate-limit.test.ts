import { beforeEach, describe, expect, it } from 'vitest'
import { clearRateLimitsForTests, enforceRateLimit } from '../../src/middleware/rate-limit'

describe('limitación de solicitudes públicas', () => {
  beforeEach(clearRateLimitsForTests)
  it('bloquea al superar el límite', () => {
    enforceRateLimit('test', 2); enforceRateLimit('test', 2)
    expect(() => enforceRateLimit('test', 2)).toThrow('varias solicitudes')
  })
})
