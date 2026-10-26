import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ApprovedModerationPolicy } from '../../src/modules/moderation/services/moderation-policy'
import { moderationRepository } from '../../src/modules/moderation/repositories/moderation.repository'
import { moderationService } from '../../src/modules/moderation/services/moderation.service'
import { studentAuthService } from '../../src/modules/users/services/student-auth.service'
import { clearRateLimitsForTests } from '../../src/middleware/rate-limit'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { createStudentSessionHeaders } from '../helpers/student-session'

const runDatabaseTests = process.env.MODERATION_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `moderation-test-${Date.now()}`
const policy: ApprovedModerationPolicy = {
  approved: true,
  version: `${runId}-policy`,
  approvedBy: 'Aprobación de fixture de integración',
  approvedAt: new Date().toISOString(),
  recurrenceWindowHours: 24,
  blockedTerms: [
    { id: 'TEST-COMMENT', scope: 'COMMENT', term: 'insulto' },
    { id: 'TEST-NAME', scope: 'NAME', term: 'insulto' }
  ],
  exceptions: [],
  sanctions: [
    { after: 3, action: 'TEMPORARY', durationHours: 1 },
    { after: 4, action: 'PERMANENT' }
  ],
  manualUnlockEffect: 'PRESERVE',
  expiryEffect: 'RESET',
  permanentReviewChannel: 'revisión de integración'
}

