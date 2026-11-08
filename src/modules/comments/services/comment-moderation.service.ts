import { AppError } from '../../../shared/errors/app-error'
import { moderationService } from '../../moderation/services/moderation.service'

/** Adapts the central MOD decision to the stable comments API error contract. */
export const commentModerationService = {
  async assertAllowed(content: string, context?: { studentId: number; source: 'COMMENT_CREATE' | 'COMMENT_EDIT'; idempotencyKey?: string }) {
    try {
      await moderationService.confirmTextAllowed(content, 'COMMENT', context)
    } catch (error) {
      if (error instanceof AppError && error.code === 'OFFENSIVE_NAME') {
        throw new AppError(422, 'COMMENT_REJECTED_BY_MODERATION', 'El comentario no cumple las reglas de publicación.')
      }
      throw error
    }
  }
}
