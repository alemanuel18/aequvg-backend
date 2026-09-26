import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'

const runDatabaseTests = process.env.NEWS_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `news-test-${Date.now()}`
const adminKey = 'news-integration-test-key'
let authorId = 0
let categoryId = 0
let inactiveCategoryId = 0
let newsId = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const adminHeaders = { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' }
const bodyFor = (title: string, overrides: Record<string, unknown> = {}) => ({
  createdById: authorId,
  categoryId,
  title,
  summary: `Resumen suficiente para ${title}.`,
  content: `Contenido suficientemente extenso para comprobar ${title} mediante la API de noticias.`,
  status: 'PUBLICADO',
  ...overrides
})

describeDatabase('CRUD HTTP de noticias con PostgreSQL', () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = adminKey
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de noticias.' } })
    const author = await prisma.administrativeUser.create({ data: { roleId: role.id, name: 'Autor de pruebas', email: `${runId}@uvg.edu.gt` } })
    const category = await prisma.newsCategory.create({ data: { name: `${runId}-category` } })
    const inactiveCategory = await prisma.newsCategory.create({ data: { name: `${runId}-inactive`, active: false } })
    authorId = author.id
    categoryId = category.id
    inactiveCategoryId = inactiveCategory.id
  })

  afterAll(async () => {
    await prisma.news.deleteMany({ where: { createdById: authorId } })
    await prisma.newsCategory.deleteMany({ where: { id: inactiveCategoryId } })
    await prisma.newsCategory.deleteMany({ where: { id: categoryId } })
    await prisma.administrativeUser.deleteMany({ where: { id: authorId } })
    await prisma.role.deleteMany({ where: { name: `${runId}-role` } })
    await prisma.$disconnect()
  })

  it('crea, consulta, edita, archiva y elimina una noticia', async () => {
    const app = createApp()
    const payload = bodyFor('Noticia de integración')
    const created = await app.handle(request('/api/v1/admin/news', { method: 'POST', headers: adminHeaders, body: JSON.stringify(payload) }))
    expect(created.status).toBe(201)
    const news = await created.json() as { id: number; publishedAt: string | null }
    newsId = news.id
    expect(news.publishedAt).toBeTruthy()

    const search = await app.handle(request('/api/v1/news?q=integración'))
    expect(search.status).toBe(200)
    expect((await search.json() as { items: { id: number }[] }).items.map(item => item.id)).toContain(newsId)

    const updated = await app.handle(request(`/api/v1/admin/news/${newsId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ title: 'Noticia actualizada', status: 'BORRADOR' }) }))
    expect(updated.status).toBe(200)
    expect((await app.handle(request(`/api/v1/news/${newsId}`))).status).toBe(404)

    const archived = await app.handle(request(`/api/v1/admin/news/${newsId}/archive`, { method: 'PATCH', headers: adminHeaders }))
    expect(archived.status).toBe(200)
    expect((await archived.json() as { status: string; publishedAt: string | null }).status).toBe('ARCHIVADO')

    const deleted = await app.handle(request(`/api/v1/admin/news/${newsId}`, { method: 'DELETE', headers: adminHeaders }))
    expect(deleted.status).toBe(200)
    newsId = 0
  })

  it('busca, filtra, pagina y excluye publicaciones programadas', async () => {
    const app = createApp()
    const alpha = await app.handle(request('/api/v1/admin/news', { method: 'POST', headers: adminHeaders, body: JSON.stringify(bodyFor('Noticia alfa')) }))
    const beta = await app.handle(request('/api/v1/admin/news', { method: 'POST', headers: adminHeaders, body: JSON.stringify(bodyFor('Noticia beta')) }))
    const future = await app.handle(request('/api/v1/admin/news', { method: 'POST', headers: adminHeaders, body: JSON.stringify(bodyFor('Noticia programada', { publishedAt: '2099-01-01T00:00:00.000Z' })) }))
    expect([alpha.status, beta.status, future.status]).toEqual([201, 201, 201])

    const page = await app.handle(request(`/api/v1/news?categoryId=${categoryId}&page=1&pageSize=1`))
    expect(page.status).toBe(200)
    const listed = await page.json() as { items: { title: string }[]; pagination: { page: number; pageSize: number; total: number } }
    expect(listed.items).toHaveLength(1)
    expect(listed.pagination).toEqual({ page: 1, pageSize: 1, total: 2 })

    const search = await app.handle(request('/api/v1/news?q=alfa'))
    expect((await search.json() as { items: { title: string }[] }).items.map(item => item.title)).toContain('Noticia alfa')
    const scheduled = await app.handle(request('/api/v1/news?q=programada'))
    expect((await scheduled.json() as { items: unknown[] }).items).toHaveLength(0)
  })

  it('devuelve errores documentados para autorización, datos inválidos y ausencias', async () => {
    const app = createApp()
    const unauthorized = await app.handle(request('/api/v1/admin/news'))
    expect(unauthorized.status).toBe(401)
    expect((await unauthorized.json() as { error: { code: string } }).error.code).toBe('UNAUTHORIZED')

    const invalidCategory = await app.handle(request('/api/v1/admin/news', { method: 'POST', headers: adminHeaders, body: JSON.stringify(bodyFor('Noticia inválida', { categoryId: inactiveCategoryId })) }))
    expect(invalidCategory.status).toBe(422)
    expect((await invalidCategory.json() as { error: { code: string } }).error.code).toBe('INVALID_NEWS_CATEGORY')

    const missing = await app.handle(request('/api/v1/news/999999'))
    expect(missing.status).toBe(404)
    expect((await missing.json() as { error: { code: string } }).error.code).toBe('NEWS_NOT_FOUND')
  })
})
