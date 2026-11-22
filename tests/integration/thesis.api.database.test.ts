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
const createdAuthorPersonIds: number[] = []
let migratedThesisSnapshots: Array<{ id: number; author: string | null }> = []
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
  title: `${runId} tesis de Química`,
  author: 'Autor de integración',
  publicationYear: 2026,
  summary: 'Resumen temporal para validar el flujo completo sin almacenar documentos.',
  url: uniqueUrl(),
  publishedAt: new Date().toISOString(),
  ...overrides
})

describeDatabase('permisos y flujo de tesis con PostgreSQL', () => {
  beforeEach(() => clearRateLimitsForTests())

  beforeAll(async () => {
    migratedThesisSnapshots = await prisma.thesisLink.findMany({ select: { id: true, author: true } })
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
      if (boardAdminId) await prisma.thesisLink.deleteMany({ where: { createdById: boardAdminId } })
      if (limitedAdminId) await prisma.thesisLink.deleteMany({ where: { createdById: limitedAdminId } })
      if (createdAuthorPersonIds.length) await prisma.authorPerson.deleteMany({ where: { id: { in: createdAuthorPersonIds } } })
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

  it('conserva en la migración cada autor legado como autor principal', async () => {
    for (const snapshot of migratedThesisSnapshots) {
      const thesis = await prisma.thesisLink.findUnique({
        where: { id: snapshot.id },
        select: { author: true, contributors: { select: { role: true, authorOrder: true, person: { select: { name: true } } } } }
      })
      expect(thesis).not.toBeNull()
      expect(thesis?.contributors).toHaveLength(1)
      expect(thesis?.contributors[0]).toMatchObject({ role: 'PRINCIPAL', authorOrder: 1, person: { name: snapshot.author } })
      expect(thesis?.author).toBe(snapshot.author)
    }
  })

  it('publica, consulta, edita y retira solo el registro local', async () => {
    const sourceUrl = uniqueUrl()
    const createdResponse = await app.handle(request('/api/v1/admin/theses', {
      method: 'POST', headers: boardHeaders,
      body: JSON.stringify(thesisPayload({ url: sourceUrl }))
    }))
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: number; title: string; url: string; publishedAt: string | null; createdById: number }
    createdThesisIds.push(created.id)
    expect(created).toMatchObject({ title: `${runId} tesis de Química`, url: sourceUrl, createdById: boardAdminId })
    expect(created).not.toHaveProperty('sourceIdentifier')
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
    expect(await prisma.thesisContributor.count({ where: { thesisId: created.id } })).toBe(0)
    expect((await app.handle(request(`/api/v1/theses/${created.id}`))).status).toBe(404)
    const emptySearch = await app.handle(request(`/api/v1/theses?q=${encodeURIComponent(runId)}`))
    expect(await emptySearch.json()).toMatchObject({ items: [], pagination: { total: 0, totalPages: 0 } })
    expect(sourceUrl).toContain('repositorio.uvg.edu.gt/handle/')
  })

  it('rechaza URL vacía, mal formada o que no use HTTPS, y reporta URLs duplicadas', async () => {
    const blankUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: '' })) }))
    expect(blankUrl.status).toBe(422)

    const malformedUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: 'not a URL' })) }))
    expect(malformedUrl.status).toBe(422)

    const insecureUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: 'ftp://repositorio.uvg.edu.gt/tesis.pdf' })) }))
    expect(insecureUrl.status).toBe(422)
    expect((await insecureUrl.json()).error.code).toBe('INVALID_THESIS_URL')

    const httpUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: 'http://repositorio.uvg.edu.gt/tesis.pdf' })) }))
    expect(httpUrl.status).toBe(422)
    expect((await httpUrl.json()).error.code).toBe('INVALID_THESIS_URL')

    const duplicateUrl = uniqueUrl()
    const first = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: duplicateUrl })) }))
    expect(first.status).toBe(201)
    const firstRecord = await first.json() as { id: number }
    createdThesisIds.push(firstRecord.id)
    const repeatedUrl = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: duplicateUrl })) }))
    expect(repeatedUrl.status).toBe(409)
    expect((await repeatedUrl.json()).error.code).toBe('THESIS_LINK_EXISTS')

  })

  it('exige autor en la API y evita duplicados tras normalizar espacio, esquema y host', async () => {
    const withRemovedIdentifier: Record<string, unknown> = thesisPayload({ url: uniqueUrl() })
    withRemovedIdentifier.sourceIdentifier = `${runId}-removed-identifier`
    const ignoredIdentifierResponse = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(withRemovedIdentifier) }))
    expect(ignoredIdentifierResponse.status).toBe(201)
    const ignoredIdentifierRecord = await ignoredIdentifierResponse.json() as { id: number }
    createdThesisIds.push(ignoredIdentifierRecord.id)
    expect(ignoredIdentifierRecord).not.toHaveProperty('sourceIdentifier')

    const withoutAuthor: Record<string, unknown> = thesisPayload({ url: uniqueUrl() })
    delete withoutAuthor.author
    const missingAuthor = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(withoutAuthor) }))
    expect(missingAuthor.status).toBe(422)

    const blankAuthor = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ author: '   ', url: uniqueUrl() })) }))
    expect(blankAuthor.status).toBe(422)
    expect((await blankAuthor.json()).error.code).toBe('THESIS_AUTHOR_REQUIRED')

    const withoutYear: Record<string, unknown> = thesisPayload({ url: uniqueUrl() })
    delete withoutYear.publicationYear
    expect((await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(withoutYear) }))).status).toBe(422)

    const withoutSummary: Record<string, unknown> = thesisPayload({ url: uniqueUrl() })
    delete withoutSummary.summary
    expect((await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(withoutSummary) }))).status).toBe(422)

    const blankSummary = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ summary: '   ', url: uniqueUrl() })) }))
    expect(blankSummary.status).toBe(422)
    expect((await blankSummary.json()).error.code).toBe('THESIS_SUMMARY_REQUIRED')

    const canonicalUrl = uniqueUrl()
    const normalizedVariant = `  ${canonicalUrl.replace('https://', 'HTTPS://').replace('repositorio.uvg.edu.gt', 'REPOSITORIO.UVG.EDU.GT')}  `
    const first = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: normalizedVariant })) }))
    expect(first.status).toBe(201)
    const firstRecord = await first.json() as { id: number; url: string }
    createdThesisIds.push(firstRecord.id)
    expect(firstRecord.url).toBe(canonicalUrl)

    const duplicate = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: canonicalUrl })) }))
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('THESIS_LINK_EXISTS')

    const second = await app.handle(request('/api/v1/admin/theses', { method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url: uniqueUrl() })) }))
    expect(second.status).toBe(201)
    const secondRecord = await second.json() as { id: number }
    createdThesisIds.push(secondRecord.id)
    const duplicateUpdate = await app.handle(request(`/api/v1/admin/theses/${secondRecord.id}`, { method: 'PUT', headers: boardHeaders, body: JSON.stringify({ url: normalizedVariant }) }))
    expect(duplicateUpdate.status).toBe(409)
    expect((await duplicateUpdate.json()).error.code).toBe('THESIS_LINK_EXISTS')

    const concurrentCanonicalUrl = uniqueUrl()
    const concurrentVariants = [
      `  ${concurrentCanonicalUrl.replace('https://', 'HTTPS://').replace('repositorio.uvg.edu.gt', 'REPOSITORIO.UVG.EDU.GT')}  `,
      concurrentCanonicalUrl
    ]
    const concurrentResponses = await Promise.all(concurrentVariants.map((url) => app.handle(request('/api/v1/admin/theses', {
      method: 'POST', headers: boardHeaders, body: JSON.stringify(thesisPayload({ url }))
    }))))
    expect(concurrentResponses.map((response) => response.status).sort()).toEqual([201, 409])
    const concurrentCreated = await Promise.all(concurrentResponses.filter((response) => response.status === 201).map((response) => response.json() as Promise<{ id: number }>))
    createdThesisIds.push(...concurrentCreated.map(({ id }) => id))
  })

  it('persiste autor principal y coautores en orden, permite reutilizar personas y los entrega en público', async () => {
    const { author: _legacyAuthor, ...basePayload } = thesisPayload()
    const createdResponse = await app.handle(request('/api/v1/admin/theses', {
      method: 'POST', headers: boardHeaders,
      body: JSON.stringify({
        ...basePayload,
        contributors: [
          { name: `${runId} Autor principal` },
          { name: `${runId} Zoe Coautor` },
          { name: `${runId} Ana Coautor` }
        ]
      })
    }))
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as {
      id: number; author: string; contributors: Array<{ personId: number; role: string; authorOrder: number; person: { id: number; name: string } }>
    }
    createdThesisIds.push(created.id)
    createdAuthorPersonIds.push(...created.contributors.map(({ personId }) => personId))
    expect(created.author).toBe(`${runId} Autor principal`)
    expect(created.contributors.map(({ person, role, authorOrder }) => ({ name: person.name, role, authorOrder }))).toEqual([
      { name: `${runId} Autor principal`, role: 'PRINCIPAL', authorOrder: 1 },
      { name: `${runId} Ana Coautor`, role: 'COAUTOR', authorOrder: 2 },
      { name: `${runId} Zoe Coautor`, role: 'COAUTOR', authorOrder: 3 }
    ])

    const duplicatePerson = await app.handle(request(`/api/v1/admin/theses/${created.id}`, {
      method: 'PUT', headers: boardHeaders,
      body: JSON.stringify({ contributors: [{ personId: created.contributors[0]!.personId }, { personId: created.contributors[0]!.personId }] })
    }))
    expect(duplicatePerson.status).toBe(422)
    expect((await duplicatePerson.json()).error.code).toBe('DUPLICATE_THESIS_AUTHOR')

    const updateResponse = await app.handle(request(`/api/v1/admin/theses/${created.id}`, {
      method: 'PUT', headers: boardHeaders,
      body: JSON.stringify({ contributors: [
        { personId: created.contributors[0]!.personId },
        { personId: created.contributors[2]!.personId },
        { personId: created.contributors[1]!.personId }
      ] })
    }))
    expect(updateResponse.status).toBe(200)
    const updated = await updateResponse.json() as typeof created
    expect(updated.contributors.map(({ personId, role, authorOrder }) => ({ personId, role, authorOrder }))).toEqual([
      { personId: created.contributors[0]!.personId, role: 'PRINCIPAL', authorOrder: 1 },
      { personId: created.contributors[1]!.personId, role: 'COAUTOR', authorOrder: 2 },
      { personId: created.contributors[2]!.personId, role: 'COAUTOR', authorOrder: 3 }
    ])

    const publicDetail = await app.handle(request(`/api/v1/theses/${created.id}`))
    expect(publicDetail.status).toBe(200)
    expect((await publicDetail.json()).contributors.map((item: { person: { name: string } }) => item.person.name)).toEqual([
      `${runId} Autor principal`, `${runId} Ana Coautor`, `${runId} Zoe Coautor`
    ])
    const authorLookup = await app.handle(request(`/api/v1/admin/thesis-authors?q=${encodeURIComponent(runId)}`, { headers: boardHeaders }))
    expect(authorLookup.status).toBe(200)
    expect((await authorLookup.json()).items).toHaveLength(3)

    const { author: _legacyAuthorAgain, ...secondPayload } = thesisPayload()
    const reusedPersonResponse = await app.handle(request('/api/v1/admin/theses', {
      method: 'POST', headers: boardHeaders,
      body: JSON.stringify({ ...secondPayload, contributors: [{ personId: created.contributors[2]!.personId }] })
    }))
    expect(reusedPersonResponse.status).toBe(201)
    const reusedThesis = await reusedPersonResponse.json() as { id: number; contributors: Array<{ personId: number }> }
    createdThesisIds.push(reusedThesis.id)
    expect(reusedThesis.contributors[0]?.personId).toBe(created.contributors[2]!.personId)
  })

  it('permite lectura pública a visitantes y estudiantes, y bloquea escrituras directas sin PAPERS_MANAGE', async () => {
    const payload = thesisPayload({ url: uniqueUrl() })
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
