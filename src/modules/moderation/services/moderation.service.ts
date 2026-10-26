import { createHash, randomUUID } from 'node:crypto'
import { AppError } from '../../../shared/errors/app-error'
import { findModerationTerm, normalizeModerationText } from '../../../shared/utils/moderation-text'
import { findOffensiveNameTerm } from '../../../shared/utils/name-moderation'
import { moderationRepository, type ModerationViolationSource } from '../repositories/moderation.repository'
import { loadApprovedModerationPolicy, type ApprovedModerationPolicy, type ModerationScope } from './moderation-policy'
import { publicTextModerationService } from './public-text-moderation.service'

export interface CommentModerationProvider {
  isCommentAllowed(content: string): boolean | Promise<boolean>
}
export interface ModerationPolicyProvider {
  getApprovedPolicy(): ApprovedModerationPolicy | null
}

const defaultCommentProvider: CommentModerationProvider = publicTextModerationService
const environmentPolicyProvider: ModerationPolicyProvider = { getApprovedPolicy: loadApprovedModerationPolicy }
let commentProvider: CommentModerationProvider | undefined = defaultCommentProvider
let policyProvider: ModerationPolicyProvider = environmentPolicyProvider

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const makeOperationKey = (studentId: number, source: ModerationViolationSource, idempotencyKey?: string) => {
  const supplied = idempotencyKey?.trim()
  if (supplied && (!/^[\w.:-]{1,128}$/.test(supplied))) {
    throw new AppError(422, 'INVALID_IDEMPOTENCY_KEY', 'La clave de operación no tiene un formato válido.')
  }
  return sha256(`${studentId}\n${source}\n${supplied || randomUUID()}`)
}

const violationMessage = (sanction: 'NONE' | 'TEMPORARY' | 'PERMANENT', blockedUntil: Date | null, reviewChannel: string | null) => {
  if (sanction === 'TEMPORARY') return new AppError(403, 'ACCOUNT_TEMPORARILY_BLOCKED', 'La cuenta fue bloqueada temporalmente por incumplir las reglas de contenido.', { blockedUntil: blockedUntil?.toISOString() ?? '' })
  if (sanction === 'PERMANENT') return new AppError(403, 'ACCOUNT_PERMANENTLY_BLOCKED', 'La cuenta fue bloqueada por incumplir las reglas de contenido.', { reviewChannel: reviewChannel ?? '' })
  return null
}

export const moderationService = {
  registerCommentProvider(next: CommentModerationProvider) { commentProvider = next },
  resetCommentProvider() { commentProvider = undefined },
  useDefaultCommentProvider() { commentProvider = defaultCommentProvider },
  registerPolicyProvider(next: ModerationPolicyProvider) { policyProvider = next },
  useEnvironmentPolicyProvider() { policyProvider = environmentPolicyProvider },
  currentPolicy() { return policyProvider.getApprovedPolicy() },

  async isCommentAllowed(content: string) {
    if (!commentProvider) throw new AppError(503, 'COMMENT_MODERATION_UNAVAILABLE', 'La moderación de comentarios no está disponible.')
    const policy = policyProvider.getApprovedPolicy()
    if (policy) return !findModerationTerm(content, policy.blockedTerms.filter(rule => rule.scope === 'COMMENT').map(rule => rule.term), policy.exceptions.filter(exception => exception.scope === 'COMMENT').map(exception => exception.exactText))
    return commentProvider.isCommentAllowed(content)
  },

  async inspectText(content: string, scope: ModerationScope, context?: {
    studentId?: number
    source?: ModerationViolationSource
    idempotencyKey?: string
  }) {
    const policy = policyProvider.getApprovedPolicy()
    let ruleId: string | null = null
    let policyVersion: string | null = null

    if (policy) {
      const exceptions = policy.exceptions.filter(exception => exception.scope === scope).map(exception => exception.exactText)
      const rule = policy.blockedTerms.find(candidate => candidate.scope === scope && findModerationTerm(content, [candidate.term], exceptions) !== null)
      if (rule) { ruleId = rule.id; policyVersion = policy.version }
    } else if (scope === 'NAME') {
      ruleId = findOffensiveNameTerm(content) ? 'legacy-name-catalog' : null
    } else {
      if (!commentProvider) throw new AppError(503, 'COMMENT_MODERATION_UNAVAILABLE', 'La moderación de comentarios no está disponible.')
      ruleId = await commentProvider.isCommentAllowed(content) ? null : 'legacy-comment-catalog'
    }

    if (!ruleId) return { allowed: true as const, sanction: null }
    if (!context?.studentId || !context.source || !policy || !policyVersion) {
      return { allowed: false as const, sanction: null }
    }

    const operationKey = makeOperationKey(context.studentId, context.source, context.idempotencyKey)
    const evidenceHash = sha256(`${scope}\n${normalizeModerationText(content)}`)
    const result = await moderationRepository.recordViolation({
      studentId: context.studentId,
      operationKey,
      source: context.source,
      scope,
      policy,
      ruleId,
      evidenceHash
    })
    const blocked = violationMessage(result.sanction, result.blockedUntil, result.reviewChannel)
    if (blocked) throw blocked
    return { allowed: false as const, sanction: result.sanction, occurrenceNumber: result.occurrenceNumber, duplicate: result.duplicate }
  },

  async applyManualUnlockEffect() {
    return policyProvider.getApprovedPolicy()?.manualUnlockEffect ?? 'PRESERVE'
  },
  async applyExpiry(studentId: number) {
    const effect = policyProvider.getApprovedPolicy()?.expiryEffect ?? 'PRESERVE'
    const user = await moderationRepository.applyCounterEffect(studentId, effect, 'Vencimiento del bloqueo temporal MOD.')
    if (!user) throw new AppError(403, 'ACCOUNT_DELETED', 'La cuenta fue eliminada y no puede iniciar sesión.')
    return user
  },

  async confirmTextAllowed(content: string, scope: ModerationScope, context?: {
    studentId?: number
    source?: ModerationViolationSource
    idempotencyKey?: string
  }) {
    const result = await this.inspectText(content, scope, context)
    if (result.allowed) return
    if (scope === 'COMMENT') throw new AppError(422, 'COMMENT_REJECTED_BY_MODERATION', 'El comentario no cumple las reglas de publicación.')
    throw new AppError(422, 'OFFENSIVE_NAME', 'Los nombres o apellidos contienen términos no permitidos.')
  },

  operationKey(studentId: number, source: ModerationViolationSource, idempotencyKey?: string) {
    return makeOperationKey(studentId, source, idempotencyKey)
  }
}
