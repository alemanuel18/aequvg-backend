import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hmacSha256, randomToken, sha256, signSessionJwt } from '../../src/shared/utils/auth-crypto'

const authRepoMocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  findUserByEmail: vi.fn(),
  touchSession: vi.fn(),
  revokeSession: vi.fn()
}))

const newsRepoMocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  findById: vi.fn(),
  findActiveUser: vi.fn(),
  findActiveCategory: vi.fn(),
  findImage: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  activeCategories: vi.fn(),
  findPublicById: vi.fn()
}))

vi.mock('../../src/modules/users/repositories/auth.repository', () => ({ authRepository: authRepoMocks }))
vi.mock('../../src/modules/news/repositories/news.repository', () => ({ newsRepository: newsRepoMocks }))

import { createApp } from '../../src/app'

const SESSION_SECRET = 'secreto-de-pruebas-con-al-menos-32-caracteres'
const USER_AGENT = 'AEQUVG-Direct-HTTP-Test/1.0'
const PLATFORM = '"Linux"'
const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)

const newsRecord = {
  id: 42,
  categoryId: 7,
  imageId: null,
  title: 'Noticia de autorización',
  summary: 'Resumen suficiente para probar el contrato.',
  content: 'Contenido suficientemente extenso para probar el contrato HTTP administrativo.',
  status: 'PUBLICADO' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
  category: { id: 7, name: 'Académico', active: true },
  image: null,
  createdBy: { id: 42, name: 'Administrador de pruebas' }
}

const body = {
  categoryId: 7,
  title: newsRecord.title,
  summary: newsRecord.summary,
  content: newsRecord.content,
  status: 'PUBLICADO'
}

const writeRoutes: Array<{ method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; body?: Record<string, unknown> }> = [
  { method: 'POST', path: '/api/v1/admin/news', body },
  { method: 'PUT', path: '/api/v1/admin/news/42', body: { title: 'Título actualizado' } },
  { method: 'PATCH', path: '/api/v1/admin/news/42/archive' },
  { method: 'DELETE', path: '/api/v1/admin/news/42' }
] as const

const createSession = (options: {
  status?: 'ACTIVO' | 'INACTIVO'
  roleActive?: boolean
  permissions?: string[]
  expired?: boolean
} = {}) => {
  const sid = randomToken()
  const jti = randomToken()
  const deviceSecret = randomToken()
  const csrfToken = randomToken()
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = options.expired ? issuedAt - 60 : issuedAt + 3600
  const user = {
    id: 42,
    name: 'Administrador de pruebas',
    email: 'admin.pruebas@uvg.edu.gt',
    status: options.status ?? 'ACTIVO',
    role: {
      id: 5,
      name: 'ASSOCIATION_REPRESENTATIVE',
      active: options.roleActive ?? true,
      permissions: (options.permissions ?? ['NEWS_MANAGE']).map(code => ({ permission: { code, description: code } }))
    }
  }

  authRepoMocks.findSession.mockResolvedValue({
    id: sid,
    userId: 42,
    tokenIdentifierHash: sha256(jti),
    deviceSecretHash: sha256(deviceSecret),
    browserContextHash: hmacSha256(`${USER_AGENT}\n${PLATFORM}`, SESSION_SECRET),
    csrfTokenHash: sha256(csrfToken),
    expiresAt: new Date(expiresAt * 1000),
    revokedAt: null,
    lastSeenAt: new Date(),
    user
  })

  const token = signSessionJwt({ sub: '42', sid, jti, iat: issuedAt, exp: expiresAt, iss: 'aequvg', aud: 'aequvg-admin' })
  return {
    cookie: `aequvg_session=${token}; aequvg_device=${deviceSecret}`,
    csrfToken
  }
}

