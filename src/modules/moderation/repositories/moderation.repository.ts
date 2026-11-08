import { AppError } from '../../../shared/errors/app-error'
import { prisma } from '../../../shared/database/prisma'
import type { ApprovedModerationPolicy, ModerationCounterEffect, ModerationScope, ModerationSanctionStep } from '../services/moderation-policy'

export type ModerationViolationSource = 'COMMENT_CREATE' | 'COMMENT_EDIT' | 'PROFILE_NAME_UPDATE'
export type ViolationInput = {
  studentId: number
  operationKey: string
  source: ModerationViolationSource
  scope: ModerationScope
  policy: ApprovedModerationPolicy
  ruleId: string
  evidenceHash: string
}

const effectCount = (count: number, effect: ModerationCounterEffect) => effect === 'RESET'
  ? 0
  : effect === 'REDUCE' ? Math.max(0, count - 1) : count

const sanctionFor = (count: number, steps: ModerationSanctionStep[]) => steps.filter(step => count >= step.after).at(-1) ?? null

export const moderationRepository = {
  async recordViolation(input: ViolationInput) {
    return prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{
        status: string
        moderationViolationCount: number
        moderationWindowStartedAt: Date | null
      }>>`SELECT "estado" AS "status", "contador_infracciones_moderacion" AS "moderationViolationCount",
        "inicio_ventana_moderacion" AS "moderationWindowStartedAt"
        FROM "usuario_estudiante" WHERE "id_estudiante" = ${input.studentId} FOR UPDATE`
      const current = rows[0]
      if (!current || current.status === 'ELIMINADO') throw new AppError(404, 'STUDENT_NOT_FOUND', 'La cuenta estudiantil no está disponible.')

      const existing = await tx.moderationIncident.findUnique({ where: { operationKey: input.operationKey } })
      if (existing) {
        if (existing.studentId !== input.studentId || existing.evidenceHash !== input.evidenceHash || existing.source !== input.source) {
          throw new AppError(409, 'MODERATION_OPERATION_KEY_REUSED', 'La clave de operación ya fue usada con otro contenido.')
        }
        return { duplicate: true, occurrenceNumber: existing.occurrenceNumber, sanction: existing.sanction, blockedUntil: existing.blockedUntil, reviewChannel: existing.reviewChannel }
      }

      const now = new Date()
      const policyWindowStart = new Date(now.getTime() - input.policy.recurrenceWindowHours * 60 * 60 * 1000)
      const windowStart = current.moderationWindowStartedAt && current.moderationWindowStartedAt > policyWindowStart
        ? current.moderationWindowStartedAt
        : policyWindowStart
      const priorCount = await tx.moderationIncident.count({ where: {
        studentId: input.studentId, countsTowardReincidence: true, createdAt: { gte: windowStart }
      } })
      const occurrenceNumber = priorCount + 1
      const step = sanctionFor(occurrenceNumber, input.policy.sanctions)
      const sanction: 'NONE' | 'TEMPORARY' | 'PERMANENT' = step?.action ?? 'NONE'
      let blockedUntil: Date | null = null
      let status: 'ACTIVO' | 'BLOQUEADO_TEMPORAL' | 'BLOQUEADO_PERMANENTE' = 'ACTIVO'
      let reviewChannel: string | null = null
      if (step?.action === 'TEMPORARY') {
        status = 'BLOQUEADO_TEMPORAL'
        blockedUntil = new Date(now.getTime() + step.durationHours * 60 * 60 * 1000)
      } else if (step?.action === 'PERMANENT') {
        status = 'BLOQUEADO_PERMANENTE'
        reviewChannel = input.policy.permanentReviewChannel ?? null
      }

      await tx.moderationIncident.create({ data: {
        studentId: input.studentId,
        operationKey: input.operationKey,
        source: input.source,
        policyVersion: input.policy.version,
        ruleId: input.ruleId,
        evidenceHash: input.evidenceHash,
        occurrenceNumber,
        sanction,
        blockedUntil,
        reviewChannel
      } })
      await tx.studentUser.update({
        where: { id: input.studentId },
        data: {
          moderationViolationCount: occurrenceNumber,
          moderationWindowStartedAt: priorCount === 0 ? now : windowStart,
          ...(status !== 'ACTIVO' ? { status, blockedUntil, reviewChannel } : {})
        }
      })

      if (status !== 'ACTIVO' && current.status !== status) {
        const reason = `Sanción MOD ${input.policy.version}; regla ${input.ruleId}; infracción ${occurrenceNumber}.`
        await tx.studentAccountStatusHistory.create({ data: {
          studentId: input.studentId,
          actorId: null,
          fromStatus: current.status as 'ACTIVO' | 'BLOQUEADO_TEMPORAL' | 'BLOQUEADO_PERMANENTE',
          toStatus: status,
          reason,
          blockedUntil,
          reviewChannel
        } })
      }
      if (status !== 'ACTIVO') await tx.studentSession.updateMany({
        where: { userId: input.studentId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'MODERATION_SANCTION' }
      })
      return { duplicate: false, occurrenceNumber, sanction, blockedUntil, reviewChannel }
    })
  },

  async applyCounterEffect(studentId: number, effect: ModerationCounterEffect, reason: string) {
    return prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ status: string; count: number; blockedUntil: Date | null }>>`SELECT "estado" AS "status",
        "contador_infracciones_moderacion" AS "count", "bloqueado_hasta" AS "blockedUntil" FROM "usuario_estudiante"
        WHERE "id_estudiante" = ${studentId} FOR UPDATE`
      const current = rows[0]
      if (!current || current.status === 'ELIMINADO') return null
      if (current.status !== 'BLOQUEADO_TEMPORAL' || !current.blockedUntil || current.blockedUntil > new Date()) {
        return tx.studentUser.findUnique({ where: { id: studentId }, include: { credential: true } })
      }
      const nextCount = effectCount(current.count, effect)
      if (effect === 'RESET') {
        await tx.moderationIncident.updateMany({ where: { studentId, countsTowardReincidence: true }, data: { countsTowardReincidence: false } })
      } else if (effect === 'REDUCE') {
        const latest = await tx.moderationIncident.findFirst({
          where: { studentId, countsTowardReincidence: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true }
        })
        if (latest) await tx.moderationIncident.update({ where: { id: latest.id }, data: { countsTowardReincidence: false } })
      }
      const updated = await tx.studentUser.update({
        where: { id: studentId },
        data: {
          status: 'ACTIVO', blockedUntil: null, reviewChannel: null,
          moderationViolationCount: nextCount,
          ...(nextCount === 0 ? { moderationWindowStartedAt: null } : {})
        },
        include: { credential: true }
      })
      await tx.studentAccountStatusHistory.create({ data: {
        studentId, actorId: null,
        fromStatus: 'BLOQUEADO_TEMPORAL',
        toStatus: 'ACTIVO', reason: `${reason} Contador MOD: ${current.count} -> ${nextCount}.`, blockedUntil: null, reviewChannel: null
      } })
      return updated
    })
  }
}
