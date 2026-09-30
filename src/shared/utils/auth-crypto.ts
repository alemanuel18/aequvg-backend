import { createHash, createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { AppError } from '../errors/app-error'

const scrypt = promisify(nodeScrypt)
const encoder = new TextEncoder()

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
export const hmacSha256 = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('hex')

export const secureEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64) as Buffer
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export const verifyPassword = async (password: string, encoded: string) => {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = encoded.split('$')
  if (algorithm !== 'scrypt' || cost !== '16384' || blockSize !== '8' || parallelization !== '1' || !saltValue || !hashValue) return false
  const expected = Buffer.from(hashValue, 'base64url')
  const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length) as Buffer
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

type JwtPayload = {
  sub: string
  sid: string
  jti: string
  iat: number
  exp: number
  iss: 'aequvg'
  aud: 'aequvg-admin'
}

const jwtSecret = () => {
  const secret = process.env.SESSION_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'La autenticación administrativa no está configurada.')
  }
  return secret
}

const encodeJson = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

export const signSessionJwt = (payload: JwtPayload) => {
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' })
  const body = encodeJson(payload)
  const signature = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export const verifySessionJwt = (token: string): JwtPayload => {
  const [header, body, signature, extra] = token.split('.')
  if (!header || !body || !signature || extra) throw new AppError(401, 'INVALID_SESSION', 'La sesión no es válida.')
  const expected = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest('base64url')
  if (!secureEqual(signature, expected)) throw new AppError(401, 'INVALID_SESSION', 'La sesión no es válida.')
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string; typ?: string }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload
    const now = Math.floor(Date.now() / 1000)
    if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT' || payload.iss !== 'aequvg' || payload.aud !== 'aequvg-admin' || !payload.sub || !payload.sid || !payload.jti || payload.iat > now + 60 || payload.exp <= now || payload.exp <= payload.iat) {
      throw new Error('invalid claims')
    }
    return payload
  } catch {
    throw new AppError(401, 'INVALID_SESSION', 'La sesión no es válida.')
  }
}

export const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')
export const utf8 = (value: string) => encoder.encode(value)
