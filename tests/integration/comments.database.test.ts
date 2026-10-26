import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { clearRateLimitsForTests } from '../../src/middleware/rate-limit'
import { commentsRepository } from '../../src/modules/comments/repositories/comments.repository'
import { commentsService } from '../../src/modules/comments/services/comments.service'
import { studentAuthRepository } from '../../src/modules/users/repositories/student-auth.repository'
import { prisma } from '../../src/shared/database/prisma'
import { createStudentSessionHeaders } from '../helpers/student-session'

const runDatabaseTests = process.env.COMMENTS_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `comments-test-${Date.now()}`
let roleId = 0
let authorId = 0
let studentId = 0
let otherStudentId = 0
let eventId = 0
let newsCategoryId = 0
let newsId = 0
let projectId = 0
let studentHeaders: Record<string, string>
let otherStudentHeaders: Record<string, string>
const app = createApp()

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)

describeDatabase('comentarios de publicaciones con PostgreSQL', () => {
  beforeEach(() => clearRateLimitsForTests())

  beforeAll(async () => {
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para comentarios.' } })
    roleId = role.id
    const admin = await prisma.administrativeUser.create({
      data: { roleId, name: 'Autor de prueba', email: `${runId}@uvg.edu.gt`, status: 'ACTIVO' }
    })
    authorId = admin.id
    const student = await prisma.studentUser.create({
      data: { name: 'Estudiante Comentarios', firstNames: 'Estudiante', lastNames: 'Comentarios', email: `${runId}-student@uvg.edu.gt` }
    })
    studentId = student.id
    studentHeaders = await createStudentSessionHeaders(prisma, studentId)
    const otherStudent = await prisma.studentUser.create({
      data: { name: 'Otro Estudiante', firstNames: 'Otro', lastNames: 'Estudiante', email: `${runId}-other@uvg.edu.gt` }
    })
    otherStudentId = otherStudent.id
    otherStudentHeaders = await createStudentSessionHeaders(prisma, otherStudentId)
    const event = await prisma.event.create({
      data: {
        createdById: authorId, name: `${runId}-event`, description: 'Evento publicado de prueba.',
        startsAt: new Date(Date.now() + 86400000), location: 'UVG', maximumCapacity: 50, status: 'PUBLICADO'
      }
    })
    eventId = event.id
    const category = await prisma.newsCategory.create({ data: { name: `${runId}-category` } })
    newsCategoryId = category.id
    const news = await prisma.news.create({
      data: {
        createdById: authorId, categoryId: newsCategoryId, title: `${runId} noticia`,
        summary: 'Resumen para probar la publicación de comentarios.',
        content: 'Contenido para probar comentarios en noticias.',
        status: 'PUBLICADO', publishedAt: new Date()
      }
    })
    newsId = news.id
    const project = await prisma.project.create({
      data: {
        authorId, title: `${runId} proyecto`, slug: `${runId}-project`,
        description: 'Descripción para probar la publicación de comentarios en proyectos.',
        type: 'PROYECTO', status: 'APROBADO'
      }
    })
    projectId = project.id
  })

  afterAll(async () => {
    try {
      if (eventId) await prisma.publicationComment.deleteMany({ where: { eventId } })
      if (newsId) await prisma.publicationComment.deleteMany({ where: { newsId } })
      if (projectId) await prisma.publicationComment.deleteMany({ where: { projectId } })
      if (eventId) await prisma.event.delete({ where: { id: eventId } })
      if (newsId) await prisma.news.delete({ where: { id: newsId } })
      if (projectId) await prisma.project.delete({ where: { id: projectId } })
      if (newsCategoryId) await prisma.newsCategory.delete({ where: { id: newsCategoryId } })
      if (otherStudentId) {
        await prisma.studentSession.deleteMany({ where: { userId: otherStudentId } })
        await prisma.studentUser.delete({ where: { id: otherStudentId } })
      }
      if (studentId) {
        await prisma.studentAccountStatusHistory.deleteMany({ where: { studentId } })
        await prisma.studentSession.deleteMany({ where: { userId: studentId } })
        await prisma.studentUser.delete({ where: { id: studentId } })
      }
      if (authorId) await prisma.administrativeUser.delete({ where: { id: authorId } })
      if (roleId) await prisma.role.delete({ where: { id: roleId } })
    } finally {
      await prisma.$disconnect()
    }
  })

  it('usa al estudiante autenticado, rechaza duplicados y pagina historial/publicación', async () => {
    const post = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: studentHeaders,
      body: JSON.stringify({ content: 'Comentario integrado', studentId: studentId + 1000, authorId: 9999 })
    }))
    expect(post.status).toBe(201)
    const created = await post.json() as Record<string, unknown>
    expect(created).toMatchObject({ targetType: 'EVENTO', targetId: eventId, authorName: 'Estudiante Comentarios', content: 'Comentario integrado' })
    expect(created).not.toHaveProperty('studentId')
    expect(created).not.toHaveProperty('email')

    const duplicate = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: studentHeaders, body: JSON.stringify({ content: 'Comentario integrado' })
    }))
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).error.code).toBe('DUPLICATE_COMMENT')

    const secondPost = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: studentHeaders, body: JSON.stringify({ content: 'Comentario para la segunda página' })
    }))
    expect(secondPost.status).toBe(201)
    const secondCreated = await secondPost.json() as { id: number }

    const firstHistoryPage = await app.handle(request('/api/v1/student-auth/me/comments?page=1&pageSize=1', { headers: studentHeaders }))
    const secondHistoryPage = await app.handle(request('/api/v1/student-auth/me/comments?page=2&pageSize=1', { headers: studentHeaders }))
    expect(firstHistoryPage.status).toBe(200)
    expect(secondHistoryPage.status).toBe(200)
    const firstHistory = await firstHistoryPage.json() as { items: Array<{ id: number }>; page: number; pageSize: number; total: number }
    const secondHistory = await secondHistoryPage.json() as { items: Array<{ id: number }>; page: number; pageSize: number; total: number }
    expect(firstHistory).toMatchObject({ page: 1, pageSize: 1, total: 2 })
    expect(secondHistory).toMatchObject({ page: 2, pageSize: 1, total: 2 })
    expect([firstHistory.items[0]?.id, secondHistory.items[0]?.id].sort()).toEqual([created.id, secondCreated.id].sort())
    const publicComments = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`))
    expect(publicComments.status).toBe(200)
    expect(await publicComments.json()).toMatchObject({ total: 2, items: expect.arrayContaining([expect.objectContaining({ id: created.id }), expect.objectContaining({ id: secondCreated.id })]) })
  })

  it('conecta creación, publicación e historial con noticias, proyectos y eventos', async () => {
    const targets = [
      { type: 'NOTICIA', id: newsId },
      { type: 'PROYECTO', id: projectId },
      { type: 'EVENTO', id: eventId }
    ] as const
    const created: Array<{ id: number; targetType: string; targetId: number; content: string }> = []

    for (const target of targets) {
      const content = `Comentario de integración ${target.type.toLowerCase()}`
      const response = await app.handle(request(`/api/v1/publications/${target.type}/${target.id}/comments`, {
        method: 'POST', headers: studentHeaders, body: JSON.stringify({ content })
      }))
      expect(response.status).toBe(201)
      created.push(await response.json() as typeof created[number])
    }

    for (const comment of created) {
      const response = await app.handle(request(`/api/v1/publications/${comment.targetType}/${comment.targetId}/comments`))
      expect(response.status).toBe(200)
      const publication = await response.json() as { items: Array<{ id: number; content: string }> }
      expect(publication.items).toContainEqual(expect.objectContaining({ id: comment.id, content: comment.content }))
    }

    const historyResponse = await app.handle(request('/api/v1/student-auth/me/comments?page=1&pageSize=100', { headers: studentHeaders }))
    expect(historyResponse.status).toBe(200)
    const history = await historyResponse.json() as { items: Array<{ id: number; targetType: string; targetId: number }> }
    for (const comment of created) {
      expect(history.items).toContainEqual(expect.objectContaining({ id: comment.id, targetType: comment.targetType, targetId: comment.targetId }))
    }
  })

  it('mantiene el historial aislado por la identidad autenticada', async () => {
    const response = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: otherStudentHeaders, body: JSON.stringify({ content: 'Comentario privado de otro usuario' })
    }))
    expect(response.status).toBe(201)
    const otherComment = await response.json() as { id: number }

    const ownHistory = await app.handle(request('/api/v1/student-auth/me/comments?page=1&pageSize=100', { headers: studentHeaders }))
    expect(ownHistory.status).toBe(200)
    const history = await ownHistory.json() as { items: Array<{ id: number }>; total: number }
    expect(history.items.some(comment => comment.id === otherComment.id)).toBe(false)
    expect(history.items.every(comment => comment.id !== otherComment.id)).toBe(true)
  })

  it('no permite comentar a una cuenta que dejó de estar activa', async () => {
    await prisma.studentUser.update({ where: { id: studentId }, data: { status: 'BLOQUEADO_PERMANENTE' } })
    try {
      const commentsBefore = await prisma.publicationComment.count({ where: { studentId, eventId } })
      const response = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
        method: 'POST', headers: studentHeaders, body: JSON.stringify({ content: 'No debe guardarse' })
      }))
      expect(response.status).toBe(403)
      expect((await response.json()).error.code).toBe('ACCOUNT_PERMANENTLY_BLOCKED')
      expect(await prisma.publicationComment.count({ where: { studentId, eventId } })).toBe(commentsBefore)
    } finally {
      await prisma.studentUser.update({ where: { id: studentId }, data: { status: 'ACTIVO' } })
    }
  })

  it('rechaza texto bloqueado por MOD antes de persistir', async () => {
    const commentsBefore = await prisma.publicationComment.count({ where: { studentId, eventId } })
    const response = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: studentHeaders, body: JSON.stringify({ content: 'Eres un idiota' })
    }))
    expect(response.status).toBe(422)
    expect((await response.json()).error.code).toBe('COMMENT_REJECTED_BY_MODERATION')
    expect(await prisma.publicationComment.count({ where: { studentId, eventId } })).toBe(commentsBefore)
  })

  it('anonimiza al autor sin borrar el comentario, la publicación ni su fecha', async () => {
    const comment = await prisma.publicationComment.findFirstOrThrow({ where: { eventId, content: 'Comentario integrado' } })
    const createdAt = comment.createdAt
    await studentAuthRepository.deleteAccountAndRevokeSessions(studentId, { actorId: null, reason: 'BAJA_SOLICITADA_POR_USUARIO' })
    const after = await prisma.publicationComment.findUniqueOrThrow({ where: { id: comment.id } })
    expect(after).toMatchObject({ id: comment.id, targetType: 'EVENTO', eventId, content: 'Comentario integrado', studentId: null, createdAt })
    expect(after.dedupeHash).not.toBe(comment.dedupeHash)
    const publicComments = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`))
    const publicList = await publicComments.json() as { items: Array<Record<string, unknown> & { id: number; authorName: string; createdAt: string }> }
    expect(publicList.items.find(item => item.id === comment.id)).toEqual({
      id: comment.id, targetType: 'EVENTO', targetId: eventId, content: 'Comentario integrado',
      authorName: 'Anónimo', createdAt: createdAt.toISOString()
    })
    const anonymizedResponse = publicList.items.find(item => item.id === comment.id)!
    expect(anonymizedResponse).not.toHaveProperty('studentId')
    expect(anonymizedResponse).not.toHaveProperty('authorId')
    expect(anonymizedResponse).not.toHaveProperty('avatarUrl')
    expect(anonymizedResponse).not.toHaveProperty('profileUrl')
    expect(JSON.stringify(anonymizedResponse)).not.toContain('Estudiante Comentarios')

    const commentsBefore = await prisma.publicationComment.count({ where: { eventId } })
    const afterDeletion = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: studentHeaders, body: JSON.stringify({ content: 'Intento después de la baja' })
    }))
    expect(afterDeletion.status).toBe(401)
    expect(await prisma.publicationComment.count({ where: { eventId } })).toBe(commentsBefore)
  })

  it('no crea comentarios sin una publicación visible', async () => {
    const hidden = await prisma.event.create({
      data: {
        createdById: authorId, name: `${runId}-draft`, description: 'Evento no publicado.',
        startsAt: new Date(Date.now() + 86400000), location: 'UVG', maximumCapacity: 20, status: 'BORRADOR'
      }
    })
    try {
      await expect(commentsRepository.findVisibleTarget('EVENTO', hidden.id)).resolves.toBeNull()
      await expect(commentsService.create(studentId, 'EVENTO', hidden.id, { content: 'No debe guardarse' }))
        .rejects.toMatchObject({ status: 404, code: 'PUBLICATION_NOT_FOUND' })
      const response = await app.handle(request(`/api/v1/publications/EVENTO/${hidden.id}/comments`, {
        method: 'POST', headers: otherStudentHeaders, body: JSON.stringify({ content: 'Publicación no visible' })
      }))
      expect(response.status).toBe(404)
      expect((await response.json()).error.code).toBe('PUBLICATION_NOT_FOUND')
    } finally {
      await prisma.event.delete({ where: { id: hidden.id } })
    }
  })

  it('conserva contenido HTML malicioso como texto plano en la respuesta', async () => {
    const payload = '<img src=x onerror=alert(1)>'
    const response = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: otherStudentHeaders, body: JSON.stringify({ content: payload })
    }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ content: payload })
  })
})
