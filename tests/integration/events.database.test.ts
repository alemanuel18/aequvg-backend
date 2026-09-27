import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/shared/database/prisma'

const describeDatabase = process.env.EVENTS_DATABASE_TEST === 'true' ? describe : describe.skip
const runId = `events-test-${crypto.randomUUID()}`
const consentedAt = new Date('2026-09-26T12:34:56.789Z')
let roleId: number | undefined
let authorId = 0
let imageId = 0
let eventId = 0
let otherEventId = 0

const eventData = (maximumCapacity = 10) => ({
  createdById: authorId, name: 'Evento de prueba', description: 'Descripción de prueba',
  startsAt: new Date('2030-01-01T12:00:00.123Z'), location: 'Laboratorio de prueba', maximumCapacity
})
const registrationData = (email: string, targetEventId = eventId) => ({
  eventId: targetEventId, fullName: 'Persona ficticia', email, phone: '+502 0000 0000',
  consentedAt, privacyVersion: 'test-policy-v1'
})

describeDatabase('persistencia de eventos e inscripciones con PostgreSQL', () => {
  beforeAll(async () => {
    const role = await prisma.role.create({ data: { name: runId } })
    roleId = role.id
    const author = await prisma.administrativeUser.create({
      data: { roleId, name: 'Administrador ficticio', email: `${runId}@uvg.edu.gt` }
    })
    authorId = author.id
    const image = await prisma.file.create({ data: {
      uploadedById: authorId, originalName: 'test.png', storageKey: `${runId}/test.png`,
      mimeType: 'image/png', sizeBytes: 1n, sha256: '0'.repeat(64)
    } })
    imageId = image.id
    eventId = (await prisma.event.create({ data: eventData() })).id
    otherEventId = (await prisma.event.create({ data: eventData() })).id
  })

  afterAll(async () => {
    try {
      // El rol único limita la limpieza incluso si beforeAll falla parcialmente.
      if (roleId !== undefined) {
        await prisma.eventRegistration.deleteMany({ where: { event: { createdBy: { roleId } } } })
        await prisma.event.deleteMany({ where: { createdBy: { roleId } } })
        await prisma.file.deleteMany({ where: { uploadedBy: { roleId } } })
        await prisma.administrativeUser.deleteMany({ where: { roleId } })
        await prisma.role.delete({ where: { id: roleId } })
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  it('persiste un evento, sus fechas, defaults y relaciones opcionales', async () => {
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
    expect(event).toMatchObject({ ...eventData(), status: 'BORRADOR', imageId: null, additionalInformation: null })
    expect(event.id).toBeGreaterThan(0)
    expect(event.createdAt).toBeInstanceOf(Date)
    const withImage = await prisma.event.create({
      data: { ...eventData(1), imageId, additionalInformation: 'Información de prueba' },
      include: { createdBy: true, image: true, registrations: true }
    })
    expect(withImage.createdBy.id).toBe(authorId)
    expect(withImage.image?.id).toBe(imageId)
    expect(withImage.additionalInformation).toBe('Información de prueba')
    expect(withImage.registrations).toEqual([])
  })

  it.each([0, -1])('PostgreSQL rechaza capacidad %i por CHECK', async maximumCapacity => {
    // SQL directo demuestra el constraint de DB, sin depender de validación Prisma.
    await expect(prisma.$executeRaw`
      INSERT INTO evento (creado_por, nombre, descripcion, inicia_en, ubicacion, capacidad_maxima)
      VALUES (${authorId}, 'Prueba', 'Prueba', CURRENT_TIMESTAMP, 'Prueba', ${maximumCapacity})
    `).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } })
  })

  it('rechaza creador e imagen inexistentes mediante FK', async () => {
    await expect(prisma.event.create({ data: { ...eventData(), createdById: -1 } })).rejects.toMatchObject({ code: 'P2003' })
    await expect(prisma.event.create({ data: { ...eventData(), imageId: -1 } })).rejects.toMatchObject({ code: 'P2003' })
  })

  it('persiste datos personales, consentimiento, timestamps y relación con evento', async () => {
    const data = registrationData('valid@example.invalid')
    const registration = await prisma.eventRegistration.create({ data, include: { event: true } })
    expect(registration).toMatchObject({ ...data, status: 'CONFIRMADA' })
    expect(registration.id).toBeGreaterThan(0)
    expect(registration.registeredAt).toBeInstanceOf(Date)
    expect(registration.event.id).toBe(eventId)
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { registrations: true } })
    expect(event.registrations.map(item => item.id)).toContain(registration.id)
  })

  it.each([
    { label: 'consentimiento', consent: null, version: 'test-policy-v1' },
    { label: 'versión de privacidad', consent: consentedAt, version: null }
  ])('PostgreSQL exige $label aunque se omita Prisma', async ({ consent, version }) => {
    await expect(prisma.$executeRaw`
      INSERT INTO inscripcion_evento (id_evento, nombre_completo, correo, telefono, consentimiento_en, version_privacidad)
      VALUES (${eventId}, 'Persona ficticia', 'required@example.invalid', '+502 0000 0000', ${consent}, ${version})
    `).rejects.toMatchObject({ code: 'P2010', meta: { code: '23502' } })
  })

  it('rechaza inscripciones con evento inexistente', async () => {
    await expect(prisma.eventRegistration.create({ data: registrationData('fk@example.invalid', -1) }))
      .rejects.toMatchObject({ code: 'P2003' })
  })

  it('impide duplicados exactos y con distintas mayúsculas usando CITEXT', async () => {
    const original = await prisma.eventRegistration.create({ data: registrationData('Case@example.invalid') })
    for (const email of ['Case@example.invalid', 'case@EXAMPLE.INVALID']) {
      await expect(prisma.eventRegistration.create({ data: registrationData(email) })).rejects.toMatchObject({ code: 'P2002' })
    }
    const found = await prisma.eventRegistration.findUnique({
      where: { eventId_email: { eventId, email: 'CASE@EXAMPLE.INVALID' } }
    })
    expect(found?.id).toBe(original.id)
    const another = await prisma.eventRegistration.create({ data: registrationData('case@example.invalid', otherEventId) })
    expect(another.eventId).toBe(otherEventId)
  })

  it('mantiene la unicidad tras cancelar y permite reactivar el mismo registro', async () => {
    const registration = await prisma.eventRegistration.create({ data: registrationData('cancel@example.invalid') })
    await prisma.eventRegistration.update({ where: { id: registration.id }, data: { status: 'CANCELADA' } })
    await expect(prisma.eventRegistration.create({ data: registrationData('CANCEL@example.invalid') })).rejects.toMatchObject({ code: 'P2002' })
    const reactivated = await prisma.eventRegistration.update({ where: { id: registration.id }, data: { status: 'CONFIRMADA' } })
    expect(reactivated.id).toBe(registration.id)
    expect(reactivated.status).toBe('CONFIRMADA')
  })

  it('consulta y cuenta únicamente confirmadas del evento solicitado', async () => {
    const isolated = await prisma.event.create({ data: eventData() })
    const confirmed = await prisma.eventRegistration.create({ data: registrationData('confirmed@example.invalid', isolated.id) })
    await prisma.eventRegistration.create({ data: { ...registrationData('cancelled@example.invalid', isolated.id), status: 'CANCELADA' } })
    const where = { eventId: isolated.id, status: 'CONFIRMADA' as const }
    expect(await prisma.eventRegistration.count({ where })).toBe(1)
    expect((await prisma.eventRegistration.findMany({ where })).map(item => item.id)).toEqual([confirmed.id])
  })

  it('protege las relaciones con ON DELETE RESTRICT', async () => {
    const event = await prisma.event.create({ data: { ...eventData(), imageId } })
    await prisma.eventRegistration.create({ data: registrationData('restrict@example.invalid', event.id) })
    await expect(prisma.event.delete({ where: { id: event.id } })).rejects.toMatchObject({ code: 'P2003' })
    await expect(prisma.file.delete({ where: { id: imageId } })).rejects.toMatchObject({ code: 'P2003' })
    await expect(prisma.administrativeUser.delete({ where: { id: authorId } })).rejects.toMatchObject({ code: 'P2003' })
  })

  it('las migraciones crean índices para consultas públicas y conteo de confirmadas', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN ('evento', 'inscripcion_evento')
    `
    for (const [name, columns] of [
      ['evento_estado_inicia_en_idx', '(estado, inicia_en)'],
      ['evento_creado_por_idx', '(creado_por)'],
      ['evento_id_imagen_idx', '(id_imagen)'],
      ['inscripcion_evento_id_evento_estado_idx', '(id_evento, estado)'],
      ['inscripcion_evento_id_evento_correo_key', '(id_evento, correo)']
    ] as const) {
      expect(indexes.find(index => index.indexname === name)?.indexdef).toContain(columns)
    }
  })
})
