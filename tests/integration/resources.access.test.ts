import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hmacSha256, randomToken, sha256, signSessionJwt } from '../../src/shared/utils/auth-crypto'

const authRepoMocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  findUserByEmail: vi.fn(),
  revokeSession: vi.fn(),
  touchSession: vi.fn()
}))

const resourceRepoMocks = vi.hoisted(() => ({
  list: vi.fn(), count: vi.fn(), findById: vi.fn(), findPublicById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  activeCategories: vi.fn(), findActiveCategory: vi.fn(), findActiveUser: vi.fn(), findFile: vi.fn()
}))

vi.mock('../../src/modules/users/repositories/auth.repository', () => ({ authRepository: authRepoMocks }))
vi.mock('../../src/modules/resources/repositories/resource.repository', () => ({ resourceRepository: resourceRepoMocks }))

import { createApp } from '../../src/app'

const SESSION_SECRET = 'secreto-de-pruebas-de-recursos-con-al-menos-32-caracteres'
const USER_AGENT = 'AEQUVG-Resources-Access-Test/1.0'
const PLATFORM = '"Linux"'
const BROWSER_CONTEXT = `${USER_AGENT}\n${PLATFORM}`

const resource = {
  id: 10, categoryId: 3, fileId: 20, title: 'Guía de recursos', description: 'Descripción suficiente para el recurso de prueba.', status: 'BORRADOR',
  createdAt: new Date(), publishedAt: null, category: { id: 3, name: 'Laboratorio', active: true }, file: { id: 20, originalName: 'guia.pdf', mimeType: 'application/pdf' }, links: [], createdBy: { id: 42, name: 'Administrador' }
}

type AdminRoute = { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; body?: Record<string, unknown> }

const routes: AdminRoute[] = [
  { method: 'GET', path: '/api/v1/admin/resources' },
  { method: 'GET', path: '/api/v1/admin/resources/10' },
  { method: 'POST', path: '/api/v1/admin/resources', body: { categoryId: 3, fileId: 20, title: 'Nuevo recurso', description: 'Descripción suficiente para crear el recurso.', status: 'BORRADOR' } },
  { method: 'PUT', path: '/api/v1/admin/resources/10', body: { description: 'Descripción suficiente para actualizar el recurso.' } },
  { method: 'PATCH', path: '/api/v1/admin/resources/10/archive' },
  { method: 'DELETE', path: '/api/v1/admin/resources/10' }
] as const

const request = (route: AdminRoute, headers: Record<string, string> = {}) => new Request(`http://localhost${route.path}`, {
  method: route.method,
  headers: { ...(route.body ? { 'content-type': 'application/json' } : {}), ...headers },
  body: route.body ? JSON.stringify(route.body) : undefined
})

