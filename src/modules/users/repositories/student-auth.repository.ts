import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '../../../shared/database/prisma'
import type { ModerationCounterEffect } from '../../moderation/services/moderation-policy'

// La tabla StudentUser contiene exclusivamente cuentas normales; el tipo esStudent
// distingue estudiantes actuales de interesados. Las cuentas administrativas viven en otra tabla.
const studentAccountWhere = {}

const studentAuthenticationInclude = { credential: true } as const

export const studentAuthRepository = {
  findUserByEmail: (email: string) => prisma.studentUser.findUnique({
    where: { email }, include: studentAuthenticationInclude
  }),

  findUserById: (id: number) => prisma.studentUser.findUnique({
    where: { id }, include: studentAuthenticationInclude
  }),

  listManagedAccounts: async ({ q, status, type, page, pageSize }: { q?: string; status?: string; type?: 'ESTUDIANTE' | 'INTERESADO'; page: number; pageSize: number }) => {
    const where = {
      ...studentAccountWhere,
      ...(type ? { isStudent: type === 'ESTUDIANTE' } : {}),
      ...(status ? { status: status as 'ACTIVO' | 'BLOQUEADO_TEMPORAL' | 'BLOQUEADO_PERMANENTE' | 'ELIMINADO' } : {}),
      ...(q ? { OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } }
      ] } : {})
    }
    const [items, total] = await prisma.$transaction([
      prisma.studentUser.findMany({ where, select: { id: true, name: true, firstNames: true, lastNames: true, email: true, isStudent: true, status: true, blockedUntil: true, reviewChannel: true, deletedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.studentUser.count({ where })
    ])
    return { items, total }
  },

  findManagedAccount: (id: number) => prisma.studentUser.findFirst({
    where: { id, ...studentAccountWhere },
    select: {
      id: true, name: true, firstNames: true, lastNames: true, email: true, isStudent: true,
      status: true, blockedUntil: true, reviewChannel: true, deletedAt: true, createdAt: true, updatedAt: true,
      statusHistory: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true, fromStatus: true, toStatus: true, reason: true, blockedUntil: true, reviewChannel: true, createdAt: true,
          actor: { select: { id: true, name: true } }
        }
      },
      moderationViolationCount: true,
      moderationIncidents: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true, source: true, policyVersion: true, ruleId: true, evidenceHash: true,
          occurrenceNumber: true, sanction: true, blockedUntil: true, reviewChannel: true, createdAt: true
        }
      }
    }
  }),

  updateProfile: (id: number, data: { name: string; firstNames: string; lastNames: string }) => prisma.studentUser.update({
    where: { id }, data, include: studentAuthenticationInclude
  }),

  findSession: (id: string) => prisma.studentSession.findUnique({
    where: { id }, include: { user: { include: studentAuthenticationInclude } }
  }),

  createUser: (data: { name: string; firstNames: string; lastNames: string; email: string; passwordHash: string }) => prisma.studentUser.create({
    data: {
      name: data.name,
      firstNames: data.firstNames,
      lastNames: data.lastNames,
      email: data.email,
      isStudent: true,
      credential: { create: { passwordHash: data.passwordHash } }
    },
    include: studentAuthenticationInclude
  }),

  createSession: (data: {
    id: string
    userId: number
    tokenIdentifierHash: string
    deviceSecretHash: string
    browserContextHash: string
    csrfTokenHash: string
    expiresAt: Date
  }) => prisma.studentSession.create({ data }),

  touchSession: (id: string) => prisma.studentSession.update({
    where: { id }, data: { lastSeenAt: new Date() }
  }),

  revokeSession: (id: string, reason: string) => prisma.studentSession.updateMany({
    where: { id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: reason }
  }),

  activateExpiredTemporaryBlock: (userId: number) => prisma.studentUser.update({
    where: { id: userId },
    data: { status: 'ACTIVO', blockedUntil: null, reviewChannel: null },
    include: studentAuthenticationInclude
  }),

  updateStatusAndRevokeSessions: (userId: number, data: {
    status: 'ACTIVO' | 'BLOQUEADO_TEMPORAL' | 'BLOQUEADO_PERMANENTE'
    blockedUntil: Date | null
    reviewChannel: string | null
    actorId: number
    reason: string
    counterEffect?: ModerationCounterEffect
  }) => prisma.$transaction(async tx => {
    const current = await tx.studentUser.findFirst({ where: { id: userId, ...studentAccountWhere } })
    if (!current) return null
    if (current.status === 'ELIMINADO') return { user: current, changed: false, deleted: true as const }
    const manualUnlock = data.status === 'ACTIVO' && current.status !== 'ACTIVO' ? data.counterEffect : undefined
    if (manualUnlock === 'RESET') await tx.moderationIncident.updateMany({
      where: { studentId: userId, countsTowardReincidence: true }, data: { countsTowardReincidence: false }
    })
    if (manualUnlock === 'REDUCE') {
      const latest = await tx.moderationIncident.findFirst({
        where: { studentId: userId, countsTowardReincidence: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true }
      })
      if (latest) await tx.moderationIncident.update({ where: { id: latest.id }, data: { countsTowardReincidence: false } })
    }
    const unlockCount = data.status === 'ACTIVO' && current.status !== 'ACTIVO' && data.counterEffect
      ? data.counterEffect === 'RESET' ? 0 : data.counterEffect === 'REDUCE' ? Math.max(0, current.moderationViolationCount - 1) : current.moderationViolationCount
      : current.moderationViolationCount
    const user = await tx.studentUser.update({
      where: { id: userId }, data: {
        status: data.status, blockedUntil: data.blockedUntil, reviewChannel: data.reviewChannel,
        moderationViolationCount: unlockCount,
        ...(unlockCount === 0 ? { moderationWindowStartedAt: null } : {})
      }, include: studentAuthenticationInclude
    })
    const changed = current.status !== data.status || current.blockedUntil?.getTime() !== data.blockedUntil?.getTime() || current.reviewChannel !== data.reviewChannel
    if (changed) await tx.studentAccountStatusHistory.create({ data: {
      studentId: userId, actorId: data.actorId, fromStatus: current.status, toStatus: data.status,
      reason: unlockCount !== current.moderationViolationCount
        ? `${data.reason} Contador MOD: ${current.moderationViolationCount} -> ${unlockCount} (${manualUnlock}).`
        : data.reason,
      blockedUntil: data.blockedUntil, reviewChannel: data.reviewChannel
    } })
    if (data.status !== 'ACTIVO') await tx.studentSession.updateMany({
      where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'ACCOUNT_STATUS_CHANGED' }
    })
    return { user, changed, deleted: false as const }
  }),

  deleteAccountAndRevokeSessions: (userId: number, data: { actorId: number | null; reason: string }) => prisma.$transaction(async tx => {
    const current = await tx.studentUser.findFirst({ where: { id: userId, ...studentAccountWhere } })
    if (!current) return null
    if (current.status === 'ELIMINADO') return { alreadyDeleted: true as const }
    const deletedAt = new Date()
    const comments = await tx.publicationComment.findMany({ where: { studentId: userId }, select: { id: true } })
    for (const comment of comments) {
      await tx.publicationComment.update({
        where: { id: comment.id },
        data: { studentId: null, dedupeHash: createHash('sha256').update(randomUUID()).digest('hex') }
      })
    }
    await tx.publicationCommentRevision.updateMany({ where: { actorStudentId: userId }, data: { actorStudentId: null } })
    const user = await tx.studentUser.update({
      where: { id: userId },
      data: {
        name: 'Usuario anónimo',
        firstNames: 'Usuario',
        lastNames: 'anónimo',
        email: `usuario-anonimo-${userId}@anonimo.invalid`,
        status: 'ELIMINADO',
        deletedAt,
        blockedUntil: null,
        reviewChannel: null
      }
    })
    await tx.studentCredential.deleteMany({ where: { userId } })
    const registrations = await tx.eventRegistration.findMany({ where: { email: current.email }, select: { id: true } })
    for (const registration of registrations) {
      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          fullName: 'Usuario anónimo',
          email: `usuario-anonimo-inscripcion-${registration.id}@anonimo.invalid`,
          phone: '0000000000'
        }
      })
    }
    await tx.studentAccountStatusHistory.create({ data: {
      studentId: userId, actorId: data.actorId, fromStatus: current.status, toStatus: 'ELIMINADO',
      reason: data.reason, blockedUntil: null, reviewChannel: null
    } })
    await tx.studentSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'ACCOUNT_DELETED' }
    })
    return { alreadyDeleted: false as const, user, originalEmail: current.email }
  })
}
