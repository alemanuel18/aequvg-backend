import { AppError } from '../../../shared/errors/app-error'
import { publicTextModerationService } from './public-text-moderation.service'

export interface CommentModerationProvider {
  isCommentAllowed(content: string): boolean | Promise<boolean>
}

const defaultProvider: CommentModerationProvider = publicTextModerationService
let provider: CommentModerationProvider | undefined = defaultProvider

/** Central MOD boundary used by public content modules before persistence. */
export const moderationService = {
  registerCommentProvider(next: CommentModerationProvider) {
    provider = next
  },
  resetCommentProvider() {
    provider = undefined
  },
  useDefaultCommentProvider() {
    provider = defaultProvider
  },
  async isCommentAllowed(content: string) {
    if (!provider) throw new AppError(503, 'COMMENT_MODERATION_UNAVAILABLE', 'La moderación de comentarios no está disponible.')
    return provider.isCommentAllowed(content)
  }
}
