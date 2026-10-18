import { Elysia, t } from 'elysia'
import { clearAuthFailures, enforceAuthRateLimit, enforceRegistrationRateLimit, recordAuthFailure, recordRegistrationAttempt } from '../../../middleware/auth-rate-limit'
import { AppError } from '../../../shared/errors/app-error'
import { studentAuthErrorResponse, studentDeleteBody, studentLoginBody, studentProfileBody, studentRegisterBody, studentSessionResponse, studentUserResponse } from '../dtos/student-auth.schemas'
import { STUDENT_AUTH_COOKIE, STUDENT_CSRF_COOKIE, STUDENT_DEVICE_COOKIE, studentAuthService } from '../services/student-auth.service'

const secureCookies = () => process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true'
const sessionCookieOptions = (expires: Date) => ({ httpOnly: true, secure: secureCookies(), sameSite: 'lax' as const, path: '/', expires })
const clearCookie = { maxAge: 0, path: '/' } as const

export const studentAuthRoutes = new Elysia({ prefix: '/api/v1/student-auth' })
  .post('/register', async ({ body, request, set }) => {
    enforceRegistrationRateLimit(request, body.email)
    recordRegistrationAttempt(request, body.email)
    const user = await studentAuthService.register(body)
    set.status = 201
    return user
  }, {
    body: studentRegisterBody,
    response: { 201: studentUserResponse, 409: studentAuthErrorResponse, 422: studentAuthErrorResponse, 429: studentAuthErrorResponse },
    detail: { tags: ['Acceso estudiantil'], summary: 'Crea una cuenta para un estudiante de UVG' }
  })
  .post('/login', async ({ body, cookie, request }) => {
    enforceAuthRateLimit(request, body.email)
    const session = await studentAuthService.login(body.email, body.password, request.headers).catch(error => {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') recordAuthFailure(request, body.email)
      throw error
    })
    await studentAuthService.revokeFromRequest(request, 'REPLACED_BY_LOGIN')
    clearAuthFailures(request, body.email)
    cookie[STUDENT_AUTH_COOKIE]!.set({ ...sessionCookieOptions(session.expiresAt), value: session.accessToken })
    cookie[STUDENT_DEVICE_COOKIE]!.set({ ...sessionCookieOptions(session.expiresAt), value: session.deviceSecret })
    cookie[STUDENT_CSRF_COOKIE]!.set({ secure: secureCookies(), sameSite: 'lax', path: '/', expires: session.expiresAt, value: session.csrfToken })
    return { user: studentAuthService.publicUser(session.user), csrfToken: session.csrfToken, expiresAt: session.expiresAt.toISOString() }
  }, {
    body: studentLoginBody,
    response: { 200: studentSessionResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 429: studentAuthErrorResponse, 503: studentAuthErrorResponse },
    detail: { tags: ['Acceso estudiantil'], summary: 'Inicia una sesión estudiantil' }
  })
  .get('/me', async ({ request }) => {
    const authenticated = await studentAuthService.authenticate(request)
    return { user: studentAuthService.publicUser(authenticated.user) }
  }, {
    response: { 200: studentSessionResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse },
    detail: { tags: ['Acceso estudiantil'], summary: 'Consulta la sesión estudiantil actual' }
  })
  .patch('/me', async ({ request, body }) => {
    const authenticated = await studentAuthService.authenticate(request)
    return { user: await studentAuthService.updateOwnProfile(authenticated.user.id, body) }
  }, {
    body: studentProfileBody,
    response: { 200: studentSessionResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 404: studentAuthErrorResponse, 422: studentAuthErrorResponse },
    detail: { tags: ['Acceso estudiantil'], summary: 'Actualiza los nombres del perfil estudiantil propio' }
  })
  .post('/logout', async ({ cookie, request, set }) => {
    await studentAuthService.authenticate(request)
    await studentAuthService.revokeFromRequest(request)
    cookie[STUDENT_AUTH_COOKIE]!.set(clearCookie)
    cookie[STUDENT_DEVICE_COOKIE]!.set(clearCookie)
    cookie[STUDENT_CSRF_COOKIE]!.set(clearCookie)
    set.status = 204
  }, {
    response: { 401: studentAuthErrorResponse, 403: studentAuthErrorResponse },
    detail: { tags: ['Acceso estudiantil'], summary: 'Cierra y revoca la sesión estudiantil actual' }
  })
  .delete('/account', async ({ body, cookie, request, set }) => {
    enforceAuthRateLimit(request, body.email)
    await studentAuthService.deleteOwnAccount(body).catch(error => {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') recordAuthFailure(request, body.email)
      throw error
    })
    clearAuthFailures(request, body.email)
    cookie[STUDENT_AUTH_COOKIE]!.set(clearCookie)
    cookie[STUDENT_DEVICE_COOKIE]!.set(clearCookie)
    cookie[STUDENT_CSRF_COOKIE]!.set(clearCookie)
    set.status = 204
  }, {
    body: studentDeleteBody,
    response: { 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 422: studentAuthErrorResponse, 429: studentAuthErrorResponse },
    detail: { tags: ['Acceso estudiantil'], summary: 'Da de baja la cuenta tras verificar nuevamente su identidad' }
  })
