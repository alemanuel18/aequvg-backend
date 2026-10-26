import { afterEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({ recordViolation: vi.fn(), applyCounterEffect: vi.fn() }))
vi.mock('../../src/modules/moderation/repositories/moderation.repository', () => ({ moderationRepository: repository }))

import { moderationService } from '../../src/modules/moderation/services/moderation.service'
import { loadApprovedModerationPolicy } from '../../src/modules/moderation/services/moderation-policy'
import type { ApprovedModerationPolicy } from '../../src/modules/moderation/services/moderation-policy'

const policy: ApprovedModerationPolicy = {
  approved: true,
  version: 'test-v1',
  approvedBy: 'Pruebas',
  approvedAt: '2026-10-25T12:00:00.000Z',
  recurrenceWindowHours: 168,
  blockedTerms: [
    { id: 'NAME-1', scope: 'NAME', term: 'insulto' },
    { id: 'COMMENT-1', scope: 'COMMENT', term: 'insulto' }
  ],
  exceptions: [{ scope: 'COMMENT', exactText: 'insulto citado en clase' }],
  sanctions: [
    { after: 2, action: 'TEMPORARY', durationHours: 12 },
    { after: 4, action: 'PERMANENT' }
  ],
  manualUnlockEffect: 'PRESERVE',
  expiryEffect: 'PRESERVE',
  permanentReviewChannel: 'revisiones'
}

describe('motor de moderación configurable', () => {
  afterEach(() => {
    moderationService.useEnvironmentPolicyProvider()
    moderationService.useDefaultCommentProvider()
    vi.clearAllMocks()
  })

  it('no activa reincidencias con la política candidata local', async () => {
    await expect(moderationService.inspectText('cerote', 'COMMENT', {
      studentId: 7, source: 'COMMENT_CREATE', idempotencyKey: 'operation-1'
    })).resolves.toMatchObject({ allowed: false, sanction: null })
    expect(repository.recordViolation).not.toHaveBeenCalled()
  })

  it('aplica excepciones exactas y detecta evasiones en política aprobada', async () => {
    moderationService.registerPolicyProvider({ getApprovedPolicy: () => policy })
    repository.recordViolation.mockResolvedValue({ duplicate: false, occurrenceNumber: 1, sanction: 'NONE', blockedUntil: null })

    await expect(moderationService.inspectText('insulto citado en clase', 'COMMENT'))
      .resolves.toMatchObject({ allowed: true })
    await expect(moderationService.inspectText('i.n.s.u.l.t.o', 'COMMENT', {
      studentId: 7, source: 'COMMENT_CREATE', idempotencyKey: 'operation-1'
    })).resolves.toMatchObject({ allowed: false, occurrenceNumber: 1 })
    expect(repository.recordViolation).toHaveBeenCalledWith(expect.objectContaining({
      studentId: 7, source: 'COMMENT_CREATE', policy, ruleId: 'COMMENT-1'
    }))
  })

  it('rechaza el contenido y devuelve la sanción temporal calculada', async () => {
    moderationService.registerPolicyProvider({ getApprovedPolicy: () => policy })
    const blockedUntil = new Date('2026-10-25T13:00:00.000Z')
    repository.recordViolation.mockResolvedValue({ duplicate: false, occurrenceNumber: 2, sanction: 'TEMPORARY', blockedUntil })

    await expect(moderationService.confirmTextAllowed('insulto', 'COMMENT', {
      studentId: 9, source: 'COMMENT_CREATE', idempotencyKey: 'comment-2'
    })).rejects.toMatchObject({
      status: 403, code: 'ACCOUNT_TEMPORARILY_BLOCKED', details: { blockedUntil: blockedUntil.toISOString() }
    })
  })

  it('valida que la política de producción tenga aprobación y reglas completas', () => {
    const badApproval = () => loadApprovedModerationPolicy(JSON.stringify({ ...policy, approved: false }))
    const incompleteSanction = () => loadApprovedModerationPolicy(JSON.stringify({ ...policy, sanctions: [{ after: 1, action: 'TEMPORARY' }] }))
    const shorterLaterTemporary = () => loadApprovedModerationPolicy(JSON.stringify({
      ...policy,
      sanctions: [
        { after: 2, action: 'TEMPORARY', durationHours: 24 },
        { after: 4, action: 'TEMPORARY', durationHours: 12 }
      ]
    }))
    expect(badApproval).toThrow('La política de moderación configurada no es válida.')
    expect(incompleteSanction).toThrow('La política de moderación configurada no es válida.')
    expect(shorterLaterTemporary).toThrow('La política de moderación configurada no es válida.')
  })
})
