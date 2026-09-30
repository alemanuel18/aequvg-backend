import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { hashPassword } from '../../src/shared/utils/auth-crypto'

const describeDatabase = process.env.AUTH_DATABASE_TEST === 'true' ? describe : describe.skip
const runId = `auth-test-${Date.now()}`
const email = `${runId}@uvg.edu.gt`
const password = 'Clave-integracion-123!'
const userAgent = 'AEQUVG-Auth-Integration/1.0'
let roleId = 0
let userId = 0
let createdUserId = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)

describeDatabase('autenticación y RBAC con PostgreSQL', () => {
  const app = createApp()
  let cookieHeader = ''
  let csrfToken = ''

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.COOKIE_SECURE = 'false'
    process.env.SESSION_SECRET = 'integration-auth-secret-with-at-least-32-characters'
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal de autenticación.' } })
    roleId = role.id
    for (const code of ['ADMIN_ACCESS', 'USERS_MANAGE', 'ROLES_READ']) {
      const permission = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: `Permiso ${code}.` } })
      await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } })
    }
    const user = await prisma.administrativeUser.create({ data: { roleId, name: 'Administradora de integración', email } })
    userId = user.id
    await prisma.administrativeCredential.create({ data: { userId, passwordHash: await hashPassword(password) } })
  })

  afterAll(async () => {
    await prisma.administrativeCredential.deleteMany({ where: { userId: { in: [userId, createdUserId].filter(Boolean) } } })
    await prisma.administrativeUser.deleteMany({ where: { id: { in: [userId, createdUserId].filter(Boolean) } } })
    await prisma.rolePermission.deleteMany({ where: { roleId } })
    if (roleId) await prisma.role.delete({ where: { id: roleId } })
    await prisma.$disconnect()
  })

  it('inicia sesión local y consulta la identidad vigente', async () => {
    const response = await app.handle(request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': userAgent },
      body: JSON.stringify({ email: email.toUpperCase(), password })
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as { csrfToken: string; user: { id: number; role: string } }
    expect(body.user).toMatchObject({ id: userId, role: `${runId}-role` })
    csrfToken = body.csrfToken
    const setCookie = response.headers.get('set-cookie') ?? ''
    const sessionCookie = setCookie.match(/aequvg_session=[^;]+/)?.[0]
    const deviceCookie = setCookie.match(/aequvg_device=[^;]+/)?.[0]
    expect(sessionCookie).toBeTruthy()
    expect(deviceCookie).toBeTruthy()
    cookieHeader = `${sessionCookie}; ${deviceCookie}`

    const me = await app.handle(request('/api/v1/auth/me', { headers: { cookie: cookieHeader, 'user-agent': userAgent } }))
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ user: expect.objectContaining({ id: userId, email }) })
  })

  it('exige CSRF y asigna un rol al crear una cuenta institucional', async () => {
    const payload = { name: 'Secretaria de integración', email: `${runId}-secretaria@uvg.edu.gt`, roleId, password: 'Otra-clave-segura-123!' }
    const withoutCsrf = await app.handle(request('/api/v1/admin/users', {
      method: 'POST', headers: { cookie: cookieHeader, 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify(payload)
    }))
    expect(withoutCsrf.status).toBe(403)
    expect((await withoutCsrf.json() as { error: { code: string } }).error.code).toBe('CSRF_TOKEN_INVALID')

    const created = await app.handle(request('/api/v1/admin/users', {
      method: 'POST',
      headers: { cookie: cookieHeader, 'content-type': 'application/json', 'user-agent': userAgent, 'x-csrf-token': csrfToken },
      body: JSON.stringify(payload)
    }))
    expect(created.status).toBe(201)
    const createdBody = await created.json() as { id: number; role: { id: number }; authenticationProviders: string[] }
    createdUserId = createdBody.id
    expect(createdBody.role.id).toBe(roleId)
    expect(createdBody.authenticationProviders).toContain('PASSWORD')
  })

  it('revoca una cookie reutilizada desde otro contexto de dispositivo', async () => {
    const copied = await app.handle(request('/api/v1/auth/me', {
      headers: { cookie: cookieHeader, 'user-agent': 'Navegador-robado/9.0' }
    }))
    expect(copied.status).toBe(401)
    expect((await copied.json() as { error: { code: string } }).error.code).toBe('SESSION_REVOKED')
    const session = await prisma.administrativeSession.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
    expect(session?.revokedAt).toBeTruthy()
    expect(session?.revocationReason).toBe('DEVICE_BINDING_MISMATCH')
  })
})
