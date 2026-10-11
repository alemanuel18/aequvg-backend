import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto'
import { AppError } from '../../../shared/errors/app-error'
import { hmacSha256, pkceChallenge, randomToken, secureEqual, sha256, signSessionJwt, verifyPassword, verifySessionJwt } from '../../../shared/utils/auth-crypto'
import { authRepository } from '../repositories/auth.repository'

export const AUTH_COOKIE = 'aequvg_session'
export const DEVICE_COOKIE = 'aequvg_device'
export const CSRF_COOKIE = 'aequvg_csrf'
export const MICROSOFT_STATE_COOKIE = 'aequvg_ms_state'
export const MICROSOFT_VERIFIER_COOKIE = 'aequvg_ms_verifier'
const SESSION_SECONDS = 8 * 60 * 60
const MICROSOFT_CHALLENGE_SECONDS = 10 * 60

type AuthenticatedUser = Awaited<ReturnType<typeof authRepository.findUserByEmail>>

export type SessionResult = {
  accessToken: string
  deviceSecret: string
  csrfToken: string
  expiresAt: Date
  user: NonNullable<AuthenticatedUser>
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()
const isInstitutionalEmail = (email: string) => /^[^@\s]+@uvg\.edu\.gt$/i.test(email)

const browserContext = (headers: Headers) => {
  const userAgent = headers.get('user-agent')?.trim() || 'unknown'
  const platform = headers.get('sec-ch-ua-platform')?.trim() || 'unknown'
  return `${userAgent}\n${platform}`
}

const sessionSecret = () => {
  const value = process.env.SESSION_SECRET
  if (!value || Buffer.byteLength(value) < 32) throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'La autenticación administrativa no está configurada.')
  return value
}

const publicUser = (user: NonNullable<AuthenticatedUser>) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
  role: user.role.name,
  permissions: user.role.permissions.map(item => item.permission.code).sort()
})

const assertActiveUser = (user: NonNullable<AuthenticatedUser>) => {
  if (!isInstitutionalEmail(user.email)) throw new AppError(403, 'FORBIDDEN', 'La cuenta no pertenece al dominio institucional autorizado.')
  if (user.status !== 'ACTIVO' || !user.role.active) throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta administrativa no está activa.')
}

const createSession = async (user: NonNullable<AuthenticatedUser>, headers: Headers): Promise<SessionResult> => {
  assertActiveUser(user)
  const id = randomUUID()
  const jti = randomToken()
  const deviceSecret = randomToken()
  const csrfToken = randomToken()
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = new Date((issuedAt + SESSION_SECONDS) * 1000)
  const accessToken = signSessionJwt({ sub: String(user.id), sid: id, jti, iat: issuedAt, exp: issuedAt + SESSION_SECONDS, iss: 'aequvg', aud: 'aequvg-admin' })
  await authRepository.createSession({
    id,
    userId: user.id,
    tokenIdentifierHash: sha256(jti),
    deviceSecretHash: sha256(deviceSecret),
    browserContextHash: hmacSha256(browserContext(headers), sessionSecret()),
    csrfTokenHash: sha256(csrfToken),
    expiresAt
  })
  return { accessToken, deviceSecret, csrfToken, expiresAt, user }
}

const dummyPasswordHash = 'scrypt$16384$8$1$MDAwMDAwMDAwMDAwMDAwMA$MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA'

type MicrosoftIdClaims = {
  aud?: string
  exp?: number
  iss?: string
  nonce?: string
  sub?: string
  tid?: string
  email?: string
  preferred_username?: string
}

type MicrosoftJwk = JsonWebKey & { kid?: string; kty?: string }
let cachedMicrosoftKeys: { expiresAt: number; keys: MicrosoftJwk[] } | undefined

const microsoftConfig = () => {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
  if (!tenantId || !clientId || !clientSecret || !redirectUri) throw new AppError(503, 'MICROSOFT_AUTH_NOT_CONFIGURED', 'El inicio de sesión con Microsoft no está configurado.')
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new AppError(503, 'MICROSOFT_AUTH_NOT_CONFIGURED', 'El inicio de sesión con Microsoft no está configurado.')
  return { tenantId, clientId, clientSecret, redirectUri }
}

