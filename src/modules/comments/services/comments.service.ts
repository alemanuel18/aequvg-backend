import type { CommentTargetType } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { commentHash, commentsRepository, normalizeComment } from '../repositories/comments.repository'
import { commentModerationService } from './comment-moderation.service'

const formatComment = (comment: {
  id: number; studentId: number | null; targetType: CommentTargetType; newsId: number | null; projectId: number | null; eventId: number | null;
  content: string; createdAt: Date; student: { firstNames: string; lastNames: string } | null
}) => ({
  id: comment.id,
  targetType: comment.targetType,
  targetId: comment.newsId ?? comment.projectId ?? comment.eventId!,
  content: comment.content,
  authorName: comment.studentId === null ? 'Anónimo' : `${comment.student?.firstNames ?? ''} ${comment.student?.lastNames ?? ''}`.trim(),
  createdAt: comment.createdAt.toISOString()
})

const pageResult = (result: Awaited<ReturnType<typeof commentsRepository.listForStudent>>, page: number, pageSize: number) => ({
  items: result.items.map(formatComment), page, pageSize, total: result.total
})

const validatePage = (page: number, pageSize: number) => {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AppError(422, 'INVALID_PAGINATION', 'La paginación solicitada no es válida.')
  }
}

export const commentsService = {
  async create(studentId: number, targetType: CommentTargetType, targetId: number, input: { content: string }) {
    const target = await commentsRepository.findVisibleTarget(targetType, targetId)
    if (!target) throw new AppError(404, 'PUBLICATION_NOT_FOUND', 'La publicación no existe o no está visible.')
    const content = normalizeComment(input.content)
    const length = [...content].length
    if (length < 1 || length > 2000) throw new AppError(422, 'INVALID_COMMENT_CONTENT', 'El comentario debe tener entre 1 y 2000 caracteres.')
    await commentModerationService.assertAllowed(content)
    try {
      return formatComment(await commentsRepository.create({ studentId, targetType, targetId, content, dedupeHash: commentHash(studentId, targetType, targetId, content) }))
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new AppError(409, 'DUPLICATE_COMMENT', 'Ya publicaste ese comentario en esta publicación.')
      }
      throw error
    }
  },
  async byPublication(targetType: CommentTargetType, targetId: number, page: number, pageSize: number) {
    validatePage(page, pageSize)
    if (!await commentsRepository.findVisibleTarget(targetType, targetId)) {
      throw new AppError(404, 'PUBLICATION_NOT_FOUND', 'La publicación no existe o no está visible.')
    }
    return pageResult(await commentsRepository.listForTarget(targetType, targetId, { page, pageSize }), page, pageSize)
  },
  async byStudent(studentId: number, page: number, pageSize: number) {
    validatePage(page, pageSize)
    return pageResult(await commentsRepository.listForStudent(studentId, { page, pageSize }), page, pageSize)
  }
}
