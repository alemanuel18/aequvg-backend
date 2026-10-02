import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword, signSessionJwt, verifyPassword, verifySessionJwt } from '../../src/shared/utils/auth-crypto'

describe('criptografía de autenticación', () => {
  beforeEach(() => { process.env.SESSION_SECRET = 'secreto-de-pruebas-con-al-menos-32-caracteres' })
  afterEach(() => { delete process.env.SESSION_SECRET })

  it('genera hashes scrypt con sal única y verifica la contraseña', async () => {
    const first = await hashPassword('Clave-segura-123!')
    const second = await hashPassword('Clave-segura-123!')
    expect(first).not.toBe(second)
    await expect(verifyPassword('Clave-segura-123!', first)).resolves.toBe(true)
    await expect(verifyPassword('incorrecta', first)).resolves.toBe(false)
  })

  it('firma y valida únicamente JWT intactos y vigentes', () => {
    const now = Math.floor(Date.now() / 1000)
    const token = signSessionJwt({ sub: '10', sid: crypto.randomUUID(), jti: 'token-id', iat: now, exp: now + 60, iss: 'aequvg', aud: 'aequvg-admin' })
    expect(verifySessionJwt(token).sub).toBe('10')
    expect(() => verifySessionJwt(`${token.slice(0, -1)}x`)).toThrowError(/sesión no es válida/i)
  })

  it('rechaza secretos de sesión débiles', () => {
    process.env.SESSION_SECRET = 'corto'
    const now = Math.floor(Date.now() / 1000)
    expect(() => signSessionJwt({ sub: '1', sid: crypto.randomUUID(), jti: 'id', iat: now, exp: now + 60, iss: 'aequvg', aud: 'aequvg-admin' })).toThrowError(/no está configurada/i)
  })
})