const headersFor = (session: ReturnType<typeof createSession>, mutation = true) => ({
  cookie: session.cookie,
  'user-agent': USER_AGENT,
  'sec-ch-ua-platform': PLATFORM,
  ...(mutation ? { 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' } : {})
})

describe('Acceso administrativo HTTP directo de noticias', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = SESSION_SECRET
    newsRepoMocks.findActiveUser.mockResolvedValue({ id: 42 })
    newsRepoMocks.findActiveCategory.mockResolvedValue({ id: 7 })
    newsRepoMocks.findImage.mockResolvedValue(null)
    newsRepoMocks.findById.mockResolvedValue(newsRecord)
    newsRepoMocks.create.mockResolvedValue(newsRecord)
    newsRepoMocks.update.mockResolvedValue(newsRecord)
    newsRepoMocks.remove.mockResolvedValue(newsRecord)
  })

  it.each(writeRoutes)('rechaza $method $path sin sesión y no muta datos', async route => {
    const response = await app.handle(request(route.path, {
      method: route.method,
      headers: route.body ? { 'content-type': 'application/json' } : {},
      body: route.body ? JSON.stringify(route.body) : undefined
    }))

    expect(response.status).toBe(401)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
    expect(newsRepoMocks.create).not.toHaveBeenCalled()
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(writeRoutes)('rechaza $method $path con sesión inválida o expirada', async route => {
    const expired = createSession({ expired: true })
    const response = await app.handle(request(route.path, {
      method: route.method,
      headers: headersFor(expired),
      body: route.body ? JSON.stringify(route.body) : undefined
    }))

    expect(response.status).toBe(401)
    expect((await response.json() as { error: { code: string } }).error.code).toMatch(/INVALID_SESSION|SESSION_REVOKED/)
    expect(newsRepoMocks.create).not.toHaveBeenCalled()
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(writeRoutes)('rechaza $method $path con token corrupto', async route => {
    const response = await app.handle(request(route.path, {
      method: route.method,
      headers: {
        cookie: 'aequvg_session=token-corrupto; aequvg_device=dispositivo-corrupto',
        'user-agent': USER_AGENT,
        'sec-ch-ua-platform': PLATFORM,
        'content-type': 'application/json'
      },
      body: route.body ? JSON.stringify(route.body) : undefined
    }))

    expect(response.status).toBe(401)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('INVALID_SESSION')
    expect(newsRepoMocks.create).not.toHaveBeenCalled()
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(writeRoutes)('rechaza $method $path a una cuenta institucional sin NEWS_MANAGE', async route => {
    const session = createSession({ permissions: ['INSTITUTIONAL_MANAGE'] })
    const response = await app.handle(request(route.path, {
      method: route.method,
      headers: headersFor(session),
      body: route.body ? JSON.stringify(route.body) : undefined
    }))

    expect(response.status).toBe(403)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN')
    expect(newsRepoMocks.create).not.toHaveBeenCalled()
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each(writeRoutes)('rechaza $method $path a una cuenta institucional inactiva', async route => {
    const session = createSession({ status: 'INACTIVO' })
    const response = await app.handle(request(route.path, {
      method: route.method,
      headers: headersFor(session),
      body: route.body ? JSON.stringify(route.body) : undefined
    }))

    expect(response.status).toBe(403)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('ACCOUNT_DISABLED')
    expect(newsRepoMocks.create).not.toHaveBeenCalled()
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })

  it('no concede acceso administrativo a un correo externo ni por Origin/CORS', async () => {
    authRepoMocks.findUserByEmail.mockResolvedValue(null)
    const login = await app.handle(request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({ email: 'atacante@gmail.com', password: 'Password123!' })
    }))
    expect(login.status).toBe(401)

    const response = await app.handle(request('/api/v1/admin/news', {
      method: 'POST',
      headers: { Origin: 'https://malicioso.example', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }))
    expect(response.status).toBe(401)
    expect(newsRepoMocks.create).not.toHaveBeenCalled()
  })

  it.each(writeRoutes)('rechaza $method $path sin CSRF aunque la sesión y permiso sean válidos', async route => {
    const session = createSession()
    const headers = headersFor(session)
    delete headers['x-csrf-token']
    const response = await app.handle(request(route.path, {
      method: route.method,
      headers,
      body: route.body ? JSON.stringify(route.body) : undefined
    }))

    expect(response.status).toBe(403)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('CSRF_TOKEN_INVALID')
    expect(newsRepoMocks.create).not.toHaveBeenCalled()
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })

  it('permite POST, PUT, PATCH y DELETE a un administrador autorizado', async () => {
    const session = createSession()
    const appRequests = async () => {
      const created = await app.handle(request('/api/v1/admin/news', { method: 'POST', headers: headersFor(session), body: JSON.stringify(body) }))
      const updated = await app.handle(request('/api/v1/admin/news/42', { method: 'PUT', headers: headersFor(session), body: JSON.stringify({ title: 'Actualizada' }) }))
      const archived = await app.handle(request('/api/v1/admin/news/42/archive', { method: 'PATCH', headers: headersFor(session) }))
      const deleted = await app.handle(request('/api/v1/admin/news/42', { method: 'DELETE', headers: headersFor(session) }))
      return [created, updated, archived, deleted]
    }

    expect((await appRequests()).map(response => response.status)).toEqual([201, 200, 200, 200])
    expect(newsRepoMocks.create).toHaveBeenCalledTimes(1)
    expect(newsRepoMocks.update).toHaveBeenCalledTimes(2)
    expect(newsRepoMocks.remove).toHaveBeenCalledTimes(1)
  })

  it.each([
    { method: 'PUT', path: '/api/v1/admin/news/no-es-un-id' },
    { method: 'PATCH', path: '/api/v1/admin/news/no-es-un-id/archive' },
    { method: 'DELETE', path: '/api/v1/admin/news/no-es-un-id' }
  ] as const)('rechaza manipulación de ID en $method $path antes de tocar el repositorio', async route => {
    const session = createSession()
    const response = await app.handle(request(route.path, { method: route.method, headers: headersFor(session), body: route.method === 'PUT' ? JSON.stringify({ title: 'Manipulada' }) : undefined }))
    expect(response.status).toBe(422)
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })

  it.each([
    { method: 'PUT', path: '/api/v1/admin/news/999999' },
    { method: 'PATCH', path: '/api/v1/admin/news/999999/archive' },
    { method: 'DELETE', path: '/api/v1/admin/news/999999' }
  ] as const)('devuelve 404 para ID inexistente en $method $path sin mutar', async route => {
    const session = createSession()
    newsRepoMocks.findById.mockResolvedValue(null)
    const response = await app.handle(request(route.path, { method: route.method, headers: headersFor(session), body: route.method === 'PUT' ? JSON.stringify({ title: 'Inexistente' }) : undefined }))
    expect(response.status).toBe(404)
    expect(newsRepoMocks.update).not.toHaveBeenCalled()
    expect(newsRepoMocks.remove).not.toHaveBeenCalled()
  })
})
