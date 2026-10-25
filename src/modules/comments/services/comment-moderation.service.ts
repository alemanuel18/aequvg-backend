import { AppError } from '../../../shared/errors/app-error'

export type CommentModerator = (content: string) => Promise<boolean> | boolean

let moderator: CommentModerator | undefined

/** MOD registers its approved policy here; comments fail closed until that dependency is connected. */
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
