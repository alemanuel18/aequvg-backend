import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'

const describeDatabase = process.env.PROJECT_DATABASE_TEST === 'true' ? describe : describe.skip
const runId = `project-test-${Date.now()}`
const adminKey = 'project-integration-test-key'
let authorId = 0
let projectId = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const adminHeaders = { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' }

describeDatabase('CRUD HTTP de proyectos con PostgreSQL', () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = adminKey
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de proyectos.' } })
    const author = await prisma.administrativeUser.create({ data: { roleId: role.id, name: 'Autor de pruebas', email: `${runId}@uvg.edu.gt` } })
    authorId = author.id
  })

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { authorId } })
    await prisma.administrativeUser.deleteMany({ where: { id: authorId } })
    await prisma.role.deleteMany({ where: { name: `${runId}-role` } })
    await prisma.$disconnect()
  })

  it('crea, consulta, actualiza, revisa y elimina un proyecto', async () => {
    const app = createApp()
    const created = await app.handle(request('/api/v1/admin/projects', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({
        authorId, title: 'Proyecto de integración', slug: `${runId}-slug`,
        description: 'Descripción suficientemente extensa para validar el CRUD de proyectos.', type: 'PROYECTO',
      }),
    }))
    expect(created.status).toBe(201)
    projectId = (await created.json() as { id: number }).id

    const updated = await app.handle(request(`/api/v1/admin/projects/${projectId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ title: 'Proyecto actualizado', type: 'TESIS' }) }))
    expect(updated.status).toBe(200)
    expect((await updated.json() as { type: string }).type).toBe('TESIS')

    const reviewed = await app.handle(request(`/api/v1/admin/projects/${projectId}/review`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'APROBADO', reviewerId: authorId }) }))
    expect(reviewed.status).toBe(200)

    const publicList = await app.handle(request('/api/v1/projects?search=actualizado&type=TESIS'))
    expect((await publicList.json() as { items: { id: number }[] }).items.map(item => item.id)).toContain(projectId)

    const deleted = await app.handle(request(`/api/v1/admin/projects/${projectId}`, { method: 'DELETE', headers: adminHeaders }))
    expect(deleted.status).toBe(200)
    projectId = 0
  })

  it('documenta errores de autorización, validación y recurso inexistente', async () => {
    const app = createApp()
    expect((await app.handle(request('/api/v1/admin/projects'))).status).toBe(401)
    expect((await app.handle(request('/api/v1/admin/projects', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ title: 'x' }) }))).status).toBe(422)
    expect((await app.handle(request('/api/v1/admin/projects/999999', { headers: adminHeaders }))).status).toBe(404)

    const duplicate = { authorId, title: 'Proyecto duplicado', slug: `${runId}-duplicate`, description: 'Descripción válida para comprobar el conflicto de slug.', type: 'PROYECTO' }
    const first = await app.handle(request('/api/v1/admin/projects', { method: 'POST', headers: adminHeaders, body: JSON.stringify(duplicate) }))
    expect(first.status).toBe(201)
    projectId = (await first.json() as { id: number }).id
    const second = await app.handle(request('/api/v1/admin/projects', { method: 'POST', headers: adminHeaders, body: JSON.stringify(duplicate) }))
    expect(second.status).toBe(409)
    expect((await second.json() as { error: { code: string } }).error.code).toBe('PROJECT_SLUG_EXISTS')
  })

  it('combina filtros, pagina resultados y devuelve una lista vacía', async () => {
    const app = createApp()
    const prefix = `Filtro ${runId}`
    const createAndApprove = async (title: string, type: 'TESIS' | 'PROYECTO') => {
      const created = await app.handle(request('/api/v1/admin/projects', {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({ authorId, title, slug: `${runId}-${type}-${title.slice(-1)}`, description: 'Descripción suficiente para comprobar filtros y paginación del catálogo.', type }),
      }))
      expect(created.status).toBe(201)
      const id = (await created.json() as { id: number }).id
      const reviewed = await app.handle(request(`/api/v1/admin/projects/${id}/review`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'APROBADO', reviewerId: authorId }) }))
      expect(reviewed.status).toBe(200)
      return id
    }

    const thesisId = await createAndApprove(`${prefix} tesis A`, 'TESIS')
    const firstProjectId = await createAndApprove(`${prefix} proyecto A`, 'PROYECTO')
    const secondProjectId = await createAndApprove(`${prefix} proyecto B`, 'PROYECTO')
    const year = new Date().getUTCFullYear()

    const combined = await app.handle(request(`/api/v1/projects?search=${encodeURIComponent(prefix)}&year=${year}&type=TESIS&sortBy=title&sortOrder=asc&page=1&pageSize=1`))
    const combinedBody = await combined.json() as { items: { id: number; type: string }[]; pagination: { total: number; totalPages: number } }
    expect(combined.status).toBe(200)
    expect(combinedBody.items).toEqual([expect.objectContaining({ id: thesisId, type: 'TESIS' })])
    expect(combinedBody.pagination).toEqual({ total: 1, totalPages: 1 })

    const firstPage = await app.handle(request(`/api/v1/projects?search=${encodeURIComponent(prefix)}&type=PROYECTO&sortBy=title&sortOrder=asc&page=1&pageSize=1`))
    const secondPage = await app.handle(request(`/api/v1/projects?search=${encodeURIComponent(prefix)}&type=PROYECTO&sortBy=title&sortOrder=asc&page=2&pageSize=1`))
    const firstBody = await firstPage.json() as { items: { id: number }[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
    const secondBody = await secondPage.json() as { items: { id: number }[] }
    expect(firstBody.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 })
    expect([firstBody.items[0]?.id, secondBody.items[0]?.id].sort()).toEqual([firstProjectId, secondProjectId].sort())

    const empty = await app.handle(request(`/api/v1/projects?search=${encodeURIComponent(`${runId}-sin-resultados`)}`))
    expect(await empty.json()).toEqual({ items: [], pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 } })
  })
})
