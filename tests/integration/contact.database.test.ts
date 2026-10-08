import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/shared/database/prisma'
import { createAdminSessionHeaders } from '../helpers/admin-session'

const emailMocks = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../src/modules/contact/services/contact-email.service', () => ({ contactEmailService: emailMocks }))

import { createApp } from '../../src/app'

const enabled = process.env.CONTACT_DATABASE_TEST === 'true'
const databaseDescribe = enabled ? describe : describe.skip
const runId = `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

databaseDescribe('Integración PostgreSQL del flujo de contacto', () => {
  const app = createApp()
  let roleId = 0
  let userId = 0
  let headers: Record<string, string>
  const createdMethodIds: number[] = []

  beforeAll(async () => {
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol aislado de contacto' } })
    roleId = role.id
    const user = await prisma.administrativeUser.create({ data: { roleId, name: 'Contacto integración', email: `${runId}@uvg.edu.gt` } })
    userId = user.id
    headers = await createAdminSessionHeaders(prisma, userId, roleId, ['CONTACT_MANAGE'])
  })

  afterAll(async () => {
    if (createdMethodIds.length) await prisma.contactMethod.deleteMany({ where: { id: { in: createdMethodIds } } })
    if (userId) {
      await prisma.administrativeSession.deleteMany({ where: { userId } })
      await prisma.administrativeUser.delete({ where: { id: userId } })
    }
    if (roleId) {
      await prisma.rolePermission.deleteMany({ where: { roleId } })
      await prisma.role.delete({ where: { id: roleId } })
    }
    await prisma.$disconnect()
  })

  it('persiste CRUD administrativo y refleja únicamente medios activos en público', async () => {
    const create = await app.handle(new Request('http://localhost/api/v1/admin/contact-methods', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'OTRO', label: `TikTok ${runId}`, value: `@${runId}`, url: `https://www.tiktok.com/@${runId}`, displayOrder: 90, active: true })
    }))
    expect(create.status).toBe(201)
    const created = await create.json() as { id: number }
    createdMethodIds.push(created.id)

    const publicBefore = await app.handle(new Request('http://localhost/api/v1/contact-methods'))
    expect((await publicBefore.json() as Array<{ id: number }>).some(item => item.id === created.id)).toBe(true)

    const update = await app.handle(new Request(`http://localhost/api/v1/admin/contact-methods/${created.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ type: 'OTRO', label: `YouTube ${runId}`, value: `@${runId}`, url: `https://www.youtube.com/@${runId}`, displayOrder: 91, active: true })
    }))
    expect(update.status).toBe(200)
    expect(await prisma.contactMethod.findUnique({ where: { id: created.id } })).toMatchObject({ label: `YouTube ${runId}`, displayOrder: 91 })

    const remove = await app.handle(new Request(`http://localhost/api/v1/admin/contact-methods/${created.id}`, { method: 'DELETE', headers }))
    expect(remove.status).toBe(200)
    expect(await prisma.contactMethod.findUnique({ where: { id: created.id } })).toMatchObject({ active: false })
    const publicAfter = await app.handle(new Request('http://localhost/api/v1/contact-methods'))
    expect((await publicAfter.json() as Array<{ id: number }>).some(item => item.id === created.id)).toBe(false)
  })

  it('entrega el POST público al correo configurable sin crear una solicitud persistida', async () => {
    const emailMethod = await prisma.contactMethod.create({ data: { type: 'EMAIL', label: `Correo ${runId}`, value: `${runId}@uvg.edu.gt`, displayOrder: 0, active: true } })
    createdMethodIds.push(emailMethod.id)
    const before = await prisma.contactRequest.count()
    const response = await app.handle(new Request('http://localhost/api/v1/contact-requests', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': runId },
      body: JSON.stringify({ name: 'Persona prueba', email: 'persona@example.com', phone: '+502 5555 5555', type: 'CONSULTA', subject: 'Información', message: 'Mensaje de integración válido.', consent: true, privacyVersion: '2026-10' })
    }))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true })
    expect(emailMocks.send).toHaveBeenCalledWith(`${runId}@uvg.edu.gt`, expect.objectContaining({ email: 'persona@example.com' }))
    expect(await prisma.contactRequest.count()).toBe(before)
  })
})
