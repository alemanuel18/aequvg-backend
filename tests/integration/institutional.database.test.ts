import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { createAdminSessionHeaders } from '../helpers/admin-session'

const runDatabaseTests = process.env.INSTITUTIONAL_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `institutional-test-${Date.now()}`
let roleId = 0
let authorId = 0
let blockId = 0
let adminHeaders: Record<string, string>

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)

describeDatabase('Regresión HTTP de anuncios institucionales con PostgreSQL', () => {
  beforeAll(async () => {
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para anuncios institucionales.' } })
    const author = await prisma.administrativeUser.create({ data: { roleId: role.id, name: 'Autor institucional de pruebas', email: `${runId}@uvg.edu.gt` } })
    roleId = role.id
    authorId = author.id
    adminHeaders = await createAdminSessionHeaders(prisma, author.id, role.id, ['INSTITUTIONAL_MANAGE'])
  })

  afterAll(async () => {
    if (blockId) await prisma.institutionalBlock.deleteMany({ where: { id: blockId } })
    await prisma.administrativeUser.deleteMany({ where: { id: authorId } })
    await prisma.rolePermission.deleteMany({ where: { roleId } })
    await prisma.role.deleteMany({ where: { id: roleId } })
    await prisma.$disconnect()
  })

  it('rechaza contenido vacío o imagen inválida sin persistir anuncios', async () => {
    const app = createApp()
    const empty = await app.handle(request('/api/v1/admin/institutional-content', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ type: 'LABORATORIO', title: '<p></p>', body: '<script>alert(1)</script>' })
    }))
    expect(empty.status).toBe(422)
    expect((await empty.json() as { error: { code: string } }).error.code).toBe('INVALID_INSTITUTIONAL_CONTENT')

    const invalidImage = await app.handle(request('/api/v1/admin/institutional-content', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ type: 'LABORATORIO', title: 'Anuncio inválido', body: 'Contenido válido', imageUrl: 'javascript:alert(1)' })
    }))
    expect(invalidImage.status).toBe(422)
    expect((await invalidImage.json() as { error: { code: string } }).error.code).toBe('INVALID_IMAGE_URL')
    expect(await prisma.institutionalBlock.count({ where: { title: { contains: 'inválido' } } })).toBe(0)
  })

  it('persiste un anuncio, lo refleja públicamente, actualiza y deja de exponerlo al archivarlo', async () => {
    const app = createApp()
    const created = await app.handle(request('/api/v1/admin/institutional-content', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        type: 'LABORATORIO',
        title: 'Anuncio de integración',
        body: 'Contenido público inicial del anuncio.',
        status: 'PUBLICADO'
      })
    }))
    expect(created.status).toBe(201)
    const createdBody = await created.json() as { id: number; status: string }
    blockId = createdBody.id
    expect(createdBody.status).toBe('PUBLICADO')

    const publicInitial = await app.handle(request('/api/v1/institutional-content'))
    expect(publicInitial.status).toBe(200)
    expect((await publicInitial.json() as Array<{ id: number; title: string }>).some(item => item.id === blockId && item.title === 'Anuncio de integración')).toBe(true)

    const updated = await app.handle(request(`/api/v1/admin/institutional-content/${blockId}`, {
      method: 'PUT', headers: adminHeaders,
      body: JSON.stringify({ type: 'LABORATORIO', title: 'Anuncio actualizado', body: 'Contenido público actualizado.', status: 'PUBLICADO' })
    }))
    expect(updated.status).toBe(200)
    expect((await updated.json() as { title: string }).title).toBe('Anuncio actualizado')

    const publicUpdated = await app.handle(request('/api/v1/institutional-content'))
    expect((await publicUpdated.json() as Array<{ id: number; title: string }>).some(item => item.id === blockId && item.title === 'Anuncio actualizado')).toBe(true)

    const archived = await app.handle(request(`/api/v1/admin/institutional-content/${blockId}`, { method: 'DELETE', headers: adminHeaders }))
    expect(archived.status).toBe(200)
    expect((await archived.json() as { status: string }).status).toBe('ARCHIVADO')

    const publicAfterArchive = await app.handle(request('/api/v1/institutional-content'))
    expect((await publicAfterArchive.json() as Array<{ id: number }>).some(item => item.id === blockId)).toBe(false)
  })
})
