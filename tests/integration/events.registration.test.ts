import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { clearRateLimitsForTests } from '../../src/middleware/rate-limit'
import { prisma } from '../../src/shared/database/prisma'

const runDatabaseTests = process.env.EVENTS_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `events-reg-test-${Date.now()}`
const adminKey = 'events-reg-test-admin-key'
let roleId: number
let authorId = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const adminHeaders = { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' }

const baseRegistrationPayload = (overrides: Record<string, unknown> = {}) => ({
  fullName: 'Estudiante Ejemplo',
  email: `${runId}-attendee@uvg.edu.gt`,
  phone: '+502 5555 1234',
  consent: true,
  privacyVersion: '1.0',
  ...overrides
})

describeDatabase('Inscripción pública a eventos con PostgreSQL (SCRUM-97, SCRUM-124, SCRUM-127)', () => {
  const app = createApp()

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = adminKey

    const role = await prisma.role.create({
      data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de inscripción a eventos.' }
    })
    roleId = role.id

    const author = await prisma.administrativeUser.create({
      data: { roleId, name: 'Organizador de eventos', email: `${runId}@uvg.edu.gt`, status: 'ACTIVO' }
    })
    authorId = author.id
  })

  afterAll(async () => {
    try {
      if (roleId) {
        await prisma.eventRegistration.deleteMany({ where: { event: { createdBy: { roleId } } } })
        await prisma.event.deleteMany({ where: { createdBy: { roleId } } })
        await prisma.administrativeUser.deleteMany({ where: { roleId } })
        await prisma.role.delete({ where: { id: roleId } })
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  beforeEach(() => {
    clearRateLimitsForTests()
  })

  const createEvent = async (overrides: Record<string, unknown> = {}) => {
    return prisma.event.create({
      data: {
        createdById: authorId,
        name: `Evento de prueba ${Date.now()}`,
        description: 'Descripción completa para evento de prueba.',
        startsAt: new Date(Date.now() + 86400000 * 30), // En 30 días
        location: 'Auditorio UVG',
        maximumCapacity: 50,
        status: 'PUBLICADO',
        ...overrides
      }
    })
  }

  describe('Happy path y contrato seguro sin PII', () => {
    it('inscribe a un participante en un evento publicado y devuelve contrato seguro sin PII', async () => {
      const event = await createEvent({ maximumCapacity: 10 })

      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload())
        })
      )

      expect(response.status).toBe(201)
      const body = (await response.json()) as {
        id: number
        eventId: number
        status: string
        registeredAt: string
      }

      expect(body).toHaveProperty('id')
      expect(body.eventId).toBe(event.id)
      expect(body.status).toBe('CONFIRMADA')
      expect(body.registeredAt).toBeDefined()

      // Verificación estricta de NO exposición de PII
      expect(body).not.toHaveProperty('fullName')
      expect(body).not.toHaveProperty('email')
      expect(body).not.toHaveProperty('phone')
      expect(body).not.toHaveProperty('consent')
      expect(body).not.toHaveProperty('consentedAt')
      expect(body).not.toHaveProperty('privacyVersion')

      // Verificación en base de datos
      const inDb = await prisma.eventRegistration.findUnique({
        where: { id: body.id }
      })
      expect(inDb).not.toBeNull()
      expect(inDb?.eventId).toBe(event.id)
      expect(inDb?.status).toBe('CONFIRMADA')
      expect(inDb?.fullName).toBe('Estudiante Ejemplo')
      expect(inDb?.email).toBe(`${runId}-attendee@uvg.edu.gt`)
      expect(inDb?.phone).toBe('+502 5555 1234')
      expect(inDb?.privacyVersion).toBe('1.0')
      expect(inDb?.consentedAt).toBeInstanceOf(Date)
    })

    it('exige teléfono obligatorio según el esquema de persistencia', async () => {
      const event = await createEvent()
      const payload = baseRegistrationPayload({ email: `${runId}-nophone@uvg.edu.gt` })
      delete (payload as { phone?: unknown }).phone

      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('normaliza correo a minúsculas y limpia espacios en el nombre', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            baseRegistrationPayload({
              fullName: '  Juan   Pérez  García  ',
              email: `${runId.toUpperCase()}-NORMALIZED@UVG.EDU.GT`,
              phone: '  +502  5555  1234  '
            })
          )
        })
      )

      expect(response.status).toBe(201)
      const body = (await response.json()) as { id: number }

      const inDb = await prisma.eventRegistration.findUnique({ where: { id: body.id } })
      expect(inDb?.fullName).toBe('Juan Pérez García')
      expect(inDb?.email).toBe(`${runId}-normalized@uvg.edu.gt`)
      expect(inDb?.phone).toBe('+502 5555 1234')
    })
  })

  describe('Validaciones y Honeypot', () => {
    it('rechaza nombre completo vacío con 422 VALIDATION_ERROR', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ fullName: ' ' }))
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rechaza correo con formato inválido con 422 VALIDATION_ERROR', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ email: 'correo-invalido' }))
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rechaza teléfono menor al mínimo con 422 VALIDATION_ERROR', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ phone: '123' }))
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rechaza consentimiento false o faltante con 422 VALIDATION_ERROR', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ consent: false }))
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rechaza versión de política de privacidad vacía con 422 VALIDATION_ERROR', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ privacyVersion: '' }))
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rechaza versión de política de privacidad con solo espacios con 422 INVALID_PRIVACY_VERSION', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ privacyVersion: '   ' }))
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('INVALID_PRIVACY_VERSION')
    })

    it('rechaza solicitud con honeypot completado con 400 INVALID_REQUEST', async () => {
      const event = await createEvent()
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ website: 'http://spam-bot.xyz' }))
        })
      )

      expect(response.status).toBe(400)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('INVALID_REQUEST')
    })
  })

  describe('Ciclo de vida y visibilidad de eventos', () => {
    it('devuelve 404 EVENT_NOT_FOUND para evento inexistente', async () => {
      const response = await app.handle(
        request('/api/v1/events/9999999/registrations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload())
        })
      )

      expect(response.status).toBe(404)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('EVENT_NOT_FOUND')
    })

    it('devuelve 404 EVENT_NOT_FOUND si el evento está en BORRADOR', async () => {
      const event = await createEvent({ status: 'BORRADOR' })
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload())
        })
      )

      expect(response.status).toBe(404)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('EVENT_NOT_FOUND')
    })

    it('devuelve 404 EVENT_NOT_FOUND si el evento está en ARCHIVADO', async () => {
      const event = await createEvent({ status: 'ARCHIVADO' })
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload())
        })
      )

      expect(response.status).toBe(404)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('EVENT_NOT_FOUND')
    })

    it('devuelve 422 EVENT_NOT_OPEN si el evento está CANCELADO', async () => {
      const event = await createEvent({ status: 'CANCELADO' })
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload())
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('EVENT_NOT_OPEN')
    })

    it('devuelve 422 EVENT_NOT_OPEN si el evento está FINALIZADO', async () => {
      const event = await createEvent({ status: 'FINALIZADO' })
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload())
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('EVENT_NOT_OPEN')
    })

    it('devuelve 422 EVENT_ALREADY_STARTED si el evento ya inició en el pasado', async () => {
      const event = await createEvent({
        status: 'PUBLICADO',
        startsAt: new Date(Date.now() - 3600000) // Hace 1 hora
      })
      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload())
        })
      )

      expect(response.status).toBe(422)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('EVENT_ALREADY_STARTED')
    })
  })

  describe('Prevención de duplicados por correo', () => {
    it('devuelve 409 ALREADY_REGISTERED al intentar inscribir el mismo correo dos veces', async () => {
      const event = await createEvent()
      const email = `${runId}-dup@uvg.edu.gt`

      const res1 = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ email }))
        })
      )
      expect(res1.status).toBe(201)

      const res2 = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ email }))
        })
      )
      expect(res2.status).toBe(409)
      const body2 = (await res2.json()) as { error: { code: string } }
      expect(body2.error.code).toBe('ALREADY_REGISTERED')
    })

    it('detecta duplicado con variaciones de mayúsculas/minúsculas', async () => {
      const event = await createEvent()
      const res1 = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ email: 'estudiante.ci@uvg.edu.gt' }))
        })
      )
      expect(res1.status).toBe(201)

      const res2 = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ email: 'ESTUDIANTE.CI@UVG.EDU.GT' }))
        })
      )
      expect(res2.status).toBe(409)
      const body2 = (await res2.json()) as { error: { code: string } }
      expect(body2.error.code).toBe('ALREADY_REGISTERED')
    })

    it('devuelve 409 ALREADY_REGISTERED si el usuario tenía una inscripción previa CANCELADA', async () => {
      const event = await createEvent()
      const email = `${runId}-cancelled-user@uvg.edu.gt`

      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Usuario Cancelado',
          email,
          phone: '+502 5555 1234',
          status: 'CANCELADA',
          privacyVersion: '1.0',
          consentedAt: new Date()
        }
      })

      const response = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(baseRegistrationPayload({ email }))
        })
      )

      expect(response.status).toBe(409)
      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('ALREADY_REGISTERED')
    })
  })

  describe('Control de cupos y Rate Limit', () => {
    it('devuelve 409 EVENT_FULL cuando el cupo está completamente lleno', async () => {
      const event = await createEvent({ maximumCapacity: 1 })

      const res1 = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
          body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-p1@uvg.edu.gt` }))
        })
      )
      expect(res1.status).toBe(201)

      const res2 = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.2' },
          body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-p2@uvg.edu.gt` }))
        })
      )
      expect(res2.status).toBe(409)
      const body2 = (await res2.json()) as { error: { code: string } }
      expect(body2.error.code).toBe('EVENT_FULL')
    })

    it('aplica rate limiting tras superar el umbral por IP', async () => {
      const event = await createEvent({ maximumCapacity: 100 })
      const ip = '198.51.100.42'

      for (let i = 0; i < 5; i++) {
        const res = await app.handle(
          request(`/api/v1/events/${event.id}/registrations`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
            body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-rate-${i}@uvg.edu.gt` }))
          })
        )
        expect(res.status).toBe(201)
      }

      const blockedRes = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-rate-overflow@uvg.edu.gt` }))
        })
      )
      expect(blockedRes.status).toBe(429)
      const blockedBody = (await blockedRes.json()) as { error: { code: string } }
      expect(blockedBody.error.code).toBe('RATE_LIMITED')
    })
  })

  describe('Concurrencia real y control atómico de cupos con SELECT ... FOR UPDATE', () => {
    it('Caso 1: Cupo 1 vs 10 solicitudes concurrentes (exactamente 1 éxito y 9 EVENT_FULL)', async () => {
      const event = await createEvent({ maximumCapacity: 1 })
      const concurrency = 10

      const promises = Array.from({ length: concurrency }, (_, i) => {
        return app.handle(
          request(`/api/v1/events/${event.id}/registrations`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': `172.16.1.${i + 1}`
            },
            body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-c1-user-${i}@uvg.edu.gt` }))
          })
        )
      })

      const responses = await Promise.all(promises)
      const statuses = responses.map(r => r.status)

      const successCount = statuses.filter(s => s === 201).length
      const fullCount = statuses.filter(s => s === 409).length

      expect(successCount).toBe(1)
      expect(fullCount).toBe(9)

      for (const res of responses) {
        if (res.status === 409) {
          const body = (await res.json()) as { error: { code: string } }
          expect(body.error.code).toBe('EVENT_FULL')
        }
      }

      const countInDb = await prisma.eventRegistration.count({
        where: { eventId: event.id }
      })
      expect(countInDb).toBe(1)
    })

    it('Caso 2: Cupo 5 vs 20 solicitudes concurrentes (exactamente 5 éxitos y 15 EVENT_FULL)', async () => {
      const event = await createEvent({ maximumCapacity: 5 })
      const concurrency = 20

      const promises = Array.from({ length: concurrency }, (_, i) => {
        return app.handle(
          request(`/api/v1/events/${event.id}/registrations`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': `172.16.2.${i + 1}`
            },
            body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-c2-user-${i}@uvg.edu.gt` }))
          })
        )
      })

      const responses = await Promise.all(promises)
      const statuses = responses.map(r => r.status)

      const successCount = statuses.filter(s => s === 201).length
      const fullCount = statuses.filter(s => s === 409).length

      expect(successCount).toBe(5)
      expect(fullCount).toBe(15)

      for (const res of responses) {
        if (res.status === 409) {
          const body = (await res.json()) as { error: { code: string } }
          expect(body.error.code).toBe('EVENT_FULL')
        }
      }

      const countInDb = await prisma.eventRegistration.count({
        where: { eventId: event.id }
      })
      expect(countInDb).toBe(5)
    })

    it('Caso 3: Mismo correo concurrente (5 solicitudes simultáneas: exactamente 1 éxito y 4 ALREADY_REGISTERED)', async () => {
      const event = await createEvent({ maximumCapacity: 10 })
      const concurrency = 5
      const sharedEmail = `${runId}-same-email@uvg.edu.gt`

      const promises = Array.from({ length: concurrency }, (_, i) => {
        return app.handle(
          request(`/api/v1/events/${event.id}/registrations`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': `172.16.3.${i + 1}`
            },
            body: JSON.stringify(baseRegistrationPayload({ email: sharedEmail }))
          })
        )
      })

      const responses = await Promise.all(promises)
      const statuses = responses.map(r => r.status)

      const successCount = statuses.filter(s => s === 201).length
      const dupCount = statuses.filter(s => s === 409).length

      expect(successCount).toBe(1)
      expect(dupCount).toBe(4)

      for (const res of responses) {
        if (res.status === 409) {
          const body = (await res.json()) as { error: { code: string } }
          expect(body.error.code).toBe('ALREADY_REGISTERED')
        }
      }

      const countInDb = await prisma.eventRegistration.count({
        where: { eventId: event.id }
      })
      expect(countInDb).toBe(1)
    })

    it('Caso 4: Carrera entre reducción de cupo por Admin e Inscripción pública (invariante: cupo >= inscripciones)', async () => {
      const event = await createEvent({ maximumCapacity: 2 })

      const preRes = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '172.16.4.1' },
          body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-initial@uvg.edu.gt` }))
        })
      )
      expect(preRes.status).toBe(201)

      const [adminRes, publicRes] = await Promise.all([
        app.handle(
          request(`/api/v1/admin/events/${event.id}`, {
            method: 'PUT',
            headers: adminHeaders,
            body: JSON.stringify({ maximumCapacity: 1 })
          })
        ),
        app.handle(
          request(`/api/v1/events/${event.id}/registrations`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': '172.16.4.2' },
            body: JSON.stringify(baseRegistrationPayload({ email: `${runId}-racer@uvg.edu.gt` }))
          })
        )
      ])

      if (adminRes.status === 200) {
        expect(publicRes.status).toBe(409)
        const publicBody = (await publicRes.json()) as { error: { code: string } }
        expect(publicBody.error.code).toBe('EVENT_FULL')
      } else {
        expect(adminRes.status).toBe(422)
        const adminBody = (await adminRes.json()) as { error: { code: string } }
        expect(adminBody.error.code).toBe('CAPACITY_BELOW_REGISTRATIONS')
        expect(publicRes.status).toBe(201)
      }

      const freshEvent = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
      const confirmedCount = await prisma.eventRegistration.count({
        where: { eventId: event.id, status: 'CONFIRMADA' }
      })
      expect(freshEvent.maximumCapacity).toBeGreaterThanOrEqual(confirmedCount)
    })
  })

  describe('Consulta administrativa de participantes de eventos (SCRUM-128)', () => {
    it('requiere autorización administrativa (401 si falta o es incorrecta)', async () => {
      const event = await createEvent()

      const noAuthRes = await app.handle(request(`/api/v1/admin/events/${event.id}/registrations`))
      expect(noAuthRes.status).toBe(401)
      const noAuthBody = (await noAuthRes.json()) as { error: { code: string } }
      expect(noAuthBody.error.code).toBe('UNAUTHORIZED')

      const badAuthRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations`, {
          headers: { authorization: 'Bearer clave-invalida' }
        })
      )
      expect(badAuthRes.status).toBe(401)
      const badAuthBody = (await badAuthRes.json()) as { error: { code: string } }
      expect(badAuthBody.error.code).toBe('UNAUTHORIZED')

      const okRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations`, { headers: adminHeaders })
      )
      expect(okRes.status).toBe(200)
    })

    it('devuelve 404 EVENT_NOT_FOUND si el evento no existe', async () => {
      const res = await app.handle(
        request('/api/v1/admin/events/999999/registrations', { headers: adminHeaders })
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('EVENT_NOT_FOUND')
    })

    it('permite consultar participantes para eventos en cualquier estado (ej. CANCELADO o ARCHIVADO)', async () => {
      const eventCancelled = await createEvent({ status: 'CANCELADO' })
      await prisma.eventRegistration.create({
        data: {
          eventId: eventCancelled.id,
          fullName: 'Participante Cancelado',
          email: `${runId}-canc@uvg.edu.gt`,
          phone: '+502 5555 9999',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0'
        }
      })

      const res = await app.handle(
        request(`/api/v1/admin/events/${eventCancelled.id}/registrations`, { headers: adminHeaders })
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { items: Array<{ id: number; fullName: string }>; pagination: { total: number } }
      expect(body.pagination.total).toBe(1)
      expect(body.items[0]?.fullName).toBe('Participante Cancelado')
    })

    it('aísla los participantes por evento (no mezcla inscripciones de otros eventos)', async () => {
      const eventA = await createEvent()
      const eventB = await createEvent()

      await prisma.eventRegistration.create({
        data: {
          eventId: eventA.id,
          fullName: 'Participante de Evento A',
          email: `${runId}-a@uvg.edu.gt`,
          phone: '+502 1111 1111',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0'
        }
      })
      await prisma.eventRegistration.create({
        data: {
          eventId: eventB.id,
          fullName: 'Participante de Evento B',
          email: `${runId}-b@uvg.edu.gt`,
          phone: '+502 2222 2222',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0'
        }
      })

      const resA = await app.handle(
        request(`/api/v1/admin/events/${eventA.id}/registrations`, { headers: adminHeaders })
      )
      expect(resA.status).toBe(200)
      const bodyA = (await resA.json()) as { items: Array<{ fullName: string }> }
      expect(bodyA.items).toHaveLength(1)
      expect(bodyA.items[0]?.fullName).toBe('Participante de Evento A')

      const resB = await app.handle(
        request(`/api/v1/admin/events/${eventB.id}/registrations`, { headers: adminHeaders })
      )
      expect(resB.status).toBe(200)
      const bodyB = (await resB.json()) as { items: Array<{ fullName: string }> }
      expect(bodyB.items).toHaveLength(1)
      expect(bodyB.items[0]?.fullName).toBe('Participante de Evento B')
    })

    it('devuelve únicamente la PII operativa mínima y excluye eventId, consentedAt y privacyVersion', async () => {
      const event = await createEvent()
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Participante Mínimo',
          email: `${runId}-min@uvg.edu.gt`,
          phone: '+502 3333 3333',
          status: 'CONFIRMADA',
          consentedAt: new Date('2026-01-01T10:00:00Z'),
          privacyVersion: 'vers-auditoria-99'
        }
      })

      const res = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations`, { headers: adminHeaders })
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { items: Array<Record<string, unknown>> }
      expect(body.items).toHaveLength(1)
      const item = body.items[0]!

      // Campos esperados
      expect(item).toHaveProperty('id')
      expect(item.fullName).toBe('Participante Mínimo')
      expect(item.email).toBe(`${runId}-min@uvg.edu.gt`)
      expect(item.phone).toBe('+502 3333 3333')
      expect(item.status).toBe('CONFIRMADA')
      expect(item).toHaveProperty('registeredAt')

      // Campos excluidos
      expect(item).not.toHaveProperty('eventId')
      expect(item).not.toHaveProperty('consentedAt')
      expect(item).not.toHaveProperty('privacyVersion')
      expect(Object.keys(item).sort()).toEqual(['email', 'fullName', 'id', 'phone', 'registeredAt', 'status'])
    })

    it('maneja el filtrado por status (CONFIRMADA, CANCELADA o todas por defecto)', async () => {
      const event = await createEvent()
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Asistente Confirmado',
          email: `${runId}-conf@uvg.edu.gt`,
          phone: '+502 4444 1111',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0'
        }
      })
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Asistente Cancelado',
          email: `${runId}-canc2@uvg.edu.gt`,
          phone: '+502 4444 2222',
          status: 'CANCELADA',
          consentedAt: new Date(),
          privacyVersion: '1.0'
        }
      })

      // Sin status: devuelve todas
      const allRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations`, { headers: adminHeaders })
      )
      expect(allRes.status).toBe(200)
      const allBody = (await allRes.json()) as { items: Array<{ status: string }>; pagination: { total: number } }
      expect(allBody.pagination.total).toBe(2)
      expect(allBody.items.map(i => i.status).sort()).toEqual(['CANCELADA', 'CONFIRMADA'])

      // status=CONFIRMADA
      const confRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?status=CONFIRMADA`, { headers: adminHeaders })
      )
      expect(confRes.status).toBe(200)
      const confBody = (await confRes.json()) as { items: Array<{ status: string }>; pagination: { total: number } }
      expect(confBody.pagination.total).toBe(1)
      expect(confBody.items[0]?.status).toBe('CONFIRMADA')

      // status=CANCELADA
      const cancRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?status=CANCELADA`, { headers: adminHeaders })
      )
      expect(cancRes.status).toBe(200)
      const cancBody = (await cancRes.json()) as { items: Array<{ status: string }>; pagination: { total: number } }
      expect(cancBody.pagination.total).toBe(1)
      expect(cancBody.items[0]?.status).toBe('CANCELADA')

      // status inválido -> 422
      const invalidRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?status=NO_EXISTE`, { headers: adminHeaders })
      )
      expect(invalidRes.status).toBe(422)
    })

    it('soporta búsqueda con q por fullName, email (insensible a mayúsculas CITEXT) y phone', async () => {
      const event = await createEvent()
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Carlos Rodrigo Mendoza',
          email: `${runId}-carlos.mendoza@uvg.edu.gt`,
          phone: '+502 5999 1234',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0'
        }
      })
      await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'María Andrea Castillo',
          email: `${runId}-maria.castillo@uvg.edu.gt`,
          phone: '+502 5888 5678',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0'
        }
      })

      // Búsqueda por nombre
      const nameRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?q=rodrigo`, { headers: adminHeaders })
      )
      expect(nameRes.status).toBe(200)
      const nameBody = (await nameRes.json()) as { items: Array<{ fullName: string }> }
      expect(nameBody.items).toHaveLength(1)
      expect(nameBody.items[0]?.fullName).toBe('Carlos Rodrigo Mendoza')

      // Búsqueda por email con casing en mayúsculas (demostrando insensibilidad a mayúsculas con CITEXT)
      const emailRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?q=MARIA.CASTILLO`, { headers: adminHeaders })
      )
      expect(emailRes.status).toBe(200)
      const emailBody = (await emailRes.json()) as { items: Array<{ fullName: string }> }
      expect(emailBody.items).toHaveLength(1)
      expect(emailBody.items[0]?.fullName).toBe('María Andrea Castillo')

      // Búsqueda por teléfono
      const phoneRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?q=5999`, { headers: adminHeaders })
      )
      expect(phoneRes.status).toBe(200)
      const phoneBody = (await phoneRes.json()) as { items: Array<{ fullName: string }> }
      expect(phoneBody.items).toHaveLength(1)
      expect(phoneBody.items[0]?.fullName).toBe('Carlos Rodrigo Mendoza')

      // Búsqueda sin coincidencias
      const emptyRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?q=inexistente`, { headers: adminHeaders })
      )
      expect(emptyRes.status).toBe(200)
      const emptyBody = (await emptyRes.json()) as { items: unknown[]; pagination: { total: number } }
      expect(emptyBody.items).toHaveLength(0)
      expect(emptyBody.pagination.total).toBe(0)
    })

    it('maneja paginación determinista (page, pageSize, total y orden registrado desc, id desc)', async () => {
      const event = await createEvent()
      // Crear 3 registros con marcas de tiempo explícitas
      const reg1 = await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Primero',
          email: `${runId}-p1@uvg.edu.gt`,
          phone: '+502 5111 0001',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0',
          registeredAt: new Date('2026-03-01T10:00:00Z')
        }
      })
      const reg2 = await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Segundo',
          email: `${runId}-p2@uvg.edu.gt`,
          phone: '+502 5111 0002',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0',
          registeredAt: new Date('2026-03-01T12:00:00Z')
        }
      })
      const reg3 = await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          fullName: 'Tercero',
          email: `${runId}-p3@uvg.edu.gt`,
          phone: '+502 5111 0003',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: '1.0',
          registeredAt: new Date('2026-03-01T14:00:00Z')
        }
      })

      // Primera página con pageSize=2
      const page1Res = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?page=1&pageSize=2`, { headers: adminHeaders })
      )
      expect(page1Res.status).toBe(200)
      const page1Body = (await page1Res.json()) as { items: Array<{ id: number; fullName: string }>; pagination: { page: number; pageSize: number; total: number } }
      expect(page1Body.pagination).toEqual({ page: 1, pageSize: 2, total: 3 })
      expect(page1Body.items).toHaveLength(2)
      // Orden DESC: Tercero (más reciente), luego Segundo
      expect(page1Body.items[0]?.id).toBe(reg3.id)
      expect(page1Body.items[1]?.id).toBe(reg2.id)

      // Segunda página con pageSize=2
      const page2Res = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?page=2&pageSize=2`, { headers: adminHeaders })
      )
      expect(page2Res.status).toBe(200)
      const page2Body = (await page2Res.json()) as { items: Array<{ id: number; fullName: string }>; pagination: { page: number; pageSize: number; total: number } }
      expect(page2Body.pagination).toEqual({ page: 2, pageSize: 2, total: 3 })
      expect(page2Body.items).toHaveLength(1)
      expect(page2Body.items[0]?.id).toBe(reg1.id)

      // Validación de límites: page=0 inválido
      const invalidPageRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?page=0`, { headers: adminHeaders })
      )
      expect(invalidPageRes.status).toBe(422)

      // Validación de límites: pageSize > 100 inválido
      const invalidSizeRes = await app.handle(
        request(`/api/v1/admin/events/${event.id}/registrations?pageSize=101`, { headers: adminHeaders })
      )
      expect(invalidSizeRes.status).toBe(422)
    })

    it('regresión de privacidad: el endpoint público POST /events/:id/registrations sigue sin PII', async () => {
      const event = await createEvent({ maximumCapacity: 10 })
      const regRes = await app.handle(
        request(`/api/v1/events/${event.id}/registrations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '172.16.5.1' },
          body: JSON.stringify(baseRegistrationPayload({
            fullName: 'Participante Secreto',
            email: `${runId}-regresion@uvg.edu.gt`,
            phone: '+502 9999 8888'
          }))
        })
      )
      expect(regRes.status).toBe(201)
      const regBody = (await regRes.json()) as Record<string, unknown>

      // SÍ contiene los 4 campos públicos autorizados
      expect(regBody).toHaveProperty('id')
      expect(regBody.eventId).toBe(event.id)
      expect(regBody.status).toBe('CONFIRMADA')
      expect(regBody).toHaveProperty('registeredAt')

      // NO contiene PII ni metadatos de auditoría
      expect(regBody).not.toHaveProperty('fullName')
      expect(regBody).not.toHaveProperty('email')
      expect(regBody).not.toHaveProperty('phone')
      expect(regBody).not.toHaveProperty('consentedAt')
      expect(regBody).not.toHaveProperty('privacyVersion')
      expect(Object.keys(regBody).sort()).toEqual(['eventId', 'id', 'registeredAt', 'status'])
    })
  })
})
