import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hmacSha256, randomToken, sha256, signSessionJwt } from '../../src/shared/utils/auth-crypto'

const authRepoMocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  revokeSession: vi.fn(),
  touchSession: vi.fn()
}))

const institutionalRepoMocks = vi.hoisted(() => ({
  listAll: vi.fn(),
  listPublished: vi.fn(),
  listFeatured: vi.fn(),
  findById: vi.fn(),
  findExistingNews: vi.fn(),
  findExistingEvents: vi.fn(),
  countActiveAnnouncements: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  saveFeatured: vi.fn()
}))

vi.mock('../../src/modules/users/repositories/auth.repository', () => ({
  authRepository: authRepoMocks
}))

vi.mock('../../src/modules/institutional/repositories/institutional.repository', () => ({
  institutionalRepository: institutionalRepoMocks
}))

import { createApp } from '../../src/app'

const SESSION_SECRET = 'secreto-de-pruebas-con-al-menos-32-caracteres'
const USER_AGENT = 'Mozilla/5.0 AEQUVG-Integration-Client'
const PLATFORM = '"Linux"'
const BROWSER_CONTEXT = `${USER_AGENT}\n${PLATFORM}`

describe('Verificación de acceso administrativo en contenido institucional', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = SESSION_SECRET
  })

  afterEach(() => {
    delete process.env.SESSION_SECRET
  })

  const createAuthSession = (options: {
    status?: 'ACTIVO' | 'INACTIVO'
    roleActive?: boolean
    permissions?: string[]
  } = {}) => {
    const sid = 'session-uuid-1234'
    const jti = randomToken()
    const deviceSecret = randomToken()
    const csrfToken = randomToken()
    const issuedAt = Math.floor(Date.now() / 1000)

    const token = signSessionJwt({
      sub: '42',
      sid,
      jti,
      iat: issuedAt,
      exp: issuedAt + 3600,
      iss: 'aequvg',
      aud: 'aequvg-admin'
    })

    const user = {
      id: 42,
      name: 'Usuario Institucional',
      email: 'usuario@uvg.edu.gt',
      status: options.status ?? 'ACTIVO',
      role: {
        id: 5,
        name: 'EDITOR',
        active: options.roleActive ?? true,
        permissions: (options.permissions ?? ['INSTITUTIONAL_MANAGE']).map(code => ({
          permission: { code, description: `Permiso ${code}` }
        }))
      }
    }

    const sessionData = {
      id: sid,
      userId: 42,
      tokenIdentifierHash: sha256(jti),
      deviceSecretHash: sha256(deviceSecret),
      browserContextHash: hmacSha256(BROWSER_CONTEXT, SESSION_SECRET),
      csrfTokenHash: sha256(csrfToken),
      expiresAt: new Date(Date.now() + 3600000),
      revokedAt: null,
      revocationReason: null,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      user
    }

    authRepoMocks.findSession.mockResolvedValue(sessionData)

    return {
      cookies: `aequvg_session=${token}; aequvg_device=${deviceSecret}`,
      csrfToken,
      token,
      deviceSecret
    }
  }

  const routesToTest = [
    { method: 'POST', path: '/api/v1/admin/institutional-content', body: { type: 'LABORATORIO', title: 'Nuevo Lab', body: 'Detalles de lab' } },
    { method: 'PUT', path: '/api/v1/admin/institutional-content/10', body: { type: 'HERO', title: 'Hero Actualizado', body: 'Cuerpo hero' } },
    { method: 'DELETE', path: '/api/v1/admin/institutional-content/10' },
    { method: 'PUT', path: '/api/v1/admin/institutional-content/featured', body: { newsIds: [1], eventIds: [2] } },
    { method: 'GET', path: '/api/v1/admin/institutional-content' },
    { method: 'GET', path: '/api/v1/admin/institutional-content/featured' }
  ]

  describe('1. Rechazo sin sesión administrativa (HTTP 401)', () => {
    for (const route of routesToTest) {
      it(`rechaza ${route.method} ${route.path} si no se envían cookies de sesión`, async () => {
        const response = await app.handle(new Request(`http://localhost${route.path}`, {
          method: route.method,
          headers: route.body ? { 'content-type': 'application/json' } : {},
          body: route.body ? JSON.stringify(route.body) : undefined
        }))

        expect(response.status).toBe(401)
        const body = await response.json() as { error: { code: string } }
        expect(body.error.code).toBe('UNAUTHORIZED')

        expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
        expect(institutionalRepoMocks.update).not.toHaveBeenCalled()
        expect(institutionalRepoMocks.archive).not.toHaveBeenCalled()
        expect(institutionalRepoMocks.saveFeatured).not.toHaveBeenCalled()
      })
    }
  })

  describe('2. Rechazo con sesión expirada o token inválido (HTTP 401)', () => {
    for (const route of routesToTest) {
      it(`rechaza ${route.method} ${route.path} con token corrupto o expirado`, async () => {
        const response = await app.handle(new Request(`http://localhost${route.path}`, {
          method: route.method,
          headers: {
            cookie: 'aequvg_session=token-invalido-o-expirado; aequvg_device=device-xyz',
            ...(route.body ? { 'content-type': 'application/json' } : {})
          },
          body: route.body ? JSON.stringify(route.body) : undefined
        }))

        expect(response.status).toBe(401)
        const body = await response.json() as { error: { code: string } }
        expect(body.error.code).toBe('INVALID_SESSION')

        expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
        expect(institutionalRepoMocks.update).not.toHaveBeenCalled()
        expect(institutionalRepoMocks.archive).not.toHaveBeenCalled()
        expect(institutionalRepoMocks.saveFeatured).not.toHaveBeenCalled()
      })
    }
  })

  describe('3. Cuenta externa sin provisión institucional', () => {
    it('rechaza el inicio de sesión y acceso directo a una cuenta externa ajena a @uvg.edu.gt', async () => {
      const response = await app.handle(new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
        body: JSON.stringify({ email: 'atacante@gmail.com', password: 'Password123!' })
      }))

      expect(response.status).toBe(401)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('INVALID_CREDENTIALS')
      expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
    })

    it('demuestra que Origin o CORS no sustituyen la autorización en el servidor', async () => {
      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'POST',
        headers: {
          'Origin': 'https://sitio-externo-malicioso.com',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'HERO', title: 'Ataque', body: 'Contenido no autorizado' })
      }))

      expect(response.status).toBe(401)
      expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
    })
  })

  describe('4. Cuenta institucional inactiva (HTTP 403)', () => {
    it('rechaza con 403 ACCOUNT_DISABLED a una cuenta institucional suspendida', async () => {
      const auth = createAuthSession({ status: 'INACTIVO' })

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'POST',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'LABORATORIO', title: 'Lab', body: 'Detalles' })
      }))

      expect(response.status).toBe(403)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('ACCOUNT_DISABLED')
      expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
    })
  })

  describe('4. Cuenta institucional sin permiso INSTITUTIONAL_MANAGE (HTTP 403)', () => {
    it('demuestra que pertenecer al dominio @uvg.edu.gt NO otorga permiso de administración', async () => {
      // Cuenta con permiso para NEWS_MANAGE pero sin INSTITUTIONAL_MANAGE
      const auth = createAuthSession({ permissions: ['NEWS_MANAGE'] })

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'POST',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'LABORATORIO', title: 'Lab Sin Permiso', body: 'Detalles' })
      }))

      expect(response.status).toBe(403)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('FORBIDDEN')
      expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
    })

    it('rechaza actualizar destacados de inicio sin permiso INSTITUTIONAL_MANAGE', async () => {
      const auth = createAuthSession({ permissions: ['EVENTS_MANAGE'] })

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content/featured', {
        method: 'PUT',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ newsIds: [1], eventIds: [2] })
      }))

      expect(response.status).toBe(403)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('FORBIDDEN')
      expect(institutionalRepoMocks.saveFeatured).not.toHaveBeenCalled()
    })
  })

  describe('5. Mutaciones sin CSRF Token (HTTP 403)', () => {
    it('rechaza solicitudes POST sin x-csrf-token aunque la sesión sea válida', async () => {
      const auth = createAuthSession()

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'POST',
        headers: {
          cookie: auth.cookies,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'TESTIMONIO', title: 'Testimonio', body: 'Excelente' })
      }))

      expect(response.status).toBe(403)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('CSRF_TOKEN_INVALID')
      expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
    })
  })

  describe('6. Acceso concedido a administrador autorizado', () => {
    it('permite crear bloque institucional a un administrador con permisos y CSRF válido', async () => {
      const auth = createAuthSession()
      institutionalRepoMocks.countActiveAnnouncements.mockResolvedValue(1)
      institutionalRepoMocks.create.mockResolvedValue({ id: 101, title: 'Nuevo Lab' })

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'POST',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'LABORATORIO', title: 'Nuevo Lab', body: 'Detalles del laboratorio' })
      }))

      expect(response.status).toBe(201)
      expect(institutionalRepoMocks.create).toHaveBeenCalled()
    })

    it('permite actualizar destacados de inicio', async () => {
      const auth = createAuthSession()
      institutionalRepoMocks.findExistingNews.mockResolvedValue([{ id: 1 }])
      institutionalRepoMocks.findExistingEvents.mockResolvedValue([{ id: 2 }])
      institutionalRepoMocks.saveFeatured.mockResolvedValue({ newsIds: [1], eventIds: [2] })

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content/featured', {
        method: 'PUT',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ newsIds: [1], eventIds: [2] })
      }))

      expect(response.status).toBe(200)
      expect(institutionalRepoMocks.saveFeatured).toHaveBeenCalledWith([1], [2])
    })

    it('permite archivar un bloque institucional', async () => {
      const auth = createAuthSession()
      institutionalRepoMocks.findById.mockResolvedValue({ id: 10, type: 'CAMPO_LABORAL' })
      institutionalRepoMocks.archive.mockResolvedValue({ id: 10, status: 'ARCHIVADO' })

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content/10', {
        method: 'DELETE',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM
        }
      }))

      expect(response.status).toBe(200)
      expect(institutionalRepoMocks.archive).toHaveBeenCalledWith(10)
    })

    it('rechaza imagen inválida y contenido vacío después de normalizar', async () => {
      const auth = createAuthSession()
      const requestHeaders = {
        cookie: auth.cookies,
        'x-csrf-token': auth.csrfToken,
        'user-agent': USER_AGENT,
        'sec-ch-ua-platform': PLATFORM,
        'content-type': 'application/json'
      }

      const invalidImage = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ type: 'LABORATORIO', title: 'Laboratorio', body: 'Contenido válido', imageUrl: 'javascript:alert(1)' })
      }))
      expect(invalidImage.status).toBe(422)
      expect((await invalidImage.json() as { error: { code: string } }).error.code).toBe('INVALID_IMAGE_URL')

      const emptyContent = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ type: 'LABORATORIO', title: '<p></p>', body: 'Contenido válido' })
      }))
      expect(emptyContent.status).toBe(422)
      expect((await emptyContent.json() as { error: { code: string } }).error.code).toBe('INVALID_INSTITUTIONAL_CONTENT')
      expect(institutionalRepoMocks.create).not.toHaveBeenCalled()
    })

    it('rechaza una cuenta autenticada sin INSTITUTIONAL_MANAGE con 403', async () => {
      const auth = createAuthSession({ permissions: ['NEWS_MANAGE'] })
      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content', {
        method: 'GET',
        headers: { cookie: auth.cookies, 'user-agent': USER_AGENT, 'sec-ch-ua-platform': PLATFORM }
      }))

      expect(response.status).toBe(403)
      expect((await response.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN')
      expect(institutionalRepoMocks.listAll).not.toHaveBeenCalled()
    })
  })

  describe('7. Manipulación de identificadores (IDs)', () => {
    it('rechaza ID no numérico con 422 VALIDATION_ERROR', async () => {
      const auth = createAuthSession()

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content/invalido-abc', {
        method: 'DELETE',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM
        }
      }))

      expect(response.status).toBe(422)
      expect(institutionalRepoMocks.archive).not.toHaveBeenCalled()
    })

    it('devuelve 404 BLOCK_NOT_FOUND al intentar actualizar un ID inexistente', async () => {
      const auth = createAuthSession()
      institutionalRepoMocks.findById.mockResolvedValue(null)

      const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content/999999', {
        method: 'PUT',
        headers: {
          cookie: auth.cookies,
          'x-csrf-token': auth.csrfToken,
          'user-agent': USER_AGENT,
          'sec-ch-ua-platform': PLATFORM,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ type: 'HERO', title: 'Inexistente', body: 'No existe' })
      }))

      expect(response.status).toBe(404)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('BLOCK_NOT_FOUND')
      expect(institutionalRepoMocks.update).not.toHaveBeenCalled()
    })
  })
})
