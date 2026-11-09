import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { clearRateLimitsForTests } from '../../src/middleware/rate-limit'
import { prisma } from '../../src/shared/database/prisma'
import { createAdminSessionHeaders } from '../helpers/admin-session'
import { createStudentSessionHeaders } from '../helpers/student-session'

const runDatabaseTests = process.env.THESIS_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `thesis-test-${Date.now()}`
const app = createApp()
const createdThesisIds: number[] = []
let boardRoleId = 0
let limitedRoleId = 0
let boardAdminId = 0
let limitedAdminId = 0
let studentId = 0
let boardHeaders: Record<string, string>
let limitedHeaders: Record<string, string>
let studentHeaders: Record<string, string>
let thesisSequence = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const uniqueUrl = () => `https://repositorio.uvg.edu.gt/handle/${runId}-${++thesisSequence}`
const thesisPayload = (overrides: Record<string, unknown> = {}) => ({
  sourceIdentifier: `${runId}-${thesisSequence}`,
  title: `${runId} tesis de Química`,
  author: 'Autora de integración',
  publicationYear: 2026,
  summary: 'Resumen temporal para validar el flujo completo sin almacenar documentos.',
  url: uniqueUrl(),
  publishedAt: new Date().toISOString(),
  ...overrides
})

describeDatabase('permisos y flujo de tesis con PostgreSQL', () => {
  beforeEach(() => clearRateLimitsForTests())

  beforeAll(async () => {
    const boardRole = await prisma.role.create({ data: { name: `${runId}-junta`, description: 'Junta autorizada temporal para pruebas de tesis.' } })
    boardRoleId = boardRole.id
    const boardAdmin = await prisma.administrativeUser.create({ data: { roleId: boardRoleId, name: 'Junta de prueba', firstNames: 'Junta', lastNames: 'de prueba', email: `${runId}-board@uvg.edu.gt`, status: 'ACTIVO' } })
    boardAdminId = boardAdmin.id
    boardHeaders = await createAdminSessionHeaders(prisma, boardAdminId, boardRoleId, ['PAPERS_MANAGE'])

    const limitedRole = await prisma.role.create({ data: { name: `${runId}-sin-permiso`, description: 'Rol sin permisos de tesis para pruebas.' } })
    limitedRoleId = limitedRole.id
    const limitedAdmin = await prisma.administrativeUser.create({ data: { roleId: limitedRoleId, name: 'Cuenta limitada', firstNames: 'Cuenta', lastNames: 'limitada', email: `${runId}-limited@uvg.edu.gt`, status: 'ACTIVO' } })
    limitedAdminId = limitedAdmin.id
    limitedHeaders = await createAdminSessionHeaders(prisma, limitedAdminId, limitedRoleId, ['ADMIN_ACCESS'])

    const student = await prisma.studentUser.create({ data: { name: 'Estudiante de prueba', firstNames: 'Estudiante', lastNames: 'de prueba', email: `${runId}-student@uvg.edu.gt`, isStudent: true } })
    studentId = student.id
    studentHeaders = await createStudentSessionHeaders(prisma, studentId)
  })

  afterAll(async () => {
    try {
      if (createdThesisIds.length) await prisma.thesisLink.deleteMany({ where: { id: { in: createdThesisIds } } })
      if (boardAdminId) await prisma.administrativeSession.deleteMany({ where: { userId: boardAdminId } })
      if (limitedAdminId) await prisma.administrativeSession.deleteMany({ where: { userId: limitedAdminId } })
      if (studentId) await prisma.studentSession.deleteMany({ where: { userId: studentId } })
      if (boardAdminId) await prisma.administrativeUser.delete({ where: { id: boardAdminId } })
      if (limitedAdminId) await prisma.administrativeUser.delete({ where: { id: limitedAdminId } })
      if (studentId) await prisma.studentUser.delete({ where: { id: studentId } })
      if (boardRoleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId: boardRoleId } })
        await prisma.role.delete({ where: { id: boardRoleId } })
      }
      if (limitedRoleId) {
        await prisma.rolePermission.deleteMany({ where: { roleId: limitedRoleId } })
        await prisma.role.delete({ where: { id: limitedRoleId } })
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  it('publica, consulta, edita y retira solo el registro local', async () => {
    const sourceUrl = uniqueUrl()
    const createdResponse = await app.handle(request('/api/v1/admin/theses', {
      method: 'POST', headers: boardHeaders,
      body: JSON.stringify(thesisPayload({ url: sourceUrl, sourceIdentifier: `${runId}-full-flow` }))
    }))
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: number; title: string; url: string; publishedAt: string | null; createdById: number }
    createdThesisIds.push(created.id)
    expect(created).toMatchObject({ title: `${runId} tesis de Química`, url: sourceUrl, createdById: boardAdminId })
    expect(created.publishedAt).toBeTruthy()
    expect(created).not.toHaveProperty('fileId')

    const visitorList = await app.handle(request('/api/v1/theses'))
    expect(visitorList.status).toBe(200)
    expect((await visitorList.json()).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, url: sourceUrl })]))
    const studentDetail = await app.handle(request(`/api/v1/theses/${created.id}`, { headers: studentHeaders }))
    expect(studentDetail.status).toBe(200)
    expect(await studentDetail.json()).toMatchObject({ id: created.id, url: sourceUrl })

    const updateResponse = await app.handle(request(`/api/v1/admin/theses/${created.id}`, {
      method: 'PUT', headers: boardHeaders, body: JSON.stringify({ title: `${runId} tesis editada`, summary: 'Resumen editado para comprobar persistencia entre consultas.' })
    }))
    expect(updateResponse.status).toBe(200)
    const publicDetailAfterEdit = await app.handle(request(`/api/v1/theses/${created.id}`))
    expect(await publicDetailAfterEdit.json()).toMatchObject({ title: `${runId} tesis editada`, summary: 'Resumen editado para comprobar persistencia entre consultas.' })

    const deleteResponse = await app.handle(request(`/api/v1/admin/theses/${created.id}`, { method: 'DELETE', headers: boardHeaders }))
    expect(deleteResponse.status).toBe(200)
    expect(await prisma.thesisLink.findUnique({ where: { id: created.id } })).toBeNull()
    expect((await app.handle(request(`/api/v1/theses/${created.id}`))).status).toBe(404)
    const emptySearch = await app.handle(request(`/api/v1/theses?q=${encodeURIComponent(runId)}`))
    expect(await emptySearch.json()).toMatchObject({ items: [], pagination: { total: 0, totalPages: 0 } })
    expect(sourceUrl).toContain('repositorio.uvg.edu.gt/handle/')
  })

  it('rechaza URL vacía, mal formada e insegura, y reporta URL o identificadores duplicados', async () => {
    const blankUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: '' })) }))
    expect(blankUrl.status).toBe(422)

    const malformedUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: 'not a URL' })) }))
    expect(malformedUrl.status).toBe(422)

    const insecureUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: 'ftp://repositorio.uvg.edu.gt/tesis.pdf' })) }))
    expect(insecureUrl.status).toBe(422)
    expect((await insecureUrl.json()).error.code).toBe('INVALID_THESIS_URL')

    const duplicateUrl = uniqueUrl()
    const first = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: duplicateUrl, sourceIdentifier: `${runId}-duplicate-source-a` })) }))
    expect(first.status).toBe(201)
    const firstRecord = await first.json() as { id: number }
    createdThesisIds.push(firstRecord.id)
    const repeatedUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: duplicateUrl, sourceIdentifier: `${runId}-duplicate-source-b` })) }))
    expect(repeatedUrl.status).toBe(409)
    expect((await repeatedUrl.json()).error.code).toBe('THESIS_LINK_EXISTS')

    const repeatedSource = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ sourceIdentifier: `${runId}-duplicate-source-a` })) }))
    expect(repeatedSource.status).toBe(409)
    expect((await repeatedSource.json()).error.code).toBe('THESIS_LINK_EXISTS')
  })

  it('permite lectura pública a visitantes y estudiantes, y bloquea escrituras directas sin PAPERS_MANAGE', async () => {
    const payload = thesisPayload({ sourceIdentifier: `${runId}-permissions`, url: uniqueUrl() })
    const create = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(payload) }))
    expect(create.status).toBe(201)
    const thesis = await create.json() as { id: number }
    createdThesisIds.push(thesis.id)

    expect((await app.handle(request('/api/v1/theses'))).status).toBe(200)
    expect((await app.handle(request(`/api/v1/theses/${thesis.id}`, { headers: studentHeaders }))).status).toBe(200)

    expect((await app.handle(request('/api/v1/admin/theses'))).status).toBe(401)
    expect((await app.handle(request(`/api/v1/admin/theses/${thesis.id}`, { method: 'PUT', body: JSON.stringify({ title: 'Intento de visitante' }) }))).status).toBe(401)
    expect((await app.handle(request(`/api/v1/admin/theses/${thesis.id}`, { method: 'DELETE' }))).status).toBe(401)
    const publicWrite = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(thesisPayload()) }))
    expect(publicWrite.status).toBe(401)
    const studentWrite = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: studentHeaders, body: JSON.stringify(thesisPayload()) }))
    expect(studentWrite.status).toBe(401)
    expect((await app.handle(request(`/api/v1/admin/theses/${thesis.id}`, { method: 'PUT', headers: studentHeaders, body: JSON.stringify({ title: 'Intento no autorizado' }) }))).status).toBe(401)
    expect((await app.handle(request(`/api/v1/admin/theses/${thesis.id}`, { method: 'DELETE', headers: studentHeaders }))).status).toBe(401)

    expect((await app.handle(request('/api/v1/admin/theses', { headers: limitedHeaders }))).status).toBe(403)
    expect((await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: limitedHeaders, body: JSON.stringify(thesisPayload()) }))).status).toBe(403)
    expect((await app.handle(request(`/api/v1/admin/theses/${thesis.id}`, { method: 'PUT', headers: limitedHeaders, body: JSON.stringify({ title: 'Intento sin permiso' }) }))).status).toBe(403)
    expect((await app.handle(request(`/api/v1/admin/theses/${thesis.id}`, { method: 'DELETE', headers: limitedHeaders }))).status).toBe(403)
    expect(await prisma.thesisLink.findUnique({ where: { id: thesis.id } })).toMatchObject({ title: payload.title, url: payload.url })
  })
})
