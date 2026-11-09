import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authRepoMocks = vi.hoisted(() => ({ findSession: vi.fn(), revokeSession: vi.fn(), touchSession: vi.fn() }))
const blogRepoMocks = vi.hoisted(() => ({ list: vi.fn(), count: vi.fn(), bySlug: vi.fn(), byId: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), activeUser: vi.fn(), image: vi.fn() }))

vi.mock('../../src/modules/users/repositories/auth.repository', () => ({ authRepository: authRepoMocks }))
vi.mock('../../src/modules/blog/repositories/blog.repository', () => ({ blogRepository: blogRepoMocks }))

import { createApp } from '../../src/app'
import { hmacSha256, randomToken, sha256, signSessionJwt } from '../../src/shared/utils/auth-crypto'

const sessionSecret = 'secreto-de-pruebas-con-al-menos-32-caracteres'
const userAgent = 'Mozilla/5.0 ACS acceptance tests'
const platform = '"Linux"'
const post = {
  id: 7, imageId: null, title: 'Experiencias ACS', slug: 'experiencias-acs', summary: 'Historias de colaboración entre AsoQuímica y ACS.',
  content: '<h2>Trabajo conjunto</h2><p>Una experiencia de prueba con contenido suficiente.</p>', status: 'PUBLICADO',
  createdAt: new Date('2026-10-01T12:00:00.000Z'), updatedAt: new Date('2026-10-01T12:00:00.000Z'), publishedAt: new Date('2026-10-01T12:00:00.000Z'),
  image: null, createdBy: { id: 42, name: 'Administración de prueba' }
}

describe('API de Blog ACS: consulta pública y permisos', () => {
  const app = createApp()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = sessionSecret
    blogRepoMocks.list.mockResolvedValue([post])
    blogRepoMocks.count.mockResolvedValue(1)
    blogRepoMocks.bySlug.mockResolvedValue(post)
  })

  afterEach(() => { delete process.env.SESSION_SECRET })

  const adminHeaders = (permissions: string[]) => {
    const sid = 'acs-test-session'
    const jti = randomToken()
    const deviceSecret = randomToken()
    const csrfToken = randomToken()
    const issuedAt = Math.floor(Date.now() / 1000)
    const user = {
      id: 42, name: 'Administración de prueba', email: 'admin@uvg.edu.gt', status: 'ACTIVO',
      role: { id: 5, name: 'EDITOR', active: true, permissions: permissions.map(code => ({ permission: { code, description: code } })) }
    }
    authRepoMocks.findSession.mockResolvedValue({
      id: sid, userId: 42, tokenIdentifierHash: sha256(jti), deviceSecretHash: sha256(deviceSecret),
      browserContextHash: hmacSha256(`${userAgent}\n${platform}`, sessionSecret), csrfTokenHash: sha256(csrfToken),
      expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null, revocationReason: null,
      createdAt: new Date(), lastSeenAt: new Date(), user
    })
    const token = signSessionJwt({ sub: '42', sid, jti, iat: issuedAt, exp: issuedAt + 3600, iss: 'aequvg', aud: 'aequvg-admin' })
    return {
      cookie: `aequvg_session=${token}; aequvg_device=${deviceSecret}`,
      'user-agent': userAgent,
      'sec-ch-ua-platform': platform,
      'x-csrf-token': csrfToken,
      'content-type': 'application/json'
    }
  }

  it('permite a visitantes consultar la lista y el detalle publicados', async () => {
    const list = await app.handle(new Request('http://localhost/api/v1/blog?page=1&pageSize=12'))
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({ items: [{ slug: 'experiencias-acs', status: 'PUBLICADO' }], pagination: { total: 1 } })
    expect(blogRepoMocks.list).toHaveBeenCalledWith(expect.objectContaining({ publishedOnly: true, page: 1, pageSize: 12 }))

    const detail = await app.handle(new Request('http://localhost/api/v1/blog/experiencias-acs'))
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({ title: 'Experiencias ACS', content: post.content })
  })

  it.each([
    ['visitante', undefined],
    ['estudiante', { cookie: 'aequvg_student_session=student-test; aequvg_student_device=device-test' }]
  ])('deniega la administración a %s', async (_profile, headers) => {
    const response = await app.handle(new Request('http://localhost/api/v1/admin/blog', { headers }))
    expect(response.status).toBe(401)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')
    expect(blogRepoMocks.list).not.toHaveBeenCalled()
  })

  it('deniega consulta y creación a una sesión administrativa sin BLOG_MANAGE', async () => {
    const headers = adminHeaders(['NEWS_MANAGE'])
    const list = await app.handle(new Request('http://localhost/api/v1/admin/blog', { headers }))
    expect(list.status).toBe(403)
    expect((await list.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN')

    const create = await app.handle(new Request('http://localhost/api/v1/admin/blog', {
      method: 'POST', headers, body: JSON.stringify({ title: 'Entrada ACS', summary: 'Resumen para la prueba.', content: 'Contenido de entrada con más de veinte caracteres.' })
    }))
    expect(create.status).toBe(403)
    expect(blogRepoMocks.create).not.toHaveBeenCalled()
  })

  it('permite que una sesión con BLOG_MANAGE consulte entradas en cualquier estado', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/admin/blog', { headers: adminHeaders(['BLOG_MANAGE']) }))
    expect(response.status).toBe(200)
    expect(blogRepoMocks.list).toHaveBeenCalledWith(expect.objectContaining({ publishedOnly: false }))
    expect(await response.json()).toMatchObject({ items: [{ id: 7, status: 'PUBLICADO' }] })
  })

  it('documenta rutas públicas y seguridad administrativa ACS en OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi/json'))
    const document = await response.json() as {
      paths: Record<string, Record<string, { responses: Record<string, unknown>; security?: Array<Record<string, string[]>> }>>
      tags: Array<{ name: string }>
    }
    expect(document.tags.some(tag => tag.name === 'Blog ACS')).toBe(true)
    expect(document.paths['/api/v1/blog']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/blog/{slug}']?.get?.responses['404']).toBeTruthy()
    expect(document.paths['/api/v1/blog/{slug}/image']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/blog/{slug}/images/{id}']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/admin/blog']?.get?.security).toEqual([{ cookieAuth: [] }])
    expect(document.paths['/api/v1/admin/blog']?.post?.security).toEqual([{ cookieAuth: [], csrfToken: [] }])
    expect(document.paths['/api/v1/admin/blog/{id}']?.put?.responses['422']).toBeTruthy()
    expect(document.paths['/api/v1/admin/blog/images']?.post?.security).toEqual([{ cookieAuth: [], csrfToken: [] }])
    expect(document.paths['/api/v1/admin/blog/{id}/archive']?.patch?.responses['200']).toBeTruthy()
  })
})
