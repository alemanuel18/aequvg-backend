import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { hashPassword } from '../../src/shared/utils/auth-crypto'

const describeDatabase = process.env.STUDENT_AUTH_DATABASE_TEST === 'true' ? describe : describe.skip
const runId = `student-auth-${Date.now()}`
const email = `${runId}@uvg.edu.gt`
const password = 'Clave-estudiante-123!'
const userAgent = 'AEQUVG-Student-Integration/1.0'
let idempotencyRequestId = 0
const request = (path: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers)
  if (options.method === 'PATCH' && path === '/api/v1/student-auth/me') {
    headers.set('idempotency-key', `${runId}-${++idempotencyRequestId}`)
  }
  return new Request(`http://localhost${path}`, { ...options, headers })
}

describeDatabase('acceso estudiantil separado con PostgreSQL', () => {
  const app = createApp()
  let userId = 0
  let otherStudentId = 0
  let interestedUserId = 0
  let deletionUserId = 0
  let deletionEventId = 0
  let selfDeletionUserId = 0
  const selfDeletionEventIds: number[] = []
  let adminId = 0
  let roleId = 0
  let restrictedRoleId = 0
  let restrictedAdminId = 0
  let studentCookies = ''
  let studentCsrf = ''
  let adminCookies = ''
  let adminCsrf = ''
  let restrictedAdminCookies = ''
  let restrictedAdminCsrf = ''

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.COOKIE_SECURE = 'false'
    process.env.SESSION_SECRET = 'integration-student-secret-with-32-characters'
    const role = await prisma.role.create({ data: { name: `${runId}-admin`, description: 'Rol aislado de integración.' } })
    roleId = role.id
    for (const code of ['ADMIN_ACCESS', 'USERS_MANAGE']) {
      const permission = await prisma.permission.upsert({ where: { code }, update: {}, create: { code, description: `Permiso ${code}.` } })
      await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } })
    }
    const admin = await prisma.administrativeUser.create({ data: { roleId, name: 'Admin de integración', email: `${runId}-admin@uvg.edu.gt` } })
    adminId = admin.id
    await prisma.administrativeCredential.create({ data: { userId: adminId, passwordHash: await hashPassword(password) } })

    const restrictedRole = await prisma.role.create({ data: { name: `${runId}-restricted`, description: 'Rol sin permiso para administrar cuentas.' } })
    restrictedRoleId = restrictedRole.id
    const restrictedAdmin = await prisma.administrativeUser.create({ data: { roleId: restrictedRoleId, name: 'Admin sin permiso', email: `${runId}-restricted@uvg.edu.gt` } })
    restrictedAdminId = restrictedAdmin.id
    await prisma.administrativeCredential.create({ data: { userId: restrictedAdminId, passwordHash: await hashPassword(password) } })
  })

  afterAll(async () => {
    if (userId) await prisma.studentAccountStatusHistory.deleteMany({ where: { studentId: userId } })
    if (userId) await prisma.studentSession.deleteMany({ where: { userId } })
    if (userId) await prisma.studentCredential.deleteMany({ where: { userId } })
    if (userId) await prisma.studentUser.deleteMany({ where: { id: userId } })
    if (otherStudentId) await prisma.studentUser.deleteMany({ where: { id: otherStudentId } })
    if (interestedUserId) await prisma.studentUser.deleteMany({ where: { id: interestedUserId } })
    if (deletionUserId) await prisma.studentAccountStatusHistory.deleteMany({ where: { studentId: deletionUserId } })
    if (deletionUserId) await prisma.studentSession.deleteMany({ where: { userId: deletionUserId } })
    if (deletionUserId) await prisma.studentCredential.deleteMany({ where: { userId: deletionUserId } })
    if (deletionUserId) await prisma.studentUser.deleteMany({ where: { id: deletionUserId } })
    if (deletionEventId) await prisma.eventRegistration.deleteMany({ where: { eventId: deletionEventId } })
    if (deletionEventId) await prisma.event.deleteMany({ where: { id: deletionEventId } })
    if (selfDeletionEventIds.length) await prisma.eventRegistration.deleteMany({ where: { eventId: { in: selfDeletionEventIds } } })
    if (selfDeletionEventIds.length) await prisma.event.deleteMany({ where: { id: { in: selfDeletionEventIds } } })
    if (selfDeletionUserId) await prisma.studentSession.deleteMany({ where: { userId: selfDeletionUserId } })
    if (selfDeletionUserId) await prisma.studentCredential.deleteMany({ where: { userId: selfDeletionUserId } })
    if (selfDeletionUserId) await prisma.studentAccountStatusHistory.deleteMany({ where: { studentId: selfDeletionUserId } })
    if (selfDeletionUserId) await prisma.studentUser.deleteMany({ where: { id: selfDeletionUserId } })
    if (adminId) await prisma.administrativeCredential.deleteMany({ where: { userId: adminId } })
    if (adminId) await prisma.administrativeUser.deleteMany({ where: { id: adminId } })
    if (restrictedAdminId) await prisma.administrativeCredential.deleteMany({ where: { userId: restrictedAdminId } })
    if (restrictedAdminId) await prisma.administrativeUser.deleteMany({ where: { id: restrictedAdminId } })
    if (roleId) await prisma.rolePermission.deleteMany({ where: { roleId } })
    if (roleId) await prisma.role.delete({ where: { id: roleId } })
    if (restrictedRoleId) await prisma.role.delete({ where: { id: restrictedRoleId } })
    await prisma.$disconnect()
  })

  it('mantiene la navegación pública y rechaza consultas anónimas de sesión', async () => {
    expect((await app.handle(request('/health'))).status).toBe(200)
    const response = await app.handle(request('/api/v1/student-auth/me'))
    expect(response.status).toBe(401)
  })

  it('rechaza correos externos, condición falsa, nombres ofensivos y campos de rol', async () => {
    const cases = [
      { firstNames: 'Estudiante', lastNames: 'UVG', email: `${runId}@example.com`, password, isStudent: true },
      { firstNames: 'Estudiante', lastNames: 'UVG', email: `${runId}-false@uvg.edu.gt`, password, isStudent: false },
      { firstNames: 'Nombre', lastNames: 'cerote', email: `${runId}-offensive@uvg.edu.gt`, password, isStudent: true },
      { firstNames: 'Estudiante', lastNames: 'UVG', email: `${runId}-role@uvg.edu.gt`, password, isStudent: true, role: 'ADMIN' }
    ]
    for (const body of cases) {
      const response = await app.handle(request('/api/v1/student-auth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      }))
      expect(response.status).toBe(422)
    }
  })

  it('registra una cuenta estudiantil en su tabla y evita duplicados', async () => {
    const payload = { firstNames: 'Estudiante', lastNames: 'de integración', email, password, isStudent: true }
    const created = await app.handle(request('/api/v1/student-auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    }))
    expect(created.status).toBe(201)
    const body = await created.json() as { id: number; name: string; firstNames: string; lastNames: string; role: string; isStudent: boolean }
    userId = body.id
    expect(body).toMatchObject({ name: 'Estudiante de integración', firstNames: 'Estudiante', lastNames: 'de integración', role: 'STUDENT', isStudent: true })
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({ firstNames: 'Estudiante', lastNames: 'de integración' })
    const credential = await prisma.studentCredential.findUnique({ where: { userId } })
    expect(credential?.passwordHash).toMatch(/^scrypt\$/)
    expect(credential?.passwordHash).not.toBe(password)
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
    const adminBody = await adminLogin.json() as { csrfToken: string }
    adminCsrf = adminBody.csrfToken
    const setCookie = adminLogin.headers.get('set-cookie') ?? ''
    adminCookies = `${setCookie.match(/aequvg_session=[^;]+/)?.[0]}; ${setCookie.match(/aequvg_device=[^;]+/)?.[0]}`

    const restrictedLogin = await app.handle(request('/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email: `${runId}-restricted@uvg.edu.gt`, password })
    }))
    expect(restrictedLogin.status).toBe(200)
    restrictedAdminCsrf = (await restrictedLogin.json() as { csrfToken: string }).csrfToken
    const restrictedSetCookie = restrictedLogin.headers.get('set-cookie') ?? ''
    restrictedAdminCookies = `${restrictedSetCookie.match(/aequvg_session=[^;]+/)?.[0]}; ${restrictedSetCookie.match(/aequvg_device=[^;]+/)?.[0]}`
  })

  it('administra solo cuentas normales y expone el historial de actor, motivo y transición', async () => {
    const headers = { cookie: adminCookies, 'user-agent': userAgent }
    const interested = await prisma.studentUser.create({ data: {
      name: 'Persona interesada', firstNames: 'Persona', lastNames: 'Interesada',
      email: `${runId}-interesada@example.net`, isStudent: false
    } })
    interestedUserId = interested.id
    const otherStudent = await prisma.studentUser.create({ data: {
      name: 'Estudiante alterno de integración', firstNames: 'Estudiante alterno', lastNames: 'de integración',
      email: `${runId}-alterno@uvg.edu.gt`, isStudent: true
    } })
    otherStudentId = otherStudent.id
    const interestedList = await app.handle(request('/api/v1/admin/student-users?type=INTERESADO&page=1&pageSize=10', { headers }))
    expect(await interestedList.json()).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: interestedUserId, isStudent: false })]) })
    const list = await app.handle(request('/api/v1/admin/student-users?q=integración&type=ESTUDIANTE&page=1&pageSize=10', { headers }))
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ id: userId, email }), expect.objectContaining({ id: otherStudentId })
    ]), pagination: { page: 1, pageSize: 10, total: 2 } })
    const firstPage = await app.handle(request('/api/v1/admin/student-users?q=integración&type=ESTUDIANTE&page=1&pageSize=1', { headers }))
    const secondPage = await app.handle(request('/api/v1/admin/student-users?q=integración&type=ESTUDIANTE&page=2&pageSize=1', { headers }))
    const firstPageBody = await firstPage.json() as { items: { id: number }[]; pagination: { total: number; page: number } }
    const secondPageBody = await secondPage.json() as { items: { id: number }[]; pagination: { total: number; page: number } }
    expect(firstPageBody.pagination).toMatchObject({ page: 1, total: 2 })
    expect(secondPageBody.pagination).toMatchObject({ page: 2, total: 2 })
    expect(firstPageBody.items[0]?.id).not.toBe(secondPageBody.items[0]?.id)

    const detail = await app.handle(request(`/api/v1/admin/student-users/${userId}`, { headers }))
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({ id: userId, isStudent: true, statusHistory: [] })

    const change = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, {
      method: 'PATCH', headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ status: 'BLOQUEADO_PERMANENTE', reviewChannel: 'revision@uvg.edu.gt', reason: 'Revisión administrativa pendiente' })
    }))
    expect(change.status).toBe(200)
    const blockedList = await app.handle(request('/api/v1/admin/student-users?status=BLOQUEADO_PERMANENTE&type=ESTUDIANTE&page=1&pageSize=10', { headers }))
    expect(await blockedList.json()).toMatchObject({ items: [expect.objectContaining({ id: userId, status: 'BLOQUEADO_PERMANENTE' })] })
    const updated = await app.handle(request(`/api/v1/admin/student-users/${userId}`, { headers }))
    expect(await updated.json()).toMatchObject({ statusHistory: [expect.objectContaining({ fromStatus: 'ACTIVO', toStatus: 'BLOQUEADO_PERMANENTE', reason: 'Revisión administrativa pendiente' })] })
    const history = await prisma.studentAccountStatusHistory.findFirst({ where: { studentId: userId } })
    expect(history).toMatchObject({ actorId: adminId, fromStatus: 'ACTIVO', toStatus: 'BLOQUEADO_PERMANENTE', reason: 'Revisión administrativa pendiente' })
    const activated = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, {
      method: 'PATCH', headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ status: 'ACTIVO', reason: 'Validación completada' })
    }))
    expect(activated.status).toBe(200)
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

    const profile = await app.handle(request('/api/v1/student-auth/me', {
      method: 'PATCH',
      headers: { cookie: studentCookies, 'user-agent': userAgent, 'x-csrf-token': studentCsrf, 'content-type': 'application/json' },
      body: JSON.stringify({ firstNames: 'Ana María', lastNames: 'de integración' })
    }))
    expect(profile.status).toBe(200)
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({
      name: 'Ana María de integración', firstNames: 'Ana María', lastNames: 'de integración'
    })

    const missingIdempotencyKey = await app.handle(new Request('http://localhost/api/v1/student-auth/me', {
      method: 'PATCH',
      headers: { cookie: studentCookies, 'user-agent': userAgent, 'x-csrf-token': studentCsrf, 'content-type': 'application/json' },
      body: JSON.stringify({ firstNames: 'Ana María', lastNames: 'de integración' })
    }))
    expect(missingIdempotencyKey.status).toBe(422)

    for (const protectedPayload of [
      { firstNames: 'No debe guardarse', lastNames: 'Cambio', id: userId + 1 },
      { firstNames: 'No debe guardarse', lastNames: 'Cambio', status: 'ACTIVO' },
      { firstNames: 'No debe guardarse', lastNames: 'Cambio', role: 'ADMIN' },
      { firstNames: 'No debe guardarse', lastNames: 'Cambio', isStudent: false }
    ]) {
      const rejected = await app.handle(request('/api/v1/student-auth/me', {
        method: 'PATCH',
        headers: { cookie: studentCookies, 'user-agent': userAgent, 'x-csrf-token': studentCsrf, 'content-type': 'application/json' },
        body: JSON.stringify(protectedPayload)
      }))
      expect(rejected.status).toBe(422)
      expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({
        name: 'Ana María de integración', firstNames: 'Ana María', lastNames: 'de integración', status: 'ACTIVO', isStudent: true
      })
    }

    const anonymousUpdate = await app.handle(request('/api/v1/student-auth/me', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstNames: 'Ajeno', lastNames: 'Cambio' })
    }))
    expect(anonymousUpdate.status).toBe(401)

    const logout = await app.handle(request('/api/v1/student-auth/logout', {
      method: 'POST', headers: { cookie: studentCookies, 'user-agent': userAgent, 'x-csrf-token': studentCsrf }
    }))
    expect(logout.status).toBe(204)
    const revoked = await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: studentCookies, 'user-agent': userAgent } }))
    expect(revoked.status).toBe(401)
  })

  it('protege listado, detalle, bloqueo, desbloqueo y baja frente a visitantes, estudiantes y administradores sin permiso', async () => {
    const login = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email, password })
    }))
    expect(login.status).toBe(200)
    studentCsrf = (await login.json() as { csrfToken: string }).csrfToken
    const studentSetCookie = login.headers.get('set-cookie') ?? ''
    studentCookies = `${studentSetCookie.match(/aequvg_student_session=[^;]+/)?.[0]}; ${studentSetCookie.match(/aequvg_student_device=[^;]+/)?.[0]}`
    const historyBefore = await prisma.studentAccountStatusHistory.count({ where: { studentId: userId } })

    const targets = [
      { method: 'GET', path: '/api/v1/admin/student-users' },
      { method: 'GET', path: `/api/v1/admin/student-users/${userId}` },
      { method: 'PATCH', path: `/api/v1/admin/student-users/${userId}/status`, body: { status: 'BLOQUEADO_PERMANENTE', reviewChannel: 'revision@uvg.edu.gt', reason: 'Intento no autorizado' } },
      { method: 'PATCH', path: `/api/v1/admin/student-users/${userId}/status`, body: { status: 'ACTIVO', reason: 'Intento de desbloqueo' } },
      { method: 'DELETE', path: `/api/v1/admin/student-users/${userId}`, body: { reason: 'Intento de baja no autorizado' } }
    ] as const
    const principals = [
      { cookie: '', csrf: '', expected: 401 },
      { cookie: studentCookies, csrf: studentCsrf, expected: 401 },
      { cookie: restrictedAdminCookies, csrf: restrictedAdminCsrf, expected: 403 }
    ]
    for (const principal of principals) {
      for (const target of targets) {
        const targetBody = 'body' in target ? target.body : undefined
        const response = await app.handle(request(target.path, {
          method: target.method,
          headers: {
            ...(principal.cookie ? { cookie: principal.cookie, 'user-agent': userAgent } : {}),
            ...(targetBody ? { 'content-type': 'application/json', 'x-csrf-token': principal.csrf } : {})
          },
          ...(targetBody ? { body: JSON.stringify(targetBody) } : {})
        }))
        expect(response.status, `${target.method} ${target.path}`).toBe(principal.expected)
      }
    }

    for (const body of [
      { status: 'BLOQUEADO_TEMPORAL', blockedUntil: new Date(Date.now() + 60_000).toISOString(), reason: 'Prueba de rol', role: 'ADMIN' },
      { status: 'ACTIVO', reason: 'Prueba de rol', isStudent: false },
      { status: 'ACTIVO', reason: 'Prueba de rol', roleId: roleId },
      { status: 'ACTIVO', reason: 'Prueba de rol', permissions: ['USERS_MANAGE'] }
    ]) {
      const response = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, {
        method: 'PATCH', headers: { cookie: adminCookies, 'user-agent': userAgent, 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
        body: JSON.stringify(body)
      }))
      expect(response.status).toBe(422)
    }
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({ status: 'ACTIVO', isStudent: true })
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId: userId } })).toBe(historyBefore)
  })

  it('revoca sesiones activas cuando moderación bloquea la cuenta', async () => {
    const login = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email, password })
    }))
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie') ?? ''
    const currentCookies = `${setCookie.match(/aequvg_student_session=[^;]+/)?.[0]}; ${setCookie.match(/aequvg_student_device=[^;]+/)?.[0]}`

    const blocked = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, {
      method: 'PATCH',
      headers: { cookie: adminCookies, 'content-type': 'application/json', 'user-agent': userAgent, 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ status: 'BLOQUEADO_PERMANENTE', reviewChannel: 'revision@uvg.edu.gt', reason: 'Incumplimiento documentado' })
    }))
    expect(blocked.status).toBe(200)
    expect((await blocked.json() as { role: string }).role).toBe('STUDENT')
    expect((await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: currentCookies, 'user-agent': userAgent } }))).status).toBe(401)
    const sessions = await prisma.studentSession.findMany({ where: { userId } })
    expect(sessions.filter(item => item.revocationReason === 'ACCOUNT_STATUS_CHANGED').length).toBeGreaterThan(0)

    const historyCount = await prisma.studentAccountStatusHistory.count({ where: { studentId: userId } })
    const duplicateBlock = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, {
      method: 'PATCH',
      headers: { cookie: adminCookies, 'content-type': 'application/json', 'user-agent': userAgent, 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ status: 'BLOQUEADO_PERMANENTE', reviewChannel: 'revision@uvg.edu.gt', reason: 'Incumplimiento documentado' })
    }))
    expect(duplicateBlock.status).toBe(200)
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId: userId } })).toBe(historyCount)

    const activated = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, {
      method: 'PATCH',
      headers: { cookie: adminCookies, 'content-type': 'application/json', 'user-agent': userAgent, 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ status: 'ACTIVO', reason: 'Revisión completada y bloqueo levantado' })
    }))
    expect(activated.status).toBe(200)
    expect((await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: currentCookies, 'user-agent': userAgent } }))).status).toBe(401)
  })

  it('aplica y retira un bloqueo temporal, revoca la sesión de inmediato y no duplica auditoría', async () => {
    const login = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email, password })
    }))
    expect(login.status).toBe(200)
    const loginBody = await login.json() as { csrfToken: string }
    const setCookie = login.headers.get('set-cookie') ?? ''
    const currentCookies = `${setCookie.match(/aequvg_student_session=[^;]+/)?.[0]}; ${setCookie.match(/aequvg_student_device=[^;]+/)?.[0]}`
    const blockedUntil = new Date(Date.now() + 60_000)
    const historyBefore = await prisma.studentAccountStatusHistory.count({ where: { studentId: userId } })
    const headers = { cookie: adminCookies, 'content-type': 'application/json', 'user-agent': userAgent, 'x-csrf-token': adminCsrf }
    const blockBody = { status: 'BLOQUEADO_TEMPORAL', blockedUntil: blockedUntil.toISOString(), reason: 'Falso positivo en revisión' }

    const blocked = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, { method: 'PATCH', headers, body: JSON.stringify(blockBody) }))
    expect(blocked.status).toBe(200)
    expect(await blocked.json()).toMatchObject({ status: 'BLOQUEADO_TEMPORAL', isStudent: true, role: 'STUDENT' })
    const blockHistory = await prisma.studentAccountStatusHistory.findFirst({ where: { studentId: userId }, orderBy: { id: 'desc' } })
    expect(blockHistory).toMatchObject({ actorId: adminId, fromStatus: 'ACTIVO', toStatus: 'BLOQUEADO_TEMPORAL', reason: 'Falso positivo en revisión', blockedUntil, createdAt: expect.any(Date) })
    expect((await prisma.studentSession.findMany({ where: { userId } })).filter(session => session.revocationReason === 'ACCOUNT_STATUS_CHANGED').length).toBeGreaterThan(0)
    expect((await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: currentCookies, 'user-agent': userAgent } }))).status).toBe(401)

    const repeatedBlock = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, { method: 'PATCH', headers, body: JSON.stringify(blockBody) }))
    expect(repeatedBlock.status).toBe(200)
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId: userId } })).toBe(historyBefore + 1)

    const unblockBody = { status: 'ACTIVO', reason: 'Se confirmó un falso positivo' }
    const unblocked = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, { method: 'PATCH', headers, body: JSON.stringify(unblockBody) }))
    expect(unblocked.status).toBe(200)
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({ status: 'ACTIVO', isStudent: true })
    const unblockHistory = await prisma.studentAccountStatusHistory.findFirst({ where: { studentId: userId }, orderBy: { id: 'desc' } })
    expect(unblockHistory).toMatchObject({ actorId: adminId, fromStatus: 'BLOQUEADO_TEMPORAL', toStatus: 'ACTIVO', reason: 'Se confirmó un falso positivo' })
    const unblockedHistoryCount = historyBefore + 2
    const repeatedUnblock = await app.handle(request(`/api/v1/admin/student-users/${userId}/status`, { method: 'PATCH', headers, body: JSON.stringify(unblockBody) }))
    expect(repeatedUnblock.status).toBe(200)
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId: userId } })).toBe(unblockedHistoryCount)
    expect((await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: currentCookies, 'user-agent': userAgent } }))).status).toBe(401)
    expect((await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent }, body: JSON.stringify({ email, password })
    }))).status).toBe(200)
    expect(loginBody.csrfToken).toBeTruthy()
  })

  it('da de baja cuentas normales por el flujo administrativo y revoca sesiones con auditoría', async () => {
    const deletionEmail = `${runId}-admin-delete@uvg.edu.gt`
    const created = await app.handle(request('/api/v1/student-auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstNames: 'Cuenta', lastNames: 'Baja', email: deletionEmail, password, isStudent: true })
    }))
    expect(created.status).toBe(201)
    deletionUserId = (await created.json() as { id: number }).id
    const event = await prisma.event.create({ data: {
      createdById: adminId, name: `${runId} evento preservado`, description: 'Registro para probar anonimización.',
      startsAt: new Date('2030-01-01T12:00:00.000Z'), location: 'UVG', maximumCapacity: 10
    } })
    deletionEventId = event.id
    await prisma.eventRegistration.create({ data: {
      eventId: event.id, studentId: deletionUserId, fullName: 'Cuenta Baja', firstNames: 'Cuenta', lastNames: 'Baja', email: deletionEmail, phone: '+502 5555 1234',
      consentedAt: new Date(), privacyVersion: 'test-policy-v1'
    } })
    const comment = await prisma.publicationComment.create({ data: {
      studentId: deletionUserId, targetType: 'EVENTO', eventId: event.id,
      content: 'Comentario que debe conservarse sin identificar a su autor.',
      dedupeHash: createHash('sha256').update(`${runId}-comment`).digest('hex')
    } })
    await prisma.publicationCommentRevision.create({ data: {
      commentId: comment.id, actorStudentId: deletionUserId, action: 'EDIT',
      previousContent: 'Comentario original conservado.', nextContent: 'Comentario que debe conservarse sin identificar a su autor.'
    } })
    const login = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': userAgent },
      body: JSON.stringify({ email: deletionEmail, password })
    }))
    expect(login.status).toBe(200)

    const deletion = await app.handle(request(`/api/v1/admin/student-users/${deletionUserId}`, {
      method: 'DELETE', headers: { cookie: adminCookies, 'user-agent': userAgent, 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ reason: 'Solicitud administrativa documentada' })
    }))
    expect(deletion.status).toBe(200)
    expect(await deletion.json()).toMatchObject({ id: deletionUserId, status: 'ELIMINADO' })
    const history = await prisma.studentAccountStatusHistory.findFirst({ where: { studentId: deletionUserId } })
    expect(history).toMatchObject({ actorId: adminId, fromStatus: 'ACTIVO', toStatus: 'ELIMINADO', reason: 'Solicitud administrativa documentada' })
    expect(await prisma.studentUser.findUnique({ where: { id: deletionUserId } })).toMatchObject({
      name: 'Usuario anónimo', firstNames: 'Usuario', lastNames: 'anónimo',
      email: `usuario-anonimo-${deletionUserId}@anonimo.invalid`, status: 'ELIMINADO'
    })
    expect(await prisma.studentUser.findUnique({ where: { email: deletionEmail } })).toBeNull()
    expect(await prisma.studentCredential.findUnique({ where: { userId: deletionUserId } })).toBeNull()
    const preservedRegistration = await prisma.eventRegistration.findFirst({ where: { eventId: deletionEventId } })
    expect(preservedRegistration).toMatchObject({ studentId: deletionUserId, fullName: 'Usuario anónimo', firstNames: 'Usuario', lastNames: 'anónimo', email: expect.stringMatching(/^usuario-anonimo-inscripcion-\d+@anonimo\.invalid$/), phone: '0000000000' })
    expect(await prisma.event.count({ where: { id: deletionEventId, maximumCapacity: 10 } })).toBe(1)
    expect(await prisma.eventRegistration.count({ where: { eventId: deletionEventId } })).toBe(1)
    expect(await prisma.eventRegistration.count({ where: { eventId: deletionEventId, email: deletionEmail } })).toBe(0)
    expect(await prisma.publicationComment.findUnique({ where: { id: comment.id } })).toMatchObject({
      studentId: null, eventId: deletionEventId, content: 'Comentario que debe conservarse sin identificar a su autor.', deletedAt: null
    })
    expect(await prisma.publicationCommentRevision.findFirst({ where: { commentId: comment.id } })).toMatchObject({
      actorStudentId: null, previousContent: 'Comentario original conservado.'
    })
    expect((await prisma.studentSession.findMany({ where: { userId: deletionUserId } })).every(session => session.revocationReason === 'ACCOUNT_DELETED')).toBe(true)

    const duplicateDeletion = await app.handle(request(`/api/v1/admin/student-users/${deletionUserId}`, {
      method: 'DELETE', headers: { cookie: adminCookies, 'user-agent': userAgent, 'content-type': 'application/json', 'x-csrf-token': adminCsrf },
      body: JSON.stringify({ reason: 'Solicitud administrativa documentada' })
    }))
    expect(duplicateDeletion.status).toBe(409)
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId: deletionUserId } })).toBe(1)
    expect(await prisma.publicationComment.count({ where: { eventId: deletionEventId } })).toBe(1)
    expect(await prisma.eventRegistration.count({ where: { eventId: deletionEventId } })).toBe(1)
    expect(await prisma.event.count({ where: { id: deletionEventId, maximumCapacity: 10 } })).toBe(1)
  })

  it('expone fecha o canal según el tipo de bloqueo y rechaza la baja sin sesión válida', async () => {
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
    const selfUnlock = await app.handle(request('/api/v1/student-auth/me', {
      method: 'PATCH', headers: { cookie: studentCookies, 'user-agent': userAgent, 'x-csrf-token': studentCsrf, 'content-type': 'application/json' },
      body: JSON.stringify({ firstNames: 'Estudiante', lastNames: 'de integración', status: 'ACTIVO' })
    }))
    expect(selfUnlock.status).toBe(422)
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({ status: 'BLOQUEADO_PERMANENTE', isStudent: true })

    const deletion = await app.handle(request('/api/v1/student-auth/account', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, confirm: true })
    }))
    expect(deletion.status).toBe(401)
    expect(await prisma.studentUser.findUnique({ where: { id: userId } })).toMatchObject({ status: 'BLOQUEADO_PERMANENTE', deletedAt: null })

    const deletedLogin = await app.handle(request('/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
    }))
    expect(deletedLogin.status).toBe(403)
  })

  it('da de baja la cuenta propia por identidad autenticada, conserva actividad y revoca todas las sesiones', async () => {
    const selfEmail = `${runId}-self-delete@uvg.edu.gt`
    const created = await app.handle(request('/api/v1/student-auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstNames: 'Baja', lastNames: 'Propia', email: selfEmail, password, isStudent: true })
    }))
    selfDeletionUserId = (await created.json() as { id: number }).id
    const event = await prisma.event.create({ data: { createdById: adminId, name: `${runId} self-delete`, description: 'Actividad conservada.', startsAt: new Date('2030-02-01T12:00:00.000Z'), location: 'UVG', maximumCapacity: 10 } })
    selfDeletionEventIds.push(event.id)
    const legacyEvent = await prisma.event.create({ data: { createdById: adminId, name: `${runId} legacy`, description: 'Legacy sin propietario.', startsAt: new Date('2030-02-02T12:00:00.000Z'), location: 'UVG', maximumCapacity: 10 } })
    selfDeletionEventIds.push(legacyEvent.id)
    const otherEvent = await prisma.event.create({ data: { createdById: adminId, name: `${runId} other`, description: 'Otra identidad.', startsAt: new Date('2030-02-03T12:00:00.000Z'), location: 'UVG', maximumCapacity: 10 } })
    selfDeletionEventIds.push(otherEvent.id)
    const snapshot = { fullName: 'Baja Propia', firstNames: 'Baja', lastNames: 'Propia', email: selfEmail, phone: '+502 5555 1212', consentedAt: new Date(), privacyVersion: 'test-policy-v1' }
    await prisma.eventRegistration.create({ data: { eventId: event.id, studentId: selfDeletionUserId, ...snapshot } })
    const legacy = await prisma.eventRegistration.create({ data: { eventId: legacyEvent.id, ...snapshot } })
    const other = await prisma.eventRegistration.create({ data: { eventId: otherEvent.id, studentId: otherStudentId, ...snapshot } })
    const loginOne = await app.handle(request('/api/v1/student-auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': `${userAgent}/one` }, body: JSON.stringify({ email: selfEmail, password }) }))
    const loginTwo = await app.handle(request('/api/v1/student-auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': `${userAgent}/two` }, body: JSON.stringify({ email: selfEmail, password }) }))
    const csrfOne = (await loginOne.json() as { csrfToken: string }).csrfToken
    const cookiesOneRaw = loginOne.headers.get('set-cookie') ?? ''
    const cookiesOne = `${cookiesOneRaw.match(/aequvg_student_session=[^;]+/)?.[0]}; ${cookiesOneRaw.match(/aequvg_student_device=[^;]+/)?.[0]}`
    const cookiesTwoRaw = loginTwo.headers.get('set-cookie') ?? ''
    const cookiesTwo = `${cookiesTwoRaw.match(/aequvg_student_session=[^;]+/)?.[0]}; ${cookiesTwoRaw.match(/aequvg_student_device=[^;]+/)?.[0]}`

    const noSession = await app.handle(request('/api/v1/student-auth/account', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: selfEmail, password, confirm: true }) }))
    expect(noSession.status).toBe(401)
    const invalidCsrf = await app.handle(request('/api/v1/student-auth/account', { method: 'DELETE', headers: { cookie: cookiesOne, 'user-agent': `${userAgent}/one`, 'content-type': 'application/json', 'x-csrf-token': 'invalid' }, body: JSON.stringify({ email: selfEmail, password, confirm: true }) }))
    expect(invalidCsrf.status).toBe(403)
    const deletion = await app.handle(request('/api/v1/student-auth/account', { method: 'DELETE', headers: { cookie: cookiesOne, 'user-agent': `${userAgent}/one`, 'content-type': 'application/json', 'x-csrf-token': csrfOne }, body: JSON.stringify({ email: selfEmail, password, confirm: true }) }))
    expect(deletion.status).toBe(204)
    expect(deletion.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await app.handle(request('/api/v1/student-auth/me', { headers: { cookie: cookiesTwo, 'user-agent': `${userAgent}/two` } }))).status).toBe(401)
    expect(await prisma.studentUser.findUnique({ where: { id: selfDeletionUserId } })).toMatchObject({ status: 'ELIMINADO', name: 'Usuario anónimo', firstNames: 'Usuario', lastNames: 'anónimo', email: `usuario-anonimo-${selfDeletionUserId}@anonimo.invalid` })
    expect(await prisma.studentCredential.findUnique({ where: { userId: selfDeletionUserId } })).toBeNull()
    expect(await prisma.eventRegistration.findUnique({ where: { id: (await prisma.eventRegistration.findFirstOrThrow({ where: { eventId: event.id } })).id } })).toMatchObject({ studentId: selfDeletionUserId, fullName: 'Usuario anónimo', firstNames: 'Usuario', lastNames: 'anónimo', phone: '0000000000', status: 'CONFIRMADA', registeredAt: expect.any(Date), consentedAt: expect.any(Date), privacyVersion: 'test-policy-v1' })
    expect(await prisma.eventRegistration.findUnique({ where: { id: legacy.id } })).toMatchObject({ email: selfEmail, fullName: 'Baja Propia' })
    expect(await prisma.eventRegistration.findUnique({ where: { id: other.id } })).toMatchObject({ email: selfEmail, fullName: 'Baja Propia', studentId: otherStudentId })
  })
})
