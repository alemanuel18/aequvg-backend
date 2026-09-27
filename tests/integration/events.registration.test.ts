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
})
