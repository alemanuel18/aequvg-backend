import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { commentsRepository } from '../../src/modules/comments/repositories/comments.repository'
import { commentsService } from '../../src/modules/comments/services/comments.service'
import { commentModerationService } from '../../src/modules/comments/services/comment-moderation.service'
import { studentAuthRepository } from '../../src/modules/users/repositories/student-auth.repository'
import { prisma } from '../../src/shared/database/prisma'
import { createStudentSessionHeaders } from '../helpers/student-session'

const runDatabaseTests = process.env.COMMENTS_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `comments-test-${Date.now()}`
let roleId = 0
let authorId = 0
let studentId = 0
let eventId = 0
let studentHeaders: Record<string, string>
const app = createApp()

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)

describeDatabase('comentarios de publicaciones con PostgreSQL', () => {
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
    const event = await prisma.event.create({
      data: {
        createdById: authorId, name: `${runId}-event`, description: 'Evento publicado de prueba.',
        startsAt: new Date(Date.now() + 86400000), location: 'UVG', maximumCapacity: 50, status: 'PUBLICADO'
      }
    })
    eventId = event.id
    commentModerationService.register(() => true)
  })

  afterAll(async () => {
    commentModerationService.reset()
    try {
      if (eventId) await prisma.publicationComment.deleteMany({ where: { eventId } })
      if (eventId) await prisma.event.delete({ where: { id: eventId } })
      if (studentId) {
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

    const history = await app.handle(request('/api/v1/student-auth/me/comments?page=1&pageSize=10', { headers: studentHeaders }))
    expect(history.status).toBe(200)
    expect(await history.json()).toMatchObject({ total: 1, items: [{ id: created.id, targetId: eventId }] })
    const publicComments = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`))
    expect(publicComments.status).toBe(200)
    expect(await publicComments.json()).toMatchObject({ total: 1, items: [{ id: created.id }] })
  })

  it('anonimiza al autor sin borrar el comentario, la publicación ni su fecha', async () => {
    const comment = await prisma.publicationComment.findFirstOrThrow({ where: { eventId } })
    const createdAt = comment.createdAt
    await studentAuthRepository.deleteAccountAndRevokeSessions(studentId)
    const after = await prisma.publicationComment.findUniqueOrThrow({ where: { id: comment.id } })
    expect(after).toMatchObject({ id: comment.id, eventId, studentId: null, createdAt })
    expect(after.dedupeHash).not.toBe(comment.dedupeHash)
    const publicComments = await app.handle(request(`/api/v1/publications/EVENTO/${eventId}/comments`))
    expect(await publicComments.json()).toMatchObject({ items: [{ id: comment.id, authorName: 'Anónimo', createdAt: createdAt.toISOString() }] })
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
    } finally {
      await prisma.event.delete({ where: { id: hidden.id } })
    }
  })
})
