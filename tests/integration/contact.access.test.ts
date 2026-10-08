import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hmacSha256, randomToken, sha256, signSessionJwt } from '../../src/shared/utils/auth-crypto'

const authRepoMocks = vi.hoisted(() => ({ findUserByEmail: vi.fn(), findSession: vi.fn(), revokeSession: vi.fn(), touchSession: vi.fn() }))
const contactRepoMocks = vi.hoisted(() => ({
  publicMethods: vi.fn(), allMethods: vi.fn(), primaryEmailMethod: vi.fn(),
  createMethod: vi.fn(), updateMethod: vi.fn(), deactivateMethod: vi.fn(), reorderMethods: vi.fn()
}))
const emailMocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('../../src/modules/users/repositories/auth.repository', () => ({ authRepository: authRepoMocks }))
vi.mock('../../src/modules/contact/repositories/contact.repository', () => ({ contactRepository: contactRepoMocks }))
vi.mock('../../src/modules/contact/services/contact-email.service', () => ({ contactEmailService: emailMocks }))

import { createApp } from '../../src/app'

const SESSION_SECRET = 'secreto-de-pruebas-con-al-menos-32-caracteres'
const USER_AGENT = 'AEQUVG-Contact-Test/1.0'
const PLATFORM = '"Linux"'
const validMethod = { type: 'INSTAGRAM', label: 'Instagram', value: '@aeq_uvg', url: 'https://instagram.com/aeq_uvg', displayOrder: 1, active: true }