describeDatabase('motor de sanciones con PostgreSQL', () => {
  let studentId = 0
  let adminId = 0
  let roleId = 0
  let eventId = 0
  let studentHeaders: Record<string, string>
  const app = createApp()

  beforeAll(async () => {
    moderationService.registerPolicyProvider({ getApprovedPolicy: () => policy })
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal de moderación.' } })
    roleId = role.id
    const admin = await prisma.administrativeUser.create({ data: {
      roleId, name: 'Admin moderación', email: `${runId}-admin@uvg.edu.gt`, status: 'ACTIVO'
    } })
    adminId = admin.id
    const student = await prisma.studentUser.create({ data: {
      name: 'Estudiante Moderación', firstNames: 'Estudiante', lastNames: 'Moderación', email: `${runId}@uvg.edu.gt`
    } })
    studentId = student.id
    studentHeaders = await createStudentSessionHeaders(prisma, studentId)
    const event = await prisma.event.create({ data: {
      createdById: adminId, name: `${runId}-event`, description: 'Destino temporal de prueba MOD.',
      startsAt: new Date(Date.now() + 86400000), location: 'UVG', maximumCapacity: 10, status: 'PUBLICADO'
    } })
    eventId = event.id
  })

  afterAll(async () => {
    try {
      if (studentId) await prisma.moderationIncident.deleteMany({ where: { studentId } })
      if (eventId) await prisma.publicationComment.deleteMany({ where: { eventId } })
      if (eventId) await prisma.event.delete({ where: { id: eventId } })
      if (studentId) await prisma.studentAccountStatusHistory.deleteMany({ where: { studentId } })
      if (studentId) await prisma.studentSession.deleteMany({ where: { userId: studentId } })
      if (studentId) await prisma.studentUser.delete({ where: { id: studentId } })
      if (adminId) await prisma.administrativeUser.delete({ where: { id: adminId } })
      if (roleId) await prisma.role.delete({ where: { id: roleId } })
    } finally {
      moderationService.useEnvironmentPolicyProvider()
      await prisma.$disconnect()
    }
  })

  it('cuenta una vez por operación, aplica sanciones progresivas y revoca sesiones', async () => {
    clearRateLimitsForTests()
    const firstOperation = {
      studentId, operationKey: '1'.repeat(64), source: 'COMMENT_CREATE' as const,
      scope: 'COMMENT' as const, policy, ruleId: 'TEST-COMMENT', evidenceHash: '2'.repeat(64)
    }
    const retries = await Promise.all([
      moderationRepository.recordViolation(firstOperation),
      moderationRepository.recordViolation(firstOperation)
    ])
    expect(retries.map(result => result.occurrenceNumber)).toEqual([1, 1])
    expect(retries.filter(result => result.duplicate)).toHaveLength(1)
    expect(await prisma.moderationIncident.count({ where: { studentId } })).toBe(1)
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({
      moderationViolationCount: 1, status: 'ACTIVO'
    })

    const flaggedComment = () => app.handle(new Request(`http://localhost/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: { ...studentHeaders, 'idempotency-key': 'comment-attempt-2' },
      body: JSON.stringify({ content: 'insulto' })
    }))
    const rejectedComment = await flaggedComment()
    expect(rejectedComment.status).toBe(422)
    expect((await rejectedComment.json()).error.code).toBe('COMMENT_REJECTED_BY_MODERATION')
    expect(await prisma.publicationComment.count({ where: { eventId } })).toBe(0)
    const retryComment = await flaggedComment()
    expect(retryComment.status).toBe(422)
    expect(await prisma.moderationIncident.count({ where: { studentId } })).toBe(2)
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({ moderationViolationCount: 2, status: 'ACTIVO' })

    const sanctioningComment = await app.handle(new Request(`http://localhost/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: { ...studentHeaders, 'idempotency-key': 'comment-attempt-3' },
      body: JSON.stringify({ content: 'insulto' })
    }))
    expect(sanctioningComment.status).toBe(403)
    expect((await sanctioningComment.json()).error.code).toBe('ACCOUNT_TEMPORARILY_BLOCKED')
    expect(await prisma.publicationComment.count({ where: { eventId } })).toBe(0)
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({ status: 'BLOQUEADO_TEMPORAL' })
    expect((await prisma.studentSession.findMany({ where: { userId: studentId } })).every(session => session.revocationReason === 'MODERATION_SANCTION')).toBe(true)

    await studentAuthService.updateStatus(studentId, { status: 'ACTIVO', reason: 'Desbloqueo de prueba' }, adminId)
    studentHeaders = await createStudentSessionHeaders(prisma, studentId)
    const offensiveProfile = await app.handle(new Request('http://localhost/api/v1/student-auth/me', {
      method: 'PATCH', headers: { ...studentHeaders, 'idempotency-key': 'profile-attempt-4' },
      body: JSON.stringify({ firstNames: 'Insulto', lastNames: 'Estudiante' })
    }))
    expect(offensiveProfile.status).toBe(403)
    expect((await offensiveProfile.json()).error.code).toBe('ACCOUNT_PERMANENTLY_BLOCKED')
    expect((await prisma.moderationIncident.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } })).at(-1))
      .toMatchObject({ occurrenceNumber: 4, sanction: 'PERMANENT', reviewChannel: policy.permanentReviewChannel })
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({ status: 'BLOQUEADO_PERMANENTE' })

    await studentAuthService.updateStatus(studentId, { status: 'ACTIVO', reason: 'Revisión administrativa de prueba' }, adminId)
    await prisma.studentUser.update({ where: { id: studentId }, data: { status: 'BLOQUEADO_TEMPORAL', blockedUntil: new Date(Date.now() - 1000) } })
    const expired = await moderationService.applyExpiry(studentId)
    expect(expired).toMatchObject({ status: 'ACTIVO', moderationViolationCount: 0 })
    const incidents = await prisma.moderationIncident.findMany({ where: { studentId } })
    expect(incidents.every(incident => !incident.countsTowardReincidence)).toBe(true)
    expect(incidents.some(incident => incident.evidenceHash === '2'.repeat(64))).toBe(true)
    expect(JSON.stringify(incidents)).not.toContain('insulto')
    const transitions = await prisma.studentAccountStatusHistory.findMany({ where: { studentId } })
    expect(transitions.some(item => item.fromStatus === 'BLOQUEADO_TEMPORAL' && item.toStatus === 'ACTIVO' && item.reason.includes('Contador MOD:'))).toBe(true)
  })
})