describe('Acceso HTTP administrativo de recursos', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = SESSION_SECRET
    resourceRepoMocks.list.mockResolvedValue([resource])
    resourceRepoMocks.count.mockResolvedValue(1)
    resourceRepoMocks.findById.mockResolvedValue(resource)
    resourceRepoMocks.create.mockResolvedValue(resource)
    resourceRepoMocks.update.mockResolvedValue(resource)
    resourceRepoMocks.remove.mockResolvedValue(resource)
    resourceRepoMocks.activeCategories.mockResolvedValue([{ id: 3, name: 'Laboratorio' }])
    resourceRepoMocks.findActiveCategory.mockResolvedValue({ id: 3 })
    resourceRepoMocks.findActiveUser.mockResolvedValue({ id: 42 })
    resourceRepoMocks.findFile.mockResolvedValue({ id: 20, mimeType: 'application/pdf', storageKey: 'resources/20.pdf', sizeBytes: 1024n })
  })

  afterEach(() => {
    delete process.env.SESSION_SECRET
  })

  const createAuth = (options: { email?: string; status?: 'ACTIVO' | 'INACTIVO'; roleActive?: boolean; permissions?: string[]; expiresAt?: Date } = {}) => {
    const sid = 'resources-access-session'
    const jti = randomToken()
    const deviceSecret = randomToken()
    const csrfToken = randomToken()
    const issuedAt = Math.floor(Date.now() / 1000)
    const token = signSessionJwt({ sub: '42', sid, jti, iat: issuedAt, exp: issuedAt + 3600, iss: 'aequvg', aud: 'aequvg-admin' })
    authRepoMocks.findSession.mockResolvedValue({
      id: sid, userId: 42, tokenIdentifierHash: sha256(jti), deviceSecretHash: sha256(deviceSecret),
      browserContextHash: hmacSha256(BROWSER_CONTEXT, SESSION_SECRET), csrfTokenHash: sha256(csrfToken),
      expiresAt: options.expiresAt ?? new Date(Date.now() + 3600000), revokedAt: null, lastSeenAt: new Date(),
      user: { id: 42, name: 'Usuario de prueba', email: options.email ?? 'usuario@uvg.edu.gt', status: options.status ?? 'ACTIVO', role: { id: 5, name: 'EDITOR', active: options.roleActive ?? true, permissions: (options.permissions ?? ['RESOURCES_MANAGE']).map(code => ({ permission: { code, description: code } })) } }
    })
    return { cookie: `aequvg_session=${token}; aequvg_device=${deviceSecret}`, 'user-agent': USER_AGENT, 'sec-ch-ua-platform': PLATFORM, 'x-csrf-token': csrfToken }
  }

  const expectError = async (response: Response, status: number, code: string) => {
    expect(response.status).toBe(status)
    expect((await response.json() as { error: { code: string } }).error.code).toBe(code)
  }

  it.each(routes)('rechaza $method $path sin sesión y no toca datos', async (route) => {
    await expectError(await app.handle(request(route)), 401, 'UNAUTHORIZED')
    expect(resourceRepoMocks.create).not.toHaveBeenCalled()
    expect(resourceRepoMocks.update).not.toHaveBeenCalled()
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(routes)('rechaza $method $path con token inválido', async (route) => {
    await expectError(await app.handle(request(route, { cookie: 'aequvg_session=corrupto; aequvg_device=device' })), 401, 'INVALID_SESSION')
    expect(resourceRepoMocks.create).not.toHaveBeenCalled()
    expect(resourceRepoMocks.update).not.toHaveBeenCalled()
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(routes)('rechaza $method $path con sesión expirada', async (route) => {
    const headers = createAuth({ expiresAt: new Date(0) })
    await expectError(await app.handle(request(route, headers)), 401, 'INVALID_SESSION')
    expect(resourceRepoMocks.create).not.toHaveBeenCalled()
    expect(resourceRepoMocks.update).not.toHaveBeenCalled()
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(routes)('rechaza $method $path a cuenta externa sin provisión', async (route) => {
    await expectError(await app.handle(request(route, { Origin: 'https://externo.example', cookie: 'aequvg_session=external; aequvg_device=device' })), 401, 'INVALID_SESSION')
    expect(resourceRepoMocks.create).not.toHaveBeenCalled()
    expect(resourceRepoMocks.update).not.toHaveBeenCalled()
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it('rechaza una sesión válida asociada a una cuenta externa', async () => {
    await expectError(await app.handle(request(routes[0]!, createAuth({ email: 'atacante@gmail.com' }))), 403, 'FORBIDDEN')
    expect(resourceRepoMocks.list).not.toHaveBeenCalled()
  })

  it.each(routes)('rechaza $method $path a cuenta institucional sin RESOURCES_MANAGE', async (route) => {
    await expectError(await app.handle(request(route, createAuth({ permissions: ['NEWS_MANAGE'] }))), 403, 'FORBIDDEN')
    expect(resourceRepoMocks.create).not.toHaveBeenCalled()
    expect(resourceRepoMocks.update).not.toHaveBeenCalled()
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(routes)('rechaza $method $path a cuenta inactiva', async (route) => {
    await expectError(await app.handle(request(route, createAuth({ status: 'INACTIVO' }))), 403, 'ACCOUNT_DISABLED')
    expect(resourceRepoMocks.create).not.toHaveBeenCalled()
    expect(resourceRepoMocks.update).not.toHaveBeenCalled()
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(routes)('rechaza $method $path con rol inactivo', async (route) => {
    await expectError(await app.handle(request(route, createAuth({ roleActive: false }))), 403, 'ACCOUNT_DISABLED')
    expect(resourceRepoMocks.create).not.toHaveBeenCalled()
    expect(resourceRepoMocks.update).not.toHaveBeenCalled()
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(routes)('permite $method $path al administrador autorizado', async (route) => {
    const response = await app.handle(request(route, createAuth()))
    expect(response.status).toBe(route.method === 'POST' ? 201 : 200)
  })

  it('rechaza manipulación de IDs sin modificar datos', async () => {
    const headers = createAuth()
    await expectError(await app.handle(new Request('http://localhost/api/v1/admin/resources/not-an-id', { headers })), 422, 'VALIDATION_ERROR')
    resourceRepoMocks.findById.mockResolvedValue(null)
    await expectError(await app.handle(request({ method: 'DELETE', path: '/api/v1/admin/resources/999999' }, headers)), 404, 'RESOURCE_NOT_FOUND')
    expect(resourceRepoMocks.remove).not.toHaveBeenCalled()
  })

  it('rechaza una cuenta externa aunque envíe Origin permitido o un prefijo administrativo', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/admin/resources', { headers: { Origin: 'http://localhost:3001', cookie: 'aequvg_session=external' } }))
    await expectError(response, 401, 'INVALID_SESSION')
    expect(resourceRepoMocks.list).not.toHaveBeenCalled()
  })
})
