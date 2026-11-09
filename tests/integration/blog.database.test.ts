import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { createAdminSessionHeaders } from '../helpers/admin-session'

const runDatabaseTests = process.env.BLOG_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `acs-blog-${Date.now()}`
let roleId = 0
let authorId = 0
let headers: Record<string, string>
let postId = 0
const app = createApp()
const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const payload = {
  title: 'Persistencia de prueba ACS', slug: `${runId}-persistencia`,
  summary: 'Resumen válido para probar persistencia del blog ACS.',
  content: '<h2>Trabajo con ACS</h2><p>Contenido persistente con longitud suficiente para la prueba.</p>',
  status: 'BORRADOR'
}

describeDatabase('Persistencia y ciclo editorial de Blog ACS con PostgreSQL', () => {
  beforeAll(async () => {
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol de prueba aislado para Blog ACS.' } })
    roleId = role.id
    const author = await prisma.administrativeUser.create({ data: { roleId, name: 'Autor de prueba ACS', email: `${runId}@uvg.edu.gt`, status: 'ACTIVO' } })
    authorId = author.id
    headers = await createAdminSessionHeaders(prisma, authorId, roleId, ['BLOG_MANAGE'])
  })

  afterAll(async () => {
    try {
      if (postId) await prisma.blogPost.deleteMany({ where: { id: postId } })
      if (roleId) {
        await prisma.administrativeSession.deleteMany({ where: { userId: authorId } })
        await prisma.administrativeUser.deleteMany({ where: { roleId } })
        await prisma.rolePermission.deleteMany({ where: { roleId } })
        await prisma.role.delete({ where: { id: roleId } })
      }
    } finally { await prisma.$disconnect() }
  })

  it('crea, publica, consulta, archiva y elimina una entrada persistida', async () => {
    const created = await app.handle(request('/api/v1/admin/blog', { method: 'POST', headers, body: JSON.stringify(payload) }))
    expect(created.status).toBe(201)
    const createdPost = await created.json() as { id: number; status: string; createdBy: { id: number } }
    postId = createdPost.id
    expect(createdPost.status).toBe('BORRADOR')
    expect(createdPost.createdBy.id).toBe(authorId)
    expect(await prisma.blogPost.findUnique({ where: { id: postId } })).toBeTruthy()

    const hidden = await app.handle(request(`/api/v1/blog/${payload.slug}`))
    expect(hidden.status).toBe(404)

    const updated = await app.handle(request(`/api/v1/admin/blog/${postId}`, {
      method: 'PUT', headers, body: JSON.stringify({ status: 'PUBLICADO' })
    }))
    expect(updated.status).toBe(200)
    expect((await updated.json() as { status: string }).status).toBe('PUBLICADO')
    const publicDetail = await app.handle(request(`/api/v1/blog/${payload.slug}`))
    expect(publicDetail.status).toBe(200)
    expect((await publicDetail.json() as { content: string }).content).toContain('Trabajo con ACS')

    const adminList = await app.handle(request('/api/v1/admin/blog', { headers }))
    expect(adminList.status).toBe(200)
    expect((await adminList.json() as { items: Array<{ id: number }> }).items.some(item => item.id === postId)).toBe(true)

    const archived = await app.handle(request(`/api/v1/admin/blog/${postId}/archive`, { method: 'PATCH', headers }))
    expect(archived.status).toBe(200)
    expect((await archived.json() as { status: string }).status).toBe('ARCHIVADO')
    expect((await app.handle(request(`/api/v1/blog/${payload.slug}`))).status).toBe(404)

    const deleted = await app.handle(request(`/api/v1/admin/blog/${postId}`, { method: 'DELETE', headers }))
    expect(deleted.status).toBe(200)
    expect(await prisma.blogPost.findUnique({ where: { id: postId } })).toBeNull()
    postId = 0
  })
})
