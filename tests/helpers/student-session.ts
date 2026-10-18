import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { hmacSha256, randomToken, sha256, signSessionJwt } from '../../src/shared/utils/auth-crypto'

const TEST_SECRET = 'integration-test-session-secret-at-least-32-characters'
const USER_AGENT = 'AEQUVG-Student-Integration-Test/1.0'

export const createStudentSessionHeaders = async (prisma: PrismaClient, userId: number) => {
  process.env.SESSION_SECRET = TEST_SECRET
  process.env.NODE_ENV = 'test'
  const id = randomUUID()
  const jti = randomToken()
  const deviceSecret = randomToken()
  const csrfToken = randomToken()
  const iat = Math.floor(Date.now() / 1000)
  const expiresAt = new Date((iat + 3600) * 1000)
  await prisma.studentSession.create({
    data: {
      id, userId, tokenIdentifierHash: sha256(jti), deviceSecretHash: sha256(deviceSecret),
      browserContextHash: hmacSha256(`${USER_AGENT}\nunknown`, TEST_SECRET), csrfTokenHash: sha256(csrfToken), expiresAt
    }
  })
  const token = signSessionJwt({ sub: String(userId), sid: id, jti, iat, exp: iat + 3600, iss: 'aequvg', aud: 'aequvg-student' })
  return {
    cookie: `aequvg_student_session=${token}; aequvg_student_device=${deviceSecret}`,
    'user-agent': USER_AGENT,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json'
  }
}
