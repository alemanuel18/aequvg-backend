import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'

const runDatabaseTests = process.env.RESOURCE_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `resource-api-test-${Date.now()}`
const adminKey = 'resource-integration-test-key'
let roleId = 0
let authorId = 0
let categoryId = 0
let inactiveCategoryId = 0
let fileId = 0
let resourceId = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const adminHeaders = { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' }
const bodyFor = (title: string, overrides: Record<string, unknown> = {}) => ({
  createdById: authorId,
  categoryId,
  fileId,
  title,
  description: `Descripción suficiente para ${title} en la integración de recursos.`,
  status: 'PUBLICADO',
  links: [{ label: 'Referencia', url: 'https://example.org/recurso', displayOrder: 1 }],
  ...overrides
})

describeDatabase('CRUD HTTP de recursos con PostgreSQL', () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = adminKey
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de recursos.' } })
    const author = await prisma.administrativeUser.create({ data: { roleId: role.id, name: 'Autor de recursos', email: `${runId}@uvg.edu.gt` } })
    const category = await prisma.resourceCategory.create({ data: { name: `${runId}-category` } })
    const inactiveCategory = await prisma.resourceCategory.create({ data: { name: `${runId}-inactive`, active: false } })
    const file = await prisma.file.create({ data: { uploadedById: author.id, originalName: 'guia.pdf', storageKey: `${runId}/guia.pdf`, mimeType: 'application/pdf', sizeBytes: BigInt(1024), sha256: 'a'.repeat(64) } })
    roleId = role.id
    authorId = author.id
    categoryId = category.id
    inactiveCategoryId = inactiveCategory.id
    fileId = file.id
  })

  afterAll(async () => {
    await prisma.resource.deleteMany({ where: { createdById: authorId } })
    await prisma.file.deleteMany({ where: { id: fileId } })
    await prisma.resourceCategory.deleteMany({ where: { id: { in: [categoryId, inactiveCategoryId] } } })
    await prisma.administrativeUser.deleteMany({ where: { id: authorId } })
    await prisma.role.deleteMany({ where: { id: roleId } })
    await prisma.$disconnect()
  })

  it('crea, consulta, actualiza, archiva y elimina un recurso', async () => {
    const app = createApp()
    const created = await app.handle(request('/api/v1/admin/resources', { method: 'POST', headers: adminHeaders, body: JSON.stringify(bodyFor('Guía de integración')) }))
    expect(created.status).toBe(201)
    const resource = await created.json() as { id: number; links: { url: string }[]; file: { mimeType: string } | null }
    resourceId = resource.id
    expect(resource.links[0]?.url).toBe('https://example.org/recurso')
    expect(resource.file?.mimeType).toBe('application/pdf')

    const listed = await app.handle(request('/api/v1/resources?q=integración&categoryId=' + categoryId))
    expect(listed.status).toBe(200)
    expect((await listed.json() as { items: { id: number }[] }).items.map(item => item.id)).toContain(resourceId)
    expect((await app.handle(request(`/api/v1/resources/${resourceId}`))).status).toBe(200)

    const updated = await app.handle(request(`/api/v1/admin/resources/${resourceId}`, {
      method: 'PUT', headers: adminHeaders,
      body: JSON.stringify({ description: 'Descripción actualizada para comprobar el reemplazo de enlaces.', links: [{ label: 'Actualizado', url: 'https://example.org/actualizado' }] })
    }))
    expect(updated.status).toBe(200)
    expect((await updated.json() as { links: { url: string }[] }).links.map(link => link.url)).toEqual(['https://example.org/actualizado'])

    const archived = await app.handle(request(`/api/v1/admin/resources/${resourceId}/archive`, { method: 'PATCH', headers: adminHeaders }))
    expect(archived.status).toBe(200)
    expect((await archived.json() as { status: string; publishedAt: string | null }).status).toBe('ARCHIVADO')
    expect((await app.handle(request(`/api/v1/resources/${resourceId}`))).status).toBe(404)

    const deleted = await app.handle(request(`/api/v1/admin/resources/${resourceId}`, { method: 'DELETE', headers: adminHeaders }))
    expect(deleted.status).toBe(200)
    resourceId = 0
  })

  it('rechaza destinos faltantes, categorías inactivas y accesos sin autorización', async () => {
    const app = createApp()
    const unauthorized = await app.handle(request('/api/v1/admin/resources'))
    expect(unauthorized.status).toBe(401)

    const noDestination = await app.handle(request('/api/v1/admin/resources', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(bodyFor('Sin destino', { fileId: null, links: [] }))
    }))
    expect(noDestination.status).toBe(422)
    expect((await noDestination.json() as { error: { code: string } }).error.code).toBe('RESOURCE_DESTINATION_REQUIRED')

    const inactiveCategory = await app.handle(request('/api/v1/admin/resources', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(bodyFor('Categoría inactiva', { categoryId: inactiveCategoryId }))
    }))
    expect(inactiveCategory.status).toBe(422)
    expect((await inactiveCategory.json() as { error: { code: string } }).error.code).toBe('INVALID_RESOURCE_CATEGORY')
  })
})
