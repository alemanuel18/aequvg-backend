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
    { id: 'COMMENT-1', scope: 'COMMENT', term: 'insulto' },
    { id: 'NAME-2', scope: 'NAME', term: 'idiota' },
    { id: 'COMMENT-2', scope: 'COMMENT', term: 'idiota' }
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

  it('mantiene resultados consistentes entre nombres y comentarios para el mismo término', async () => {
    moderationService.registerPolicyProvider({ getApprovedPolicy: () => policy })
    repository.recordViolation.mockResolvedValue({ duplicate: false, occurrenceNumber: 1, sanction: 'NONE', blockedUntil: null })

    await expect(moderationService.inspectText('IDÍOTA', 'NAME'))
      .resolves.toMatchObject({ allowed: false, sanction: null })
    await expect(moderationService.inspectText('i.d.i.o.t.a', 'COMMENT'))
      .resolves.toMatchObject({ allowed: false, sanction: null })
    await expect(moderationService.inspectText('María Analía Pérez', 'NAME'))
      .resolves.toMatchObject({ allowed: true })
    await expect(moderationService.inspectText('El análisis químico fue claro.', 'COMMENT'))
      .resolves.toMatchObject({ allowed: true })
    expect(repository.recordViolation).not.toHaveBeenCalled()
  })

  it('reutiliza la clave derivada para que un reintento sea una sola operación', async () => {
    moderationService.registerPolicyProvider({ getApprovedPolicy: () => policy })
    repository.recordViolation.mockResolvedValue({ duplicate: true, occurrenceNumber: 1, sanction: 'NONE', blockedUntil: null })
    const context = { studentId: 17, source: 'COMMENT_CREATE' as const, idempotencyKey: 'same-comment-submit' }

    const first = await moderationService.inspectText('insulto', 'COMMENT', context)
    const retry = await moderationService.inspectText('insulto', 'COMMENT', context)

    expect(first).toMatchObject({ allowed: false, occurrenceNumber: 1 })
    expect(retry).toMatchObject({ allowed: false, occurrenceNumber: 1, duplicate: true })
    const firstOperation = repository.recordViolation.mock.calls[0]?.[0]
    const retryOperation = repository.recordViolation.mock.calls[1]?.[0]
    expect(firstOperation.operationKey).toBe(retryOperation.operationKey)
    expect(firstOperation.evidenceHash).toBe(retryOperation.evidenceHash)
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
