import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  findVisibleTarget: vi.fn(), create: vi.fn(), listForTarget: vi.fn(), listForStudent: vi.fn()
}))
vi.mock('../../src/modules/comments/repositories/comments.repository', () => ({
  commentsRepository: repository,
  normalizeComment: (value: string) => value.normalize('NFC').replace(/\r\n?/g, '\n').trim(),
  commentHash: (studentId: number, targetType: string, targetId: number, value: string) => `hash:${studentId}:${targetType}:${targetId}:${value.toLowerCase()}`
}))

import { moderationService } from '../../src/modules/moderation/services/moderation.service'
import { commentsService } from '../../src/modules/comments/services/comments.service'

const target = { id: 7 }
const saved = {
  id: 19, studentId: 4, targetType: 'EVENTO' as const, newsId: null, projectId: null, eventId: 7,
  content: 'Comentario de prueba', contentHash: 'hash', createdAt: new Date('2026-10-24T12:00:00Z'),
  student: { firstNames: 'Ana', lastNames: 'López' }
}

describe('comentarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    moderationService.registerCommentProvider({ isCommentAllowed: () => true })
    repository.findVisibleTarget.mockResolvedValue(target)
    repository.create.mockResolvedValue(saved)
    repository.listForTarget.mockResolvedValue({ items: [saved], total: 1 })
    repository.listForStudent.mockResolvedValue({ items: [saved], total: 1 })
  })
  afterEach(() => moderationService.useDefaultCommentProvider())

  it('usa el autor de sesión y modera antes de persistir', async () => {
    const order: string[] = []
    moderationService.registerCommentProvider({ isCommentAllowed: () => { order.push('moderation'); return true } })
    repository.create.mockImplementation(async () => { order.push('create'); return saved })
    await expect(commentsService.create(4, 'EVENTO', 7, { content: ' Comentario de prueba ' }))
      .resolves.toMatchObject({ authorName: 'Ana López', targetId: 7 })
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ studentId: 4, targetType: 'EVENTO', targetId: 7 }))
    expect(order).toEqual(['moderation', 'create'])
  })

  it('falla de forma cerrada si MOD no está integrado', async () => {
    moderationService.resetCommentProvider()
    await expect(commentsService.create(4, 'EVENTO', 7, { content: 'Comentario de prueba' }))
      .rejects.toMatchObject({ status: 503, code: 'COMMENT_MODERATION_UNAVAILABLE' })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('no persiste cuando moderación rechaza el texto', async () => {
    moderationService.registerCommentProvider({ isCommentAllowed: () => false })
    await expect(commentsService.create(4, 'EVENTO', 7, { content: 'Texto rechazado' }))
      .rejects.toMatchObject({ status: 422, code: 'COMMENT_REJECTED_BY_MODERATION' })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('aplica el límite de 2000 caracteres antes de moderar o persistir', async () => {
    await expect(commentsService.create(4, 'EVENTO', 7, { content: 'a'.repeat(2001) }))
      .rejects.toMatchObject({ status: 422, code: 'INVALID_COMMENT_CONTENT' })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('rechaza contenido vacío después de recortar espacios', async () => {
    await expect(commentsService.create(4, 'EVENTO', 7, { content: '   \n  ' }))
      .rejects.toMatchObject({ status: 422, code: 'INVALID_COMMENT_CONTENT' })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('rechaza destinos inexistentes o no visibles', async () => {
    repository.findVisibleTarget.mockResolvedValue(null)
    await expect(commentsService.create(4, 'EVENTO', 999, { content: 'Comentario de prueba' }))
      .rejects.toMatchObject({ status: 404, code: 'PUBLICATION_NOT_FOUND' })
    expect(repository.create).not.toHaveBeenCalled()
  })

  it('devuelve historial paginado sin correos ni otros datos privados', async () => {
    await expect(commentsService.byStudent(4, 2, 10)).resolves.toMatchObject({
      page: 2, pageSize: 10, total: 1, items: [{ id: 19, authorName: 'Ana López', createdAt: '2026-10-24T12:00:00.000Z' }]
    })
    expect(repository.listForStudent).toHaveBeenCalledWith(4, { page: 2, pageSize: 10 })
  })

  it('rechaza paginación fuera de los límites', async () => {
    await expect(commentsService.byStudent(4, 1, 101)).rejects.toMatchObject({ status: 422, code: 'INVALID_PAGINATION' })
  })
})
