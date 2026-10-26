import { AppError } from '../../../shared/errors/app-error'

export type ModerationScope = 'NAME' | 'COMMENT'
export type ModerationCounterEffect = 'PRESERVE' | 'RESET' | 'REDUCE'
export type ModerationSanctionStep =
  | { after: number; action: 'TEMPORARY'; durationHours: number }
  | { after: number; action: 'PERMANENT' }

export type ApprovedModerationPolicy = {
  approved: true
  version: string
  approvedBy: string
  approvedAt: string
  recurrenceWindowHours: number
  blockedTerms: Array<{ id: string; scope: ModerationScope; term: string }>
  exceptions: Array<{ scope: ModerationScope; exactText: string }>
  sanctions: ModerationSanctionStep[]
  manualUnlockEffect: ModerationCounterEffect
  expiryEffect: ModerationCounterEffect
  permanentReviewChannel?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 24 * 365 * 50
const isScope = (value: unknown): value is ModerationScope => value === 'NAME' || value === 'COMMENT'
const isCounterEffect = (value: unknown): value is ModerationCounterEffect => ['PRESERVE', 'RESET', 'REDUCE'].includes(String(value))

const invalidPolicy = (): never => {
  throw new AppError(503, 'MODERATION_POLICY_INVALID', 'La política de moderación configurada no es válida.')
}

const parseApprovedPolicy = (input: unknown): ApprovedModerationPolicy => {
  if (!isRecord(input) || input.approved !== true || typeof input.version !== 'string' || !input.version.trim() ||
    typeof input.approvedBy !== 'string' || !input.approvedBy.trim() || typeof input.approvedAt !== 'string' ||
    !Number.isFinite(Date.parse(input.approvedAt)) || !isPositiveInteger(input.recurrenceWindowHours) ||
    !Array.isArray(input.blockedTerms) || input.blockedTerms.length === 0 || !Array.isArray(input.sanctions) ||
    input.sanctions.length === 0 || !isCounterEffect(input.manualUnlockEffect) || !isCounterEffect(input.expiryEffect) ||
    (input.exceptions !== undefined && !Array.isArray(input.exceptions))) return invalidPolicy()

  const blockedTerms = input.blockedTerms.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || !isScope(item.scope) ||
      typeof item.term !== 'string' || !item.term.trim()) return invalidPolicy()
    return { id: item.id.trim(), scope: item.scope, term: item.term.trim() }
  })
  const exceptions = (input.exceptions ?? []).map(item => {
    if (!isRecord(item) || !isScope(item.scope) || typeof item.exactText !== 'string' || !item.exactText.trim()) return invalidPolicy()
    return { scope: item.scope, exactText: item.exactText.trim() }
  })
  const sanctions = input.sanctions.map(item => {
    if (!isRecord(item) || !isPositiveInteger(item.after)) return invalidPolicy()
    if (item.action === 'TEMPORARY' && isPositiveInteger(item.durationHours)) {
      return { after: item.after, action: 'TEMPORARY' as const, durationHours: item.durationHours }
    }
    if (item.action === 'PERMANENT') return { after: item.after, action: 'PERMANENT' as const }
    return invalidPolicy()
  }).sort((a, b) => a.after - b.after)
  if (new Set(sanctions.map(step => step.after)).size !== sanctions.length) return invalidPolicy()
  const rank = (step: ModerationSanctionStep) => step.action === 'PERMANENT' ? 2 : 1
  if (sanctions.some((step, index) => index > 0 && rank(step) < rank(sanctions[index - 1]!))) return invalidPolicy()
  const temporarySteps = sanctions.filter((step): step is Extract<ModerationSanctionStep, { action: 'TEMPORARY' }> => step.action === 'TEMPORARY')
  if (temporarySteps.some((step, index) => index > 0 && step.durationHours <= temporarySteps[index - 1]!.durationHours)) return invalidPolicy()
  if (new Set(blockedTerms.map(rule => rule.id)).size !== blockedTerms.length) return invalidPolicy()
  if (blockedTerms.some(rule => !rule.term.trim() || rule.term.length > 2000)) return invalidPolicy()
  if (exceptions.some(exception => exception.exactText.length > 2000)) return invalidPolicy()
  const permanentReviewChannel = input.permanentReviewChannel
  if (sanctions.some(step => step.action === 'PERMANENT') && (typeof permanentReviewChannel !== 'string' || !permanentReviewChannel.trim())) return invalidPolicy()

  return {
    approved: true,
    version: input.version.trim(),
    approvedBy: input.approvedBy.trim(),
    approvedAt: input.approvedAt,
    recurrenceWindowHours: input.recurrenceWindowHours,
    blockedTerms,
    exceptions,
    sanctions,
    manualUnlockEffect: input.manualUnlockEffect,
    expiryEffect: input.expiryEffect,
    ...(typeof permanentReviewChannel === 'string' ? { permanentReviewChannel: permanentReviewChannel.trim() } : {})
  }
}

/** Empty configuration intentionally means that progressive sanctions are inactive pending policy approval. */
export const loadApprovedModerationPolicy = (raw = process.env.MODERATION_POLICY_JSON) => {
  if (!raw?.trim()) return null
  try {
    return parseApprovedPolicy(JSON.parse(raw))
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(503, 'MODERATION_POLICY_INVALID', 'La política de moderación configurada no es JSON válido.')
  }
}
