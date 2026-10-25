import { describe, expect, it } from 'vitest'
import { commentModerationService } from '../../src/modules/comments/services/comment-moderation.service'
import { moderationService } from '../../src/modules/moderation/services/moderation.service'
import { publicTextModerationService } from '../../src/modules/moderation/services/public-text-moderation.service'

describe('moderación de texto público', () => {
  it('permite comentarios sin términos bloqueados', () => {
    expect(publicTextModerationService.isCommentAllowed('Gracias por compartir la información.')).toBe(true)
  })

  it('rechaza insultos directos aunque cambien las mayúsculas o tildes', () => {
    expect(publicTextModerationService.isCommentAllowed('Eres un IDIÓTA')).toBe(false)
    expect(publicTextModerationService.isCommentAllowed('Qué mierda')).toBe(false)
  })

  it('revisa términos completos sin bloquear coincidencias dentro de otras palabras', () => {
    expect(publicTextModerationService.isCommentAllowed('Putomayo es un topónimo')).toBe(true)
  })

  it('conecta MOD por defecto y rechaza antes de guardar', async () => {
    await expect(moderationService.isCommentAllowed('Eres un idiota'))
      .resolves.toBe(false)
    await expect(commentModerationService.assertAllowed('Eres un idiota'))
      .rejects.toMatchObject({ status: 422, code: 'COMMENT_REJECTED_BY_MODERATION' })
  })
})
