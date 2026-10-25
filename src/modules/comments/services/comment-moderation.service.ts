import { AppError } from '../../../shared/errors/app-error'
import { moderationService } from '../../moderation/services/moderation.service'

/** Adapts the central MOD decision to the stable comments API error contract. */
export const commentModerationService = {
  async assertAllowed(content: string) {
    if (!await moderationService.isCommentAllowed(content)) {
      throw new AppError(422, 'COMMENT_REJECTED_BY_MODERATION', 'El comentario no cumple las reglas de publicación.')
    }
  }
}
