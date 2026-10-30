import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ApprovedModerationPolicy } from '../../src/modules/moderation/services/moderation-policy'
import { moderationRepository } from '../../src/modules/moderation/repositories/moderation.repository'
import { moderationService } from '../../src/modules/moderation/services/moderation.service'
import { clearRateLimitsForTests } from '../../src/middleware/rate-limit'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { hashPassword } from '../../src/shared/utils/auth-crypto'
import { createAdminSessionHeaders } from '../helpers/admin-session'
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
    { after: 2, action: 'TEMPORARY', durationHours: 1 },
    { after: 3, action: 'PERMANENT' }
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
  let adminHeaders: Record<string, string> = {}
  const studentEmail = `${runId}@uvg.edu.gt`
  const studentPassword = 'Moderacion-Prueba-2026!'
  const browserAgent = 'AEQUVG-Moderation-Integration-Test/1.0'
  const app = createApp()

  beforeAll(async () => {
    moderationService.registerPolicyProvider({ getApprovedPolicy: () => policy })
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal de moderación.' } })
    roleId = role.id
    const admin = await prisma.administrativeUser.create({ data: {
      roleId, name: 'Admin moderación', email: `${runId}-admin@uvg.edu.gt`, status: 'ACTIVO'
    } })
    adminId = admin.id
    adminHeaders = await createAdminSessionHeaders(prisma, adminId, roleId, ['USERS_MANAGE'])
    const student = await prisma.studentUser.create({ data: {
      name: 'Estudiante Moderación', firstNames: 'Estudiante', lastNames: 'Moderación', email: studentEmail,
      credential: { create: { passwordHash: await hashPassword(studentPassword) } }
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
      if (eventId) await prisma.eventRegistration.deleteMany({ where: { eventId } })
      if (eventId) await prisma.publicationComment.deleteMany({ where: { eventId } })
      if (eventId) await prisma.event.delete({ where: { id: eventId } })
      if (studentId) await prisma.studentAccountStatusHistory.deleteMany({ where: { studentId } })
      if (studentId) await prisma.studentSession.deleteMany({ where: { userId: studentId } })
      if (studentId) await prisma.studentCredential.deleteMany({ where: { userId: studentId } })
      if (studentId) await prisma.studentUser.delete({ where: { id: studentId } })
      if (adminId) await prisma.administrativeSession.deleteMany({ where: { userId: adminId } })
      if (adminId) await prisma.administrativeUser.delete({ where: { id: adminId } })
      if (roleId) await prisma.rolePermission.deleteMany({ where: { roleId } })
      if (roleId) await prisma.role.delete({ where: { id: roleId } })
    } finally {
      moderationService.useEnvironmentPolicyProvider()
      await prisma.$disconnect()
    }
  })

  it('escala una sola vez en concurrencia, protege rutas bloqueadas, expira solo temporales y audita el desbloqueo admin', async () => {
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
    const concurrentComments = await Promise.all([flaggedComment(), flaggedComment()])
    const commentResults = await Promise.all(concurrentComments.map(async response => ({ status: response.status, body: await response.json() })))
    expect(commentResults.every(result => result.status === 403 || result.status === 401)).toBe(true)
    expect(commentResults.some(result => result.body.error?.code === 'ACCOUNT_TEMPORARILY_BLOCKED')).toBe(true)
    expect(await prisma.publicationComment.count({ where: { eventId } })).toBe(0)
    expect(await prisma.moderationIncident.count({ where: { studentId } })).toBe(2)
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({ moderationViolationCount: 2, status: 'BLOQUEADO_TEMPORAL' })
    expect(await prisma.moderationIncident.findFirstOrThrow({ where: { studentId, source: 'COMMENT_CREATE' }, orderBy: { id: 'desc' } }))
      .toMatchObject({ occurrenceNumber: 2, sanction: 'TEMPORARY', policyVersion: policy.version })
    expect((await prisma.studentSession.findMany({ where: { userId: studentId } })).every(session => session.revocationReason === 'MODERATION_SANCTION')).toBe(true)
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId, toStatus: 'BLOQUEADO_TEMPORAL' } })).toBe(1)

    const issuedTokenAfterBlock = await app.handle(new Request('http://localhost/api/v1/student-auth/me', { headers: studentHeaders }))
    expect(issuedTokenAfterBlock.status).toBe(401)
    const commentsBeforeBlockAttempt = await prisma.publicationComment.count({ where: { studentId, eventId } })
    const commentDuringBlock = await app.handle(new Request(`http://localhost/api/v1/publications/EVENTO/${eventId}/comments`, {
      method: 'POST', headers: { ...studentHeaders, 'idempotency-key': 'comment-during-block' },
      body: JSON.stringify({ content: 'Comentario durante el bloqueo' })
    }))
    expect(commentDuringBlock.status).toBe(401)
    expect(await prisma.publicationComment.count({ where: { studentId, eventId } })).toBe(commentsBeforeBlockAttempt)

    const registrationsBeforeBlockAttempt = await prisma.eventRegistration.count({ where: { studentId, eventId } })
    const registrationDuringBlock = await app.handle(new Request(`http://localhost/api/v1/events/${eventId}/registrations`, {
      method: 'POST', headers: studentHeaders,
      body: JSON.stringify({ firstNames: 'Estudiante', lastNames: 'Moderación', email: studentEmail, phone: '+502 5555 1234', consent: true, privacyVersion: '1.0' })
    }))
    expect(registrationDuringBlock.status).toBe(401)
    expect(await prisma.eventRegistration.count({ where: { studentId, eventId } })).toBe(registrationsBeforeBlockAttempt)

    const unauthorizedUnlock = await app.handle(new Request(`http://localhost/api/v1/admin/student-users/${studentId}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVO', reason: 'Intento sin sesión administrativa' })
    }))
    expect(unauthorizedUnlock.status).toBe(401)
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({ status: 'BLOQUEADO_TEMPORAL' })

    const temporaryUnlock = await app.handle(new Request(`http://localhost/api/v1/admin/student-users/${studentId}/status`, {
      method: 'PATCH', headers: adminHeaders,
      body: JSON.stringify({ status: 'ACTIVO', reason: 'Revisión administrativa de bloqueo temporal' })
    }))
    expect(temporaryUnlock.status).toBe(200)
    const temporaryUnlockHistory = await prisma.studentAccountStatusHistory.findFirstOrThrow({ where: { studentId }, orderBy: { id: 'desc' } })
    expect(temporaryUnlockHistory).toMatchObject({ actorId: adminId, fromStatus: 'BLOQUEADO_TEMPORAL', toStatus: 'ACTIVO', reason: 'Revisión administrativa de bloqueo temporal' })
    expect((await app.handle(new Request('http://localhost/api/v1/student-auth/me', { headers: studentHeaders }))).status).toBe(401)
    studentHeaders = await createStudentSessionHeaders(prisma, studentId)
    const offensiveProfile = await app.handle(new Request('http://localhost/api/v1/student-auth/me', {
      method: 'PATCH', headers: { ...studentHeaders, 'idempotency-key': 'profile-attempt-3' },
      body: JSON.stringify({ firstNames: 'Insulto', lastNames: 'Estudiante' })
    }))
    expect(offensiveProfile.status).toBe(403)
    expect((await offensiveProfile.json()).error.code).toBe('ACCOUNT_PERMANENTLY_BLOCKED')
    expect((await prisma.moderationIncident.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } })).at(-1))
      .toMatchObject({ occurrenceNumber: 3, sanction: 'PERMANENT', reviewChannel: policy.permanentReviewChannel })
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({ status: 'BLOQUEADO_PERMANENTE' })
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId, toStatus: 'BLOQUEADO_PERMANENTE' } })).toBe(1)

    const historyBeforePermanentExpiryProbe = await prisma.studentAccountStatusHistory.count({ where: { studentId } })
    const permanentLogin = await app.handle(new Request('http://localhost/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: studentEmail, password: studentPassword })
    }))
    expect(permanentLogin.status).toBe(403)
    expect((await permanentLogin.json()).error.code).toBe('ACCOUNT_PERMANENTLY_BLOCKED')
    expect(await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })).toMatchObject({ status: 'BLOQUEADO_PERMANENTE', blockedUntil: null })
    expect(await prisma.studentAccountStatusHistory.count({ where: { studentId } })).toBe(historyBeforePermanentExpiryProbe)

    const permanentUnlock = await app.handle(new Request(`http://localhost/api/v1/admin/student-users/${studentId}/status`, {
      method: 'PATCH', headers: adminHeaders,
      body: JSON.stringify({ status: 'ACTIVO', reason: 'Revisión administrativa de bloqueo permanente' })
    }))
    expect(permanentUnlock.status).toBe(200)
    const permanentUnlockHistory = await prisma.studentAccountStatusHistory.findFirstOrThrow({ where: { studentId }, orderBy: { id: 'desc' } })
    expect(permanentUnlockHistory).toMatchObject({ actorId: adminId, fromStatus: 'BLOQUEADO_PERMANENTE', toStatus: 'ACTIVO', reason: 'Revisión administrativa de bloqueo permanente' })
    expect((await app.handle(new Request('http://localhost/api/v1/student-auth/me', { headers: studentHeaders }))).status).toBe(401)

    await prisma.studentUser.update({ where: { id: studentId }, data: { status: 'BLOQUEADO_TEMPORAL', blockedUntil: new Date(Date.now() - 1000), reviewChannel: null } })
    const expiredLogin = await app.handle(new Request('http://localhost/api/v1/student-auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': browserAgent },
      body: JSON.stringify({ email: studentEmail, password: studentPassword })
    }))
    expect(expiredLogin.status).toBe(200)
    const expired = await prisma.studentUser.findUniqueOrThrow({ where: { id: studentId } })
    expect(expired).toMatchObject({ status: 'ACTIVO', moderationViolationCount: 0 })
    const incidents = await prisma.moderationIncident.findMany({ where: { studentId } })
    expect(incidents.every(incident => !incident.countsTowardReincidence)).toBe(true)
    expect(incidents.some(incident => incident.evidenceHash === '2'.repeat(64))).toBe(true)
    expect(JSON.stringify(incidents)).not.toContain('insulto')
    const transitions = await prisma.studentAccountStatusHistory.findMany({ where: { studentId } })
    expect(transitions.some(item => item.fromStatus === 'BLOQUEADO_TEMPORAL' && item.toStatus === 'ACTIVO' && item.reason.includes('Contador MOD:'))).toBe(true)
    const cookies = expiredLogin.headers.get('set-cookie') ?? ''
    const reauthenticatedCookies = `${cookies.match(/aequvg_student_session=[^;]+/)?.[0]}; ${cookies.match(/aequvg_student_device=[^;]+/)?.[0]}`
    const reauthenticated = await app.handle(new Request('http://localhost/api/v1/student-auth/me', {
      headers: { cookie: reauthenticatedCookies, 'user-agent': browserAgent }
    }))
    expect(reauthenticated.status).toBe(200)
  })
})
