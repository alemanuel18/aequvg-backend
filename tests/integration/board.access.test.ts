import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hmacSha256, randomToken, sha256, signSessionJwt } from '../../src/shared/utils/auth-crypto'

const authRepoMocks = vi.hoisted(() => ({ findUserByEmail: vi.fn(), findSession: vi.fn(), revokeSession: vi.fn(), touchSession: vi.fn() }))
const boardRepoMocks = vi.hoisted(() => ({ publicList: vi.fn(), adminList: vi.fn(), findById: vi.fn(), findIds: vi.fn(), findImage: vi.fn(), create: vi.fn(), update: vi.fn(), retire: vi.fn(), reorder: vi.fn() }))
vi.mock('../../src/modules/users/repositories/auth.repository', () => ({ authRepository: authRepoMocks }))
vi.mock('../../src/modules/board/repositories/board.repository', () => ({ boardRepository: boardRepoMocks }))

import { createApp } from '../../src/app'

const SESSION_SECRET = 'secreto-de-junta-con-al-menos-32-caracteres'
const USER_AGENT = 'AEQUVG-Board-Test/1.0'
const PLATFORM = '"Linux"'
const validMember = { photoId: null, name: 'Ana Pérez', position: 'Presidenta', description: null, institutionalEmail: 'ana@uvg.edu.gt', term: '2026', termStartsAt: '2026-01-01', termEndsAt: '2026-12-31', displayOrder: 1, status: 'ACTIVO' }

describe('acceso administrativo de Junta Directiva', () => {
  const app = createApp()
  beforeEach(() => { vi.clearAllMocks(); process.env.SESSION_SECRET = SESSION_SECRET; authRepoMocks.findUserByEmail.mockResolvedValue(null) })
  afterEach(() => delete process.env.SESSION_SECRET)

  const session = (options: { status?: 'ACTIVO' | 'INACTIVO'; permissions?: string[]; expired?: boolean } = {}) => {
    const sid = randomToken(); const jti = randomToken(); const deviceSecret = randomToken(); const csrfToken = randomToken(); const issuedAt = Math.floor(Date.now() / 1000)
    const token = signSessionJwt({ sub: '91', sid, jti, iat: issuedAt, exp: issuedAt + 3600, iss: 'aequvg', aud: 'aequvg-admin' })
    authRepoMocks.findSession.mockResolvedValue({ id: sid, userId: 91, tokenIdentifierHash: sha256(jti), deviceSecretHash: sha256(deviceSecret), browserContextHash: hmacSha256(`${USER_AGENT}\n${PLATFORM}`, SESSION_SECRET), csrfTokenHash: sha256(csrfToken), expiresAt: options.expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 3600000), revokedAt: null, lastSeenAt: new Date(), user: { id: 91, name: 'Cuenta institucional', email: 'persona@uvg.edu.gt', status: options.status ?? 'ACTIVO', role: { active: true, permissions: (options.permissions ?? ['BOARD_MANAGE']).map(code => ({ permission: { code } })) } } })
    return { cookie: `aequvg_session=${token}; aequvg_device=${deviceSecret}`, csrfToken }
  }
  const request = (method: string, path: string, auth?: ReturnType<typeof session>, body?: unknown, csrf = true) => app.handle(new Request(`http://localhost${path}`, { method, headers: { ...(auth ? { cookie: auth.cookie, 'user-agent': USER_AGENT, 'sec-ch-ua-platform': PLATFORM } : {}), ...(auth && csrf && method !== 'GET' ? { 'x-csrf-token': auth.csrfToken } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }))
  const routes = [
    { method: 'GET', path: '/api/v1/admin/board-members' },
    { method: 'POST', path: '/api/v1/admin/board-members', body: validMember },
    { method: 'PUT', path: '/api/v1/admin/board-members/8', body: validMember },
    { method: 'PUT', path: '/api/v1/admin/board-members/order', body: { items: [{ id: 8, displayOrder: 0 }] } },
    { method: 'DELETE', path: '/api/v1/admin/board-members/8' }
  ]

  it.each(routes)('rechaza $method $path sin sesión y sin modificar datos', async route => {
    expect((await request(route.method, route.path, undefined, route.body)).status).toBe(401)
    expect(boardRepoMocks.create).not.toHaveBeenCalled(); expect(boardRepoMocks.update).not.toHaveBeenCalled(); expect(boardRepoMocks.retire).not.toHaveBeenCalled(); expect(boardRepoMocks.reorder).not.toHaveBeenCalled()
  })

  it('distingue sesión inválida o expirada, cuenta inactiva y falta de permiso', async () => {
    expect((await request('GET', '/api/v1/admin/board-members', session({ expired: true }))).status).toBe(401)
    expect((await request('GET', '/api/v1/admin/board-members', session({ status: 'INACTIVO' }))).status).toBe(403)
    expect((await request('GET', '/api/v1/admin/board-members', session({ permissions: ['NEWS_MANAGE'] }))).status).toBe(403)
    const invalid = await app.handle(new Request('http://localhost/api/v1/admin/board-members', { headers: { cookie: 'aequvg_session=invalida; aequvg_device=invalido' } }))
    expect(invalid.status).toBe(401)
    expect(boardRepoMocks.adminList).not.toHaveBeenCalled()
  })

  it('no concede acceso por dominio institucional, ruta directa u Origin/CORS', async () => {
    const login = await app.handle(new Request('http://localhost/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3001' }, body: JSON.stringify({ email: 'no-aprovisionada@uvg.edu.gt', password: 'Clave-segura-123!' }) }))
    expect(login.status).toBe(401)
    expect((await app.handle(new Request('http://localhost/api/v1/admin/board-members', { headers: { origin: 'https://sitio-externo.example' } }))).status).toBe(401)
  })

  it('exige CSRF en cada escritura', async () => {
    for (const route of routes.filter(item => item.method !== 'GET')) {
      const response = await request(route.method, route.path, session(), route.body, false)
      expect(response.status).toBe(403)
      expect((await response.json() as { error: { code: string } }).error.code).toBe('CSRF_TOKEN_INVALID')
    }
  })

  it('permite todos los métodos al administrador autorizado', async () => {
    const saved = { id: 8, ...validMember, photo: null }
    boardRepoMocks.adminList.mockResolvedValue([saved]); boardRepoMocks.findById.mockResolvedValue({ id: 8 }); boardRepoMocks.findIds.mockResolvedValue([{ id: 8 }]); boardRepoMocks.create.mockResolvedValue(saved); boardRepoMocks.update.mockResolvedValue(saved); boardRepoMocks.retire.mockResolvedValue({ ...saved, status: 'INACTIVO' }); boardRepoMocks.reorder.mockResolvedValue([saved])
    for (const route of routes) expect((await request(route.method, route.path, session(), route.body)).status).toBe(route.method === 'POST' ? 201 : 200)
  })

  it('rechaza manipulación de IDs sin tocar el repositorio', async () => {
    expect((await request('DELETE', '/api/v1/admin/board-members/no-es-id', session())).status).toBe(422)
    expect(boardRepoMocks.retire).not.toHaveBeenCalled()
  })
})
