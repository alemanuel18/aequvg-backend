import { describe, expect, it } from 'vitest'
import { commentModerationService } from '../../src/modules/comments/services/comment-moderation.service'
import { moderationService } from '../../src/modules/moderation/services/moderation.service'
import { publicTextModerationService } from '../../src/modules/moderation/services/public-text-moderation.service'
import { innocuousCommentCorpus, offensiveCommentCorpus } from '../fixtures/moderation-corpus'

describe('moderación de texto público', () => {
  it.each(offensiveCommentCorpus)('rechaza el corpus ofensivo (%s): %s', (_label, candidate) => {
    expect(publicTextModerationService.isCommentAllowed(candidate)).toBe(false)
  })

  it.each(innocuousCommentCorpus)('permite el texto inocuo (%s): %s', (_label, candidate) => {
    expect(publicTextModerationService.isCommentAllowed(candidate)).toBe(true)
  })

  it('conecta MOD por defecto y rechaza antes de guardar', async () => {
    await expect(moderationService.isCommentAllowed('Eres un idiota'))
      .resolves.toBe(false)
    await expect(commentModerationService.assertAllowed('Eres un idiota'))
      .rejects.toMatchObject({ status: 422, code: 'COMMENT_REJECTED_BY_MODERATION' })
  })
})