describe('Acceso administrativo y entrega pública de contacto', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = SESSION_SECRET
    authRepoMocks.findUserByEmail.mockResolvedValue(null)
  })

  afterEach(() => delete process.env.SESSION_SECRET)

  const session = (options: { status?: 'ACTIVO' | 'INACTIVO'; permissions?: string[]; expired?: boolean } = {}) => {
    const sid = 'contact-session-id'
    const jti = randomToken()
    const deviceSecret = randomToken()
    const csrfToken = randomToken()
    const issuedAt = Math.floor(Date.now() / 1000)
    const token = signSessionJwt({ sub: '81', sid, jti, iat: issuedAt, exp: issuedAt + 3600, iss: 'aequvg', aud: 'aequvg-admin' })
    authRepoMocks.findSession.mockResolvedValue({
      id: sid,
      userId: 81,
      tokenIdentifierHash: sha256(jti),
      deviceSecretHash: sha256(deviceSecret),
      browserContextHash: hmacSha256(`${USER_AGENT}\n${PLATFORM}`, SESSION_SECRET),
      csrfTokenHash: sha256(csrfToken),
      expiresAt: options.expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 3600000),
      revokedAt: null,
      lastSeenAt: new Date(),
      user: {
        id: 81,
        name: 'Cuenta institucional',
        email: 'persona@uvg.edu.gt',
        status: options.status ?? 'ACTIVO',
        role: { active: true, permissions: (options.permissions ?? ['CONTACT_MANAGE']).map(code => ({ permission: { code } })) }
      }
    })
    return { cookie: `aequvg_session=${token}; aequvg_device=${deviceSecret}`, csrfToken }
  }

  const request = (method: string, path: string, auth?: ReturnType<typeof session>, body?: unknown, includeCsrf = true) => app.handle(new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(auth ? { cookie: auth.cookie, 'user-agent': USER_AGENT, 'sec-ch-ua-platform': PLATFORM } : {}),
      ...(auth && includeCsrf && method !== 'GET' ? { 'x-csrf-token': auth.csrfToken } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  }))

  const adminRoutes = [
    { method: 'GET', path: '/api/v1/admin/contact-methods' },
    { method: 'POST', path: '/api/v1/admin/contact-methods', body: validMethod },
    { method: 'PUT', path: '/api/v1/admin/contact-methods/order', body: { orderedIds: [7, 8] } },
    { method: 'PUT', path: '/api/v1/admin/contact-methods/8', body: validMethod },
    { method: 'DELETE', path: '/api/v1/admin/contact-methods/8' }
  ]

  it.each(adminRoutes)('rechaza $method $path sin sesión y no modifica medios', async route => {
    const response = await request(route.method, route.path, undefined, route.body)
    expect(response.status).toBe(401)
    expect(contactRepoMocks.createMethod).not.toHaveBeenCalled()
    expect(contactRepoMocks.updateMethod).not.toHaveBeenCalled()
    expect(contactRepoMocks.deactivateMethod).not.toHaveBeenCalled()
    expect(contactRepoMocks.reorderMethods).not.toHaveBeenCalled()
  })

  it('distingue sesión expirada, cuenta inactiva y cuenta sin permiso', async () => {
    expect((await request('GET', '/api/v1/admin/contact-methods', session({ expired: true }))).status).toBe(401)
    expect((await request('GET', '/api/v1/admin/contact-methods', session({ status: 'INACTIVO' }))).status).toBe(403)
    expect((await request('GET', '/api/v1/admin/contact-methods', session({ permissions: ['NEWS_MANAGE'] }))).status).toBe(403)
    expect(contactRepoMocks.allMethods).not.toHaveBeenCalled()
  })

  it('no concede acceso por usar dominio institucional ni por Origin', async () => {
    const login = await app.handle(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' },
      body: JSON.stringify({ email: 'no-aprovisionada@uvg.edu.gt', password: 'Clave-segura-123!' })
    }))
    expect(login.status).toBe(401)
    const direct = await app.handle(new Request('http://localhost/api/v1/admin/contact-methods', { headers: { origin: 'http://localhost:3001' } }))
    expect(direct.status).toBe(401)
  })

  it('exige CSRF en todas las escrituras con una sesión válida', async () => {
    for (const route of adminRoutes.filter(item => item.method !== 'GET')) {
      const response = await request(route.method, route.path, session(), route.body, false)
      expect(response.status).toBe(403)
      expect((await response.json() as { error: { code: string } }).error.code).toBe('CSRF_TOKEN_INVALID')
    }
  })

  it('permite al administrador autorizado consultar, crear, editar, ordenar y desactivar', async () => {
    contactRepoMocks.allMethods.mockResolvedValue([
      { id: 7, type: 'EMAIL', displayOrder: 0 },
      { id: 8, type: 'INSTAGRAM', displayOrder: 1 }
    ])
    contactRepoMocks.createMethod.mockResolvedValue({ id: 7, ...validMethod })
    contactRepoMocks.updateMethod.mockResolvedValue({ id: 8, ...validMethod })
    contactRepoMocks.deactivateMethod.mockResolvedValue({ id: 8, ...validMethod, active: false })
    contactRepoMocks.reorderMethods.mockResolvedValue(undefined)
    expect((await request('GET', '/api/v1/admin/contact-methods', session())).status).toBe(200)
    expect((await request('POST', '/api/v1/admin/contact-methods', session(), validMethod)).status).toBe(201)
    expect((await request('PUT', '/api/v1/admin/contact-methods/order', session(), { orderedIds: [8, 7] })).status).toBe(200)
    expect((await request('PUT', '/api/v1/admin/contact-methods/8', session(), validMethod)).status).toBe(200)
    expect((await request('DELETE', '/api/v1/admin/contact-methods/8', session())).status).toBe(200)
  })

  it('rechaza IDs manipulados antes de tocar el repositorio', async () => {
    const response = await request('DELETE', '/api/v1/admin/contact-methods/no-es-id', session())
    expect(response.status).toBe(422)
    expect(contactRepoMocks.deactivateMethod).not.toHaveBeenCalled()
  })

  it('mantiene público el POST, valida consentimiento y no acepta estados internos', async () => {
    contactRepoMocks.primaryEmailMethod.mockResolvedValue({ value: 'asoquimica@uvg.edu.gt' })
    emailMocks.send.mockResolvedValue(undefined)
    const body = { name: 'Ana Pérez', email: 'ana@example.com', phone: '+502 5555 5555', type: 'CONSULTA', subject: 'Información', message: 'Quisiera recibir más información.', consent: true, privacyVersion: '2026-10' }
    const accepted = await request('POST', '/api/v1/contact-requests', undefined, body)
    expect(accepted.status).toBe(202)
    expect(await accepted.json()).toEqual({ accepted: true })
    expect(emailMocks.send).toHaveBeenCalledOnce()

    const invalid = await request('POST', '/api/v1/contact-requests', undefined, { ...body, consent: false, status: 'ATENDIDA' })
    expect(invalid.status).toBe(422)
    expect(emailMocks.send).toHaveBeenCalledOnce()
  })

  it('no expone la bandeja descartada ni sus detalles', async () => {
    expect((await request('GET', '/api/v1/admin/contact-requests', session())).status).toBe(404)
    expect((await request('GET', '/api/v1/admin/contact-requests/1', session())).status).toBe(404)
  })
})
