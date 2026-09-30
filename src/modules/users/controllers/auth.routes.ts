import { Elysia } from 'elysia'
import { clearAuthFailures, enforceAuthRateLimit, recordAuthFailure } from '../../../middleware/auth-rate-limit'
import { authErrorResponse, authenticatedUserResponse, loginBody, microsoftCallbackQuery, microsoftStartQuery } from '../dtos/auth.schemas'
import { AUTH_COOKIE, authService, CSRF_COOKIE, DEVICE_COOKIE, MICROSOFT_STATE_COOKIE, MICROSOFT_VERIFIER_COOKIE } from '../services/auth.service'

const secureCookies = () => process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true'
const sessionCookieOptions = (expires: Date) => ({ httpOnly: true, secure: secureCookies(), sameSite: 'lax' as const, path: '/', expires })
const clearCookie = { maxAge: 0, path: '/' } as const

export const authRoutes = new Elysia({ prefix: '/api/v1/auth' })
  .post('/login', async ({ body, cookie, request }) => {
    enforceAuthRateLimit(request, body.email)
    await authService.revokeFromRequest(request, 'REPLACED_BY_LOGIN')
    const session = await authService.loginWithPassword(body.email, body.password, request.headers).catch(error => {
      recordAuthFailure(request, body.email)
      throw error
    })
    clearAuthFailures(request, body.email)
    cookie[AUTH_COOKIE]!.set({ ...sessionCookieOptions(session.expiresAt), value: session.accessToken })
    cookie[DEVICE_COOKIE]!.set({ ...sessionCookieOptions(session.expiresAt), value: session.deviceSecret })
    cookie[CSRF_COOKIE]!.set({ secure: secureCookies(), sameSite: 'lax', path: '/', expires: session.expiresAt, value: session.csrfToken })
    return { user: authService.publicUser(session.user), csrfToken: session.csrfToken, expiresAt: session.expiresAt.toISOString() }
  }, {
    body: loginBody,
    response: { 200: authenticatedUserResponse, 401: authErrorResponse, 403: authErrorResponse, 429: authErrorResponse, 503: authErrorResponse },
    detail: { tags: ['Autenticación'], summary: 'Inicia sesión con correo y contraseña' }
  })
  .get('/microsoft', async ({ query, cookie }) => {
    const challenge = await authService.beginMicrosoft(query.returnTo)
    const options = { httpOnly: true, secure: secureCookies(), sameSite: 'lax' as const, path: '/api/v1/auth/microsoft/callback', maxAge: challenge.maxAge }
    cookie[MICROSOFT_STATE_COOKIE]!.set({ ...options, value: challenge.state })
    cookie[MICROSOFT_VERIFIER_COOKIE]!.set({ ...options, value: challenge.verifier })
    return { authorizationUrl: challenge.authorizationUrl }
  }, {
    query: microsoftStartQuery,
    detail: { tags: ['Autenticación'], summary: 'Inicia el flujo OpenID Connect con Microsoft' }
  })
  .get('/microsoft/callback', async ({ query, cookie, request, set }) => {
    const result = await authService.completeMicrosoft(
      query.code,
      query.state,
      cookie[MICROSOFT_STATE_COOKIE]!.value as string | undefined,
      cookie[MICROSOFT_VERIFIER_COOKIE]!.value as string | undefined,
      request.headers
    )
    await authService.revokeFromRequest(request, 'REPLACED_BY_LOGIN')
    cookie[MICROSOFT_STATE_COOKIE]!.set(clearCookie)
    cookie[MICROSOFT_VERIFIER_COOKIE]!.set(clearCookie)
    cookie[AUTH_COOKIE]!.set({ ...sessionCookieOptions(result.session.expiresAt), value: result.session.accessToken })
    cookie[DEVICE_COOKIE]!.set({ ...sessionCookieOptions(result.session.expiresAt), value: result.session.deviceSecret })
    cookie[CSRF_COOKIE]!.set({ secure: secureCookies(), sameSite: 'lax', path: '/', expires: result.session.expiresAt, value: result.session.csrfToken })
    const frontend = process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3001'
    set.redirect = new URL(result.returnTo ?? '/admin', frontend).toString()
  }, {
    query: microsoftCallbackQuery,
    detail: { tags: ['Autenticación'], summary: 'Completa el flujo OpenID Connect con Microsoft' }
  })
  .get('/me', async ({ request }) => {
    const authenticated = await authService.authenticate(request, 'ADMIN_ACCESS')
    return { user: authService.publicUser(authenticated.user) }
  }, {
    response: { 200: authenticatedUserResponse, 401: authErrorResponse, 403: authErrorResponse },
    detail: { tags: ['Autenticación'], summary: 'Consulta la sesión administrativa actual' }
  })
  .post('/logout', async ({ cookie, request, set }) => {
    await authService.authenticate(request, 'ADMIN_ACCESS')
    await authService.revokeFromRequest(request)
    cookie[AUTH_COOKIE]!.set(clearCookie)
    cookie[DEVICE_COOKIE]!.set(clearCookie)
    cookie[CSRF_COOKIE]!.set(clearCookie)
    set.status = 204
  }, {
    response: { 401: authErrorResponse, 403: authErrorResponse },
    detail: { tags: ['Autenticación'], summary: 'Cierra y revoca la sesión actual' }
  })