const fetchMicrosoftKeys = async (tenantId: string) => {
  if (cachedMicrosoftKeys && cachedMicrosoftKeys.expiresAt > Date.now()) return cachedMicrosoftKeys.keys
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
  if (!response.ok) throw new AppError(502, 'MICROSOFT_UNAVAILABLE', 'Microsoft no pudo completar la autenticación.')
  const body = await response.json() as { keys?: MicrosoftJwk[] }
  if (!Array.isArray(body.keys)) throw new AppError(502, 'MICROSOFT_UNAVAILABLE', 'Microsoft no pudo completar la autenticación.')
  cachedMicrosoftKeys = { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 }
  return body.keys
}

const validateMicrosoftIdToken = async (token: string, expectedNonce: string) => {
  const [encodedHeader, encodedPayload, signature, extra] = token.split('.')
  if (!encodedHeader || !encodedPayload || !signature || extra) throw new AppError(401, 'MICROSOFT_TOKEN_INVALID', 'Microsoft devolvió una identidad no válida.')
  let header: { alg?: string; kid?: string }
  let claims: MicrosoftIdClaims
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))
    claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    throw new AppError(401, 'MICROSOFT_TOKEN_INVALID', 'Microsoft devolvió una identidad no válida.')
  }
  const config = microsoftConfig()
  const validClaims = header.alg === 'RS256' && header.kid && claims.aud === config.clientId && claims.iss === `https://login.microsoftonline.com/${config.tenantId}/v2.0` && claims.tid === config.tenantId && claims.nonce === expectedNonce && claims.sub && typeof claims.exp === 'number' && claims.exp > Math.floor(Date.now() / 1000)
  if (!validClaims) throw new AppError(401, 'MICROSOFT_TOKEN_INVALID', 'Microsoft devolvió una identidad no válida.')
  const key = (await fetchMicrosoftKeys(config.tenantId)).find(candidate => candidate.kid === header.kid && candidate.kty === 'RSA')
  if (!key) throw new AppError(401, 'MICROSOFT_TOKEN_INVALID', 'Microsoft devolvió una identidad no válida.')
  const validSignature = verifySignature('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url'))
  if (!validSignature) throw new AppError(401, 'MICROSOFT_TOKEN_INVALID', 'Microsoft devolvió una identidad no válida.')
  return claims as Required<Pick<MicrosoftIdClaims, 'sub'>> & MicrosoftIdClaims
}

const safeReturnTo = (value?: string) => value && value.startsWith('/') && !value.startsWith('//') ? value : null

