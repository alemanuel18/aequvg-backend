import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  findSession: vi.fn(),
  createSession: vi.fn(),
  touchSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeUserSessions: vi.fn(),
  createMicrosoftChallenge: vi.fn(),
  consumeMicrosoftChallenge: vi.fn(),
  linkMicrosoftIdentity: vi.fn()
}))

vi.mock('../../src/modules/users/repositories/auth.repository', () => ({ authRepository: repositoryMocks }))

import { authService } from '../../src/modules/users/services/auth.service'
import { hashPassword } from '../../src/shared/utils/auth-crypto'

const userAgent = 'AEQUVG-Test-Browser/1.0'
const baseUser = {
  id: 7,
  roleId: 3,
  name: 'Administradora de prueba',
  email: 'administradora@uvg.edu.gt',
  status: 'ACTIVO',
  createdAt: new Date(),
  updatedAt: new Date(),
  role: {
    id: 3,
    name: 'CAREER_DIRECTOR',
    description: null,
    active: true,
    permissions: [{ roleId: 3, permissionId: 1, permission: { id: 1, code: 'ADMIN_ACCESS', description: 'Acceso' } }]
  },
  credential: null
} as const

describe('servicio de sesiones administrativas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = 'secreto-de-pruebas-con-al-menos-32-caracteres'
  })

  afterEach(() => {
    for (const key of ['SESSION_SECRET', 'MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI']) delete process.env[key]
  })

  it('vincula la sesión al dispositivo y revoca la cookie reutilizada en otro navegador', async () => {
    const passwordHash = await hashPassword('Clave-segura-123!')
    const user = { ...baseUser, credential: { userId: baseUser.id, passwordHash, updatedAt: new Date() } }
    repositoryMocks.findUserByEmail.mockResolvedValue(user)
    let persisted: Record<string, unknown> = {}
    repositoryMocks.createSession.mockImplementation(async data => { persisted = data; return data })

    const headers = new Headers({ 'user-agent': userAgent, 'sec-ch-ua-platform': '"Linux"' })
    const result = await authService.loginWithPassword(user.email, 'Clave-segura-123!', headers)
    repositoryMocks.findSession.mockResolvedValue({
      ...persisted,
      revokedAt: null,
      revocationReason: null,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      user
    })

    const validRequest = new Request('http://localhost/api/v1/auth/me', {
      headers: { cookie: `aequvg_session=${result.accessToken}; aequvg_device=${result.deviceSecret}`, 'user-agent': userAgent, 'sec-ch-ua-platform': '"Linux"' }
    })
    await expect(authService.authenticate(validRequest, 'ADMIN_ACCESS')).resolves.toMatchObject({ user: { id: 7 } })

    const copiedRequest = new Request('http://localhost/api/v1/auth/me', {
      headers: { cookie: `aequvg_session=${result.accessToken}; aequvg_device=${result.deviceSecret}`, 'user-agent': 'Otro-Navegador/2.0', 'sec-ch-ua-platform': '"Windows"' }
    })
    await expect(authService.authenticate(copiedRequest, 'ADMIN_ACCESS')).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    expect(repositoryMocks.revokeSession).toHaveBeenCalledWith(persisted.id, 'DEVICE_BINDING_MISMATCH')
  })

  it('no incorpora roles en el JWT y consulta los permisos vigentes en cada solicitud', async () => {
    const passwordHash = await hashPassword('Clave-segura-123!')
    const user = { ...baseUser, credential: { userId: baseUser.id, passwordHash, updatedAt: new Date() } }
    repositoryMocks.findUserByEmail.mockResolvedValue(user)
    let persisted: Record<string, unknown> = {}
    repositoryMocks.createSession.mockImplementation(async data => { persisted = data; return data })
    const headers = new Headers({ 'user-agent': userAgent })
    const result = await authService.loginWithPassword(user.email, 'Clave-segura-123!', headers)
    repositoryMocks.findSession.mockResolvedValue({ ...persisted, revokedAt: null, revocationReason: null, createdAt: new Date(), lastSeenAt: new Date(), user })
    const request = new Request('http://localhost/api/v1/admin/users', { headers: { cookie: `aequvg_session=${result.accessToken}; aequvg_device=${result.deviceSecret}`, 'user-agent': userAgent } })
    await expect(authService.authenticate(request, 'USERS_MANAGE')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('construye el flujo Microsoft para un tenant específico con PKCE y retorno local', async () => {
    process.env.MICROSOFT_TENANT_ID = '11111111-1111-1111-1111-111111111111'
    process.env.MICROSOFT_CLIENT_ID = '22222222-2222-2222-2222-222222222222'
    process.env.MICROSOFT_CLIENT_SECRET = 'client-secret'
    process.env.MICROSOFT_REDIRECT_URI = 'http://localhost:3000/api/v1/auth/microsoft/callback'
    repositoryMocks.createMicrosoftChallenge.mockResolvedValue({})
    const result = await authService.beginMicrosoft('//sitio-malicioso.example')
    const url = new URL(result.authorizationUrl)
    expect(url.hostname).toBe('login.microsoftonline.com')
    expect(url.pathname).toContain(process.env.MICROSOFT_TENANT_ID)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe(result.state)
    expect(repositoryMocks.createMicrosoftChallenge).toHaveBeenCalledWith(expect.objectContaining({ returnTo: null, verifierHash: expect.any(String), nonce: expect.any(String) }))
  })
})
