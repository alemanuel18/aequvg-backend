import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'

const runDatabaseTests = process.env.NEWS_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `news-test-${Date.now()}`
const adminKey = 'news-integration-test-key'
let authorId = 0
let categoryId = 0
let newsId = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const adminHeaders = { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' }

describeDatabase('CRUD HTTP de noticias con PostgreSQL', () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = adminKey
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de noticias.' } })
    const author = await prisma.administrativeUser.create({ data: { roleId: role.id, name: 'Autor de pruebas', email: `${runId}@uvg.edu.gt` } })
    const category = await prisma.newsCategory.create({ data: { name: `${runId}-category` } })
    authorId = author.id
    categoryId = category.id
  })

  afterAll(async () => {
    await prisma.news.deleteMany({ where: { createdById: authorId } })
    await prisma.newsCategory.deleteMany({ where: { id: categoryId } })
    await prisma.administrativeUser.deleteMany({ where: { id: authorId } })
    await prisma.role.deleteMany({ where: { name: `${runId}-role` } })
    await prisma.$disconnect()
  })

  it('crea, consulta, edita, archiva y elimina una noticia', async () => {
    const app = createApp()
    const payload = { createdById: authorId, categoryId, title: 'Noticia de integración', summary: 'Resumen suficiente para la noticia de integración.', content: 'Contenido suficientemente extenso para comprobar el CRUD de noticias mediante la API.', status: 'PUBLICADO' }
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
})
