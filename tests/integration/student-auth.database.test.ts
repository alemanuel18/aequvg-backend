import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { hashPassword } from '../../src/shared/utils/auth-crypto'

const describeDatabase = process.env.STUDENT_AUTH_DATABASE_TEST === 'true' ? describe : describe.skip
const runId = `student-auth-${Date.now()}`
const email = `${runId}@uvg.edu.gt`
const password = 'Clave-estudiante-123!'
const userAgent = 'AEQUVG-Student-Integration/1.0'
const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)

describeDatabase('acceso estudiantil separado con PostgreSQL', () => {
  const app = createApp()
  let userId = 0
  let adminId = 0
  let roleId = 0
  let studentCookies = ''
  let studentCsrf = ''

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.COOKIE_SECURE = 'false'
    process.env.SESSION_SECRET = 'integration-student-secret-with-32-characters'
    const role = await prisma.role.create({ data: { name: `${runId}-admin`, description: 'Rol aislado de integración.' } })
    roleId = role.id
    const permission = await prisma.permission.upsert({ where: { code: 'ADMIN_ACCESS' }, update: {}, create: { code: 'ADMIN_ACCESS', description: 'Acceso administrativo.' } })
    await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } })
    const admin = await prisma.administrativeUser.create({ data: { roleId, name: 'Admin de integración', email: `${runId}-admin@uvg.edu.gt` } })
    adminId = admin.id
    await prisma.administrativeCredential.create({ data: { userId: adminId, passwordHash: await hashPassword(password) } })
  })

  afterAll(async () => {
    if (userId) await prisma.studentSession.deleteMany({ where: { userId } })
    if (userId) await prisma.studentCredential.deleteMany({ where: { userId } })
    if (userId) await prisma.studentUser.deleteMany({ where: { id: userId } })
    if (adminId) await prisma.administrativeCredential.deleteMany({ where: { userId: adminId } })
    if (adminId) await prisma.administrativeUser.deleteMany({ where: { id: adminId } })
    if (roleId) await prisma.rolePermission.deleteMany({ where: { roleId } })
    if (roleId) await prisma.role.delete({ where: { id: roleId } })
    await prisma.$disconnect()
  })

  it('mantiene la navegación pública y rechaza consultas anónimas de sesión', async () => {
    expect((await app.handle(request('/health'))).status).toBe(200)
    const response = await app.handle(request('/api/v1/student-auth/me'))
    expect(response.status).toBe(401)
  })

  it('rechaza correos externos, condición falsa, nombres ofensivos y campos de rol', async () => {
    const cases = [
      { name: 'Estudiante UVG', email: `${runId}@example.com`, password, isStudent: true },
      { name: 'Estudiante UVG', email, password, isStudent: false },
      { name: 'Nombre cerote', email, password, isStudent: true },
      { name: 'Estudiante UVG', email, password, isStudent: true, role: 'ADMIN' }
    ]
    for (const body of cases) {
      const response = await app.handle(request('/api/v1/student-auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      }))
      expect(response.status).toBe(422)
    }
  })

  it('registra una cuenta estudiantil en su tabla y evita duplicados', async () => {
    const payload = { name: 'Estudiante de integración', email, password, isStudent: true }
    const created = await app.handle(request('/api/v1/student-auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    }))
    expect(created.status).toBe(201)
    const body = await created.json() as { id: number; role: string; isStudent: boolean }
    userId = body.id
    expect(body).toMatchObject({ role: 'STUDENT', isStudent: true })
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toBeTruthy()
    expect(await prisma.administrativeUser.findUnique({ where: { email } })).toBeNull()

    const duplicate = await app.handle(request('/api/v1/student-auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    }))
    expect(duplicate.status).toBe(409)
  })

  it('impide usar una cuenta estudiantil en el login administrativo y viceversa', async () => {
    const studentAsAdmin = await app.handle(request('/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email, password })
    }))
    expect(studentAsAdmin.status).toBe(401)

    const adminAsStudent = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email: `${runId}-admin@uvg.edu.gt`, password })
    }))
    expect(adminAsStudent.status).toBe(401)

    const adminLogin = await app.handle(request('/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email: `${runId}-admin@uvg.edu.gt`, password })
    }))
    expect(adminLogin.status).toBe(200)
  })

  it('inicia, recarga y cierra una sesión estudiantil revocándola', async () => {
    const login = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email, password })
    }))
    expect(login.status).toBe(200)
    const body = await login.json() as { csrfToken: string }
    studentCsrf = body.csrfToken
    const setCookie = login.headers.get('set-cookie') ?? ''
    const authCookie = setCookie.match(/aequvg_student_session=[^;]+/)?.[0]
    const deviceCookie = setCookie.match(/aequvg_student_device=[^;]+/)?.[0]
    expect(authCookie).toBeTruthy()
    expect(deviceCookie).toBeTruthy()
    studentCookies = `${authCookie}; ${deviceCookie}`

    const me = await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: studentCookies, 'user-agent': userAgent } }))
    expect(me.status).toBe(200)

    const logout = await app.handle(request('/api/v1/student-auth/logout', {
      method: 'POST', headers: { cookie: studentCookies, 'user-agent': userAgent, 'x-csrf-token': studentCsrf }
    }))
    expect(logout.status).toBe(204)
    const revoked = await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: studentCookies, 'user-agent': userAgent } }))
    expect(revoked.status).toBe(401)
  })

  it('expone fecha o canal según el tipo de bloqueo y permite la baja bloqueada', async () => {
    const blockedUntil = new Date(Date.now() + 60_000)
    await prisma.studentUser.update({ where: { id: userId }, data: { status: 'BLOQUEADO_TEMPORAL', blockedUntil } })
    const temporary = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
    }))
    expect(temporary.status).toBe(403)
    expect(await temporary.json()).toMatchObject({ error: { code: 'ACCOUNT_TEMPORARILY_BLOCKED', details: { blockedUntil: blockedUntil.toISOString() } } })

    await prisma.studentUser.update({ where: { id: userId }, data: { status: 'BLOQUEADO_PERMANENTE', blockedUntil: null, reviewChannel: 'revision@uvg.edu.gt' } })
    const permanent = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
    }))
    expect(permanent.status).toBe(403)
    expect(await permanent.json()).toMatchObject({ error: { code: 'ACCOUNT_PERMANENTLY_BLOCKED', details: { reviewChannel: 'revision@uvg.edu.gt' } } })

    const deletion = await app.handle(request('/api/v1/student-auth/account', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, confirm: true })
    }))
    expect(deletion.status).toBe(204)
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({ status: 'ELIMINADO', deletedAt: expect.any(Date) })

    const deletedLogin = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
    }))
    expect(deletedLogin.status).toBe(403)
  })
})
