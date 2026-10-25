import { AppError } from '../../../shared/errors/app-error'
import { publicTextModerationService } from '../../moderation/services/public-text-moderation.service'

export type CommentModerator = (content: string) => Promise<boolean> | boolean

let moderator: CommentModerator | undefined = content => publicTextModerationService.isCommentAllowed(content)

/** The MOD policy is the default; register allows replacing it with a central moderation provider. */
export const commentModerationService = {
  register(policy: CommentModerator) {
    moderator = policy
  },
  reset() {
    moderator = undefined
  },
  async assertAllowed(content: string) {
    if (!moderator) throw new AppError(503, 'COMMENT_MODERATION_UNAVAILABLE', 'La moderación de comentarios no está disponible.')
    if (!await moderator(content)) throw new AppError(422, 'COMMENT_REJECTED_BY_MODERATION', 'El comentario no cumple las reglas de publicación.')
  }
}