export const authService = {
  publicUser,

  async loginWithPassword(emailInput: string, password: string, headers: Headers) {
    const email = normalizeEmail(emailInput)
    const user = isInstitutionalEmail(email) ? await authRepository.findUserByEmail(email) : null
    const passwordHash = user?.credential?.passwordHash ?? dummyPasswordHash
    const validPassword = await verifyPassword(password, passwordHash).catch(() => false)
    if (!user || !user.credential || !validPassword) throw new AppError(401, 'INVALID_CREDENTIALS', 'El correo o la contraseña no son válidos.')
    return createSession(user, headers)
  },

  async authenticate(request: Request, requiredPermission?: string) {
    const cookies = Object.fromEntries((request.headers.get('cookie') ?? '').split(';').map(part => part.trim().split(/=(.*)/s, 2)).filter(([name]) => name))
    const token = cookies[AUTH_COOKIE]
    const deviceSecret = cookies[DEVICE_COOKIE]
    if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Se requiere una sesión administrativa.')
    const payload = verifySessionJwt(token)
    const session = await authRepository.findSession(payload.sid)
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.userId !== Number(payload.sub) || !secureEqual(session.tokenIdentifierHash, sha256(payload.jti))) {
      throw new AppError(401, 'INVALID_SESSION', 'La sesión no es válida o ya expiró.')
    }
    const validDevice = deviceSecret && secureEqual(session.deviceSecretHash, sha256(deviceSecret))
    const validContext = secureEqual(session.browserContextHash, hmacSha256(browserContext(request.headers), sessionSecret()))
    if (!validDevice || !validContext) {
      await authRepository.revokeSession(session.id, 'DEVICE_BINDING_MISMATCH')
      throw new AppError(401, 'SESSION_REVOKED', 'La sesión fue revocada por un cambio de dispositivo.')
    }
    assertActiveUser(session.user)
    const permissions = session.user.role.permissions.map(item => item.permission.code)
    if (requiredPermission && !permissions.includes(requiredPermission)) throw new AppError(403, 'FORBIDDEN', 'La cuenta no tiene permiso para realizar esta acción.')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrfToken = request.headers.get('x-csrf-token')
      if (!csrfToken || !secureEqual(session.csrfTokenHash, sha256(csrfToken))) throw new AppError(403, 'CSRF_TOKEN_INVALID', 'El token de protección CSRF no es válido.')
    }
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) void authRepository.touchSession(session.id)
    return { sessionId: session.id, user: session.user, permissions }
  },

  async revokeFromRequest(request: Request, reason = 'LOGOUT') {
    const cookies = Object.fromEntries((request.headers.get('cookie') ?? '').split(';').map(part => part.trim().split(/=(.*)/s, 2)).filter(([name]) => name))
    const token = cookies[AUTH_COOKIE]
    if (!token) return
    try {
      const payload = verifySessionJwt(token)
      await authRepository.revokeSession(payload.sid, reason)
    } catch {
      // Logout remains idempotent for malformed or expired cookies.
    }
  },

  async beginMicrosoft(returnTo?: string) {
    const config = microsoftConfig()
    const state = randomToken()
    const verifier = randomToken(48)
    const nonce = randomToken()
    await authRepository.createMicrosoftChallenge({
      id: randomUUID(), stateHash: sha256(state), verifierHash: sha256(verifier), nonce,
      returnTo: safeReturnTo(returnTo), expiresAt: new Date(Date.now() + MICROSOFT_CHALLENGE_SECONDS * 1000)
    })
    const query = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account'
    })
    return { authorizationUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${query}`, state, verifier, maxAge: MICROSOFT_CHALLENGE_SECONDS }
  },

  async completeMicrosoft(code: string, state: string, cookieState: string | undefined, verifier: string | undefined, headers: Headers) {
    if (!cookieState || !verifier || !secureEqual(state, cookieState)) throw new AppError(401, 'MICROSOFT_STATE_INVALID', 'La solicitud de Microsoft no es válida o expiró.')
    const challenge = await authRepository.consumeMicrosoftChallenge(sha256(state))
    if (!challenge || !secureEqual(challenge.verifierHash, sha256(verifier))) throw new AppError(401, 'MICROSOFT_STATE_INVALID', 'La solicitud de Microsoft no es válida o expiró.')
    const config = microsoftConfig()
    const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: verifier })
    })
    if (!response.ok) throw new AppError(401, 'MICROSOFT_LOGIN_FAILED', 'Microsoft no pudo completar el inicio de sesión.')
    const tokenResponse = await response.json() as { id_token?: string }
    if (!tokenResponse.id_token) throw new AppError(401, 'MICROSOFT_TOKEN_INVALID', 'Microsoft devolvió una identidad no válida.')
    const claims = await validateMicrosoftIdToken(tokenResponse.id_token, challenge.nonce)
    const email = normalizeEmail(claims.email ?? claims.preferred_username ?? '')
    if (!isInstitutionalEmail(email)) throw new AppError(403, 'INSTITUTIONAL_EMAIL_REQUIRED', 'Se requiere una cuenta institucional @uvg.edu.gt.')
    const user = await authRepository.linkMicrosoftIdentity(email, claims.sub)
    if (!user) throw new AppError(403, 'ACCOUNT_NOT_PROVISIONED', 'La cuenta no está habilitada para administrar la plataforma.')
    return { session: await createSession(user, headers), returnTo: challenge.returnTo }
  }
}
