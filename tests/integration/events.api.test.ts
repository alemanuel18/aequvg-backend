import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'

const runDatabaseTests = process.env.EVENTS_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `events-api-test-${Date.now()}`
const adminKey = 'events-api-test-key'
let roleId: number
let authorId = 0
let inactiveAuthorId = 0
let imageId = 0
let nonImageId = 0

const request = (path: string, options: RequestInit = {}) => new Request(`http://localhost${path}`, options)
const adminHeaders = { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' }

const baseEventPayload = (name: string, overrides: Record<string, unknown> = {}) => ({
  createdById: authorId,
  name,
  description: `Descripción detallada y válida para ${name}.`,
  startsAt: '2030-05-15T18:00:00.000Z',
  location: 'Auditorio Central UVG',
  maximumCapacity: 50,
  ...overrides
})

describeDatabase('CRUD administrativo de eventos con PostgreSQL', () => {
  const app = createApp()

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = adminKey

    const role = await prisma.role.create({
      data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de API de eventos.' }
    })
    roleId = role.id

    const author = await prisma.administrativeUser.create({
      data: { roleId, name: 'Autor de eventos', email: `${runId}@uvg.edu.gt`, status: 'ACTIVO' }
    })
    authorId = author.id

    const inactiveAuthor = await prisma.administrativeUser.create({
      data: { roleId, name: 'Autor inactivo', email: `${runId}-inactive@uvg.edu.gt`, status: 'INACTIVO' }
    })
    inactiveAuthorId = inactiveAuthor.id

    const imageFile = await prisma.file.create({
      data: {
        uploadedById: authorId,
        originalName: 'banner.png',
        storageKey: `${runId}/banner.png`,
        mimeType: 'image/png',
        sizeBytes: 1024n,
        sha256: 'a'.repeat(64)
      }
    })
    imageId = imageFile.id

    const pdfFile = await prisma.file.create({
      data: {
        uploadedById: authorId,
        originalName: 'documento.pdf',
        storageKey: `${runId}/documento.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 2048n,
        sha256: 'b'.repeat(64)
      }
    })
    nonImageId = pdfFile.id
  })

  afterAll(async () => {
    try {
      if (roleId) {
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

  describe('Autorización', () => {
    it('deniega el listado administrativo sin token', async () => {
      const response = await app.handle(request('/api/v1/admin/events'))
      expect(response.status).toBe(401)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('UNAUTHORIZED')
    })

    it('deniega la creación de eventos con token inválido', async () => {
      const response = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: { authorization: 'Bearer clave-incorrecta', 'content-type': 'application/json' },
          body: JSON.stringify(baseEventPayload('Evento no autorizado'))
        })
      )
      expect(response.status).toBe(401)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('Creación de eventos (POST /api/v1/admin/events)', () => {
    it('crea un evento válido con campos mínimos y default BORRADOR', async () => {
      const payload = baseEventPayload('Congreso de Química 2030')
      const response = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(payload)
        })
      )
      expect(response.status).toBe(201)
      const data = await response.json() as {
        id: number
        name: string
        status: string
        maximumCapacity: number
        imageId: number | null
        createdBy: { id: number; name: string }
      }
      expect(data.id).toBeGreaterThan(0)
      expect(data.name).toBe('Congreso de Química 2030')
      expect(data.status).toBe('BORRADOR')
      expect(data.maximumCapacity).toBe(50)
      expect(data.imageId).toBeNull()
      expect(data.createdBy.id).toBe(authorId)
    })

    it('crea un evento con imagen asociada y status PUBLICADO', async () => {
      const payload = baseEventPayload('Taller de Cromatografía', {
        imageId,
        status: 'PUBLICADO',
        additionalInformation: 'Se requiere bata de laboratorio.'
      })
      const response = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(payload)
        })
      )
      expect(response.status).toBe(201)
      const data = await response.json() as {
        id: number
        status: string
        imageId: number
        additionalInformation: string
        image: { id: number; originalName: string }
      }
      expect(data.status).toBe('PUBLICADO')
      expect(data.imageId).toBe(imageId)
      expect(data.image.originalName).toBe('banner.png')
      expect(data.additionalInformation).toBe('Se requiere bata de laboratorio.')
    })

    it('rechaza cuando faltan campos obligatorios', async () => {
      const response = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ name: 'Solo nombre' })
        })
      )
      expect(response.status).toBe(422)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rechaza si maximumCapacity es 0 o negativo', async () => {
      for (const capacity of [0, -5]) {
        const response = await app.handle(
          request('/api/v1/admin/events', {
            method: 'POST',
            headers: adminHeaders,
            body: JSON.stringify(baseEventPayload('Capacidad inválida', { maximumCapacity: capacity }))
          })
        )
        expect(response.status).toBe(422)
        const body = await response.json() as { error: { code: string } }
        expect(body.error.code).toBe('VALIDATION_ERROR')
      }
    })

    it('rechaza si createdById no existe o está inactivo', async () => {
      const missingAuthor = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Autor inexistente', { createdById: 999999 }))
        })
      )
      expect(missingAuthor.status).toBe(422)
      expect((await missingAuthor.json() as { error: { code: string } }).error.code).toBe('INVALID_EVENT_AUTHOR')

      const inactiveAuthor = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Autor inactivo', { createdById: inactiveAuthorId }))
        })
      )
      expect(inactiveAuthor.status).toBe(422)
      expect((await inactiveAuthor.json() as { error: { code: string } }).error.code).toBe('INVALID_EVENT_AUTHOR')
    })

    it('rechaza si imageId no existe o no corresponde a una imagen', async () => {
      const missingImage = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Imagen inexistente', { imageId: 999999 }))
        })
      )
      expect(missingImage.status).toBe(422)
      expect((await missingImage.json() as { error: { code: string } }).error.code).toBe('INVALID_EVENT_IMAGE')

      const nonImage = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Archivo PDF no imagen', { imageId: nonImageId }))
        })
      )
      expect(nonImage.status).toBe(422)
      expect((await nonImage.json() as { error: { code: string } }).error.code).toBe('INVALID_EVENT_IMAGE')
    })

    it('rechaza si startsAt no es una fecha válida', async () => {
      const response = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Fecha no válida', { startsAt: 'fecha-invalida' }))
        })
      )
      expect(response.status).toBe(422)
    })
  })

  describe('Lectura administrativa (GET /api/v1/admin/events)', () => {
    it('lista eventos administrativos con paginación, filtros y búsqueda', async () => {
      const e1 = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Feria Científica Alpha', { status: 'BORRADOR' }))
        })
      )
      const e2 = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Simposio Beta', { status: 'PUBLICADO' }))
        })
      )
      expect(e1.status).toBe(201)
      expect(e2.status).toBe(201)

      const listResponse = await app.handle(
        request('/api/v1/admin/events?page=1&pageSize=10', { headers: adminHeaders })
      )
      expect(listResponse.status).toBe(200)
      const listData = await listResponse.json() as {
        items: { id: number; name: string }[]
        pagination: { page: number; pageSize: number; total: number }
      }
      expect(listData.items.length).toBeGreaterThanOrEqual(2)
      expect(listData.pagination.total).toBeGreaterThanOrEqual(2)

      const searchResponse = await app.handle(
        request('/api/v1/admin/events?q=Científica', { headers: adminHeaders })
      )
      expect(searchResponse.status).toBe(200)
      const searchData = await searchResponse.json() as { items: { name: string }[] }
      expect(searchData.items.some(item => item.name.includes('Científica'))).toBe(true)

      const filterStatus = await app.handle(
        request('/api/v1/admin/events?status=PUBLICADO', { headers: adminHeaders })
      )
      expect(filterStatus.status).toBe(200)
      const filterData = await filterStatus.json() as { items: { status: string }[] }
      expect(filterData.items.every(item => item.status === 'PUBLICADO')).toBe(true)
    })

    it('obtiene detalle por ID o devuelve 404 si no existe', async () => {
      const created = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Detalle de prueba'))
        })
      )
      const event = await created.json() as { id: number }

      const detail = await app.handle(request(`/api/v1/admin/events/${event.id}`, { headers: adminHeaders }))
      expect(detail.status).toBe(200)
      expect((await detail.json() as { id: number }).id).toBe(event.id)

      const missing = await app.handle(request('/api/v1/admin/events/999999', { headers: adminHeaders }))
      expect(missing.status).toBe(404)
      expect((await missing.json() as { error: { code: string } }).error.code).toBe('EVENT_NOT_FOUND')
    })
  })

  describe('Actualización de eventos (PUT /api/v1/admin/events/:id)', () => {
    it('actualiza campos modificables y mantiene inmutabilidad de createdById', async () => {
      const created = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento pre-update', { imageId }))
        })
      )
      const event = await created.json() as { id: number; createdById: number }

      const updated = await app.handle(
        request(`/api/v1/admin/events/${event.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({
            name: 'Evento post-update',
            location: 'Laboratorio 305',
            maximumCapacity: 80,
            status: 'PUBLICADO',
            imageId: null,
            createdById: 999999
          })
        })
      )
      expect(updated.status).toBe(200)
      const updatedData = await updated.json() as {
        name: string
        location: string
        maximumCapacity: number
        status: string
        imageId: number | null
        createdById: number
      }
      expect(updatedData.name).toBe('Evento post-update')
      expect(updatedData.location).toBe('Laboratorio 305')
      expect(updatedData.maximumCapacity).toBe(80)
      expect(updatedData.status).toBe('PUBLICADO')
      expect(updatedData.imageId).toBeNull()
      expect(updatedData.createdById).toBe(event.createdById)
    })

    it('devuelve 404 al intentar actualizar un evento inexistente', async () => {
      const response = await app.handle(
        request('/api/v1/admin/events/999999', {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ name: 'Inexistente' })
        })
      )
      expect(response.status).toBe(404)
      expect((await response.json() as { error: { code: string } }).error.code).toBe('EVENT_NOT_FOUND')
    })

    it('permite asociar una imagen válida y posteriormente limpiarla con null', async () => {
      const created = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento sin imagen'))
        })
      )
      const event = await created.json() as { id: number; imageId: number | null }
      expect(event.imageId).toBeNull()

      const attachImage = await app.handle(
        request(`/api/v1/admin/events/${event.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ imageId })
        })
      )
      expect(attachImage.status).toBe(200)
      const attachedData = await attachImage.json() as {
        imageId: number | null
        image: { id: number; originalName: string } | null
      }
      expect(attachedData.imageId).toBe(imageId)
      expect(attachedData.image?.originalName).toBe('banner.png')

      const clearImage = await app.handle(
        request(`/api/v1/admin/events/${event.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ imageId: null })
        })
      )
      expect(clearImage.status).toBe(200)
      const clearedData = await clearImage.json() as {
        imageId: number | null
        image: unknown
      }
      expect(clearedData.imageId).toBeNull()
      expect(clearedData.image).toBeNull()
    })

    it('rechaza la actualización si el status es inválido devolviendo 422 VALIDATION_ERROR', async () => {
      const created = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento para probar status'))
        })
      )
      const event = await created.json() as { id: number }

      const response = await app.handle(
        request(`/api/v1/admin/events/${event.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ status: 'ESTADO_NO_VALIDO' })
        })
      )
      expect(response.status).toBe(422)
      const body = await response.json() as { error: { code: string } }
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rechaza reducir la capacidad por debajo de las inscripciones confirmadas existentes', async () => {
      const created = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento con cupos', { maximumCapacity: 10 }))
        })
      )
      const event = await created.json() as { id: number }

      await prisma.eventRegistration.createMany({
        data: [
          {
            eventId: event.id,
            fullName: 'Participante 1',
            email: `p1-${runId}@example.invalid`,
            phone: '+502 0000 0001',
            status: 'CONFIRMADA',
            consentedAt: new Date(),
            privacyVersion: 'v1'
          },
          {
            eventId: event.id,
            fullName: 'Participante 2',
            email: `p2-${runId}@example.invalid`,
            phone: '+502 0000 0002',
            status: 'CONFIRMADA',
            consentedAt: new Date(),
            privacyVersion: 'v1'
          },
          {
            eventId: event.id,
            fullName: 'Participante Cancelado',
            email: `p3-${runId}@example.invalid`,
            phone: '+502 0000 0003',
            status: 'CANCELADA',
            consentedAt: new Date(),
            privacyVersion: 'v1'
          }
        ]
      })

      const attemptLower = await app.handle(
        request(`/api/v1/admin/events/${event.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ maximumCapacity: 1 })
        })
      )
      expect(attemptLower.status).toBe(422)
      const err = await attemptLower.json() as { error: { code: string } }
      expect(err.error.code).toBe('CAPACITY_BELOW_REGISTRATIONS')

      const attemptEqual = await app.handle(
        request(`/api/v1/admin/events/${event.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ maximumCapacity: 2 })
        })
      )
      expect(attemptEqual.status).toBe(200)
    })
  })

  describe('Archivado de eventos (PATCH /api/v1/admin/events/:id/archive)', () => {
    it('archiva un evento existente, es idempotente si ya está archivado y devuelve 404 si no existe', async () => {
      const created = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento para archivar', { status: 'PUBLICADO' }))
        })
      )
      const event = await created.json() as { id: number }

      const archiveResponse = await app.handle(
        request(`/api/v1/admin/events/${event.id}/archive`, {
          method: 'PATCH',
          headers: adminHeaders
        })
      )
      expect(archiveResponse.status).toBe(200)
      const archivedData = await archiveResponse.json() as { status: string }
      expect(archivedData.status).toBe('ARCHIVADO')

      const reArchiveResponse = await app.handle(
        request(`/api/v1/admin/events/${event.id}/archive`, {
          method: 'PATCH',
          headers: adminHeaders
        })
      )
      expect(reArchiveResponse.status).toBe(200)
      const reArchivedData = await reArchiveResponse.json() as { status: string }
      expect(reArchivedData.status).toBe('ARCHIVADO')

      const missing = await app.handle(
        request('/api/v1/admin/events/999999/archive', {
          method: 'PATCH',
          headers: adminHeaders
        })
      )
      expect(missing.status).toBe(404)
    })
  })

  describe('Eliminación de eventos (DELETE /api/v1/admin/events/:id)', () => {
    it('elimina físicamente un evento que no tiene inscripciones', async () => {
      const created = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento vacío para eliminar'))
        })
      )
      const event = await created.json() as { id: number }

      const deleteResponse = await app.handle(
        request(`/api/v1/admin/events/${event.id}`, {
          method: 'DELETE',
          headers: adminHeaders
        })
      )
      expect(deleteResponse.status).toBe(200)

      const verifyDb = await prisma.event.findUnique({ where: { id: event.id } })
      expect(verifyDb).toBeNull()
    })

    it('rechaza con 409 eliminar un evento con inscripciones CONFIRMADA o CANCELADA', async () => {
      const c1 = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento con confirmada'))
        })
      )
      const eventWithConfirmed = await c1.json() as { id: number }
      await prisma.eventRegistration.create({
        data: {
          eventId: eventWithConfirmed.id,
          fullName: 'Usuario',
          email: `conf-${runId}@example.invalid`,
          phone: '+502 1111 2222',
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion: 'v1'
        }
      })

      const deleteConfirmed = await app.handle(
        request(`/api/v1/admin/events/${eventWithConfirmed.id}`, {
          method: 'DELETE',
          headers: adminHeaders
        })
      )
      expect(deleteConfirmed.status).toBe(409)
      expect((await deleteConfirmed.json() as { error: { code: string } }).error.code).toBe('EVENT_HAS_REGISTRATIONS')

      const c2 = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(baseEventPayload('Evento con cancelada'))
        })
      )
      const eventWithCancelled = await c2.json() as { id: number }
      await prisma.eventRegistration.create({
        data: {
          eventId: eventWithCancelled.id,
          fullName: 'Usuario',
          email: `canc-${runId}@example.invalid`,
          phone: '+502 1111 3333',
          status: 'CANCELADA',
          consentedAt: new Date(),
          privacyVersion: 'v1'
        }
      })

      const deleteCancelled = await app.handle(
        request(`/api/v1/admin/events/${eventWithCancelled.id}`, {
          method: 'DELETE',
          headers: adminHeaders
        })
      )
      expect(deleteCancelled.status).toBe(409)
      expect((await deleteCancelled.json() as { error: { code: string } }).error.code).toBe('EVENT_HAS_REGISTRATIONS')
    })

    it('devuelve 404 al intentar eliminar un evento inexistente', async () => {
      const response = await app.handle(
        request('/api/v1/admin/events/999999', {
          method: 'DELETE',
          headers: adminHeaders
        })
      )
      expect(response.status).toBe(404)
      expect((await response.json() as { error: { code: string } }).error.code).toBe('EVENT_NOT_FOUND')
    })
  })

  describe('Consulta pública de eventos (GET /api/v1/events y /api/v1/events/:id)', () => {
    it('GET /events funciona sin Authorization y lista únicamente eventos en estado PUBLICADO', async () => {
      const p1 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Pub 1', { status: 'PUBLICADO', startsAt: '2030-01-01T10:00:00.000Z' })) }))
      const p2 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Pub 2', { status: 'PUBLICADO', startsAt: '2030-02-01T10:00:00.000Z' })) }))
      const b1 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Draft 1', { status: 'BORRADOR' })) }))
      const f1 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Fin 1', { status: 'FINALIZADO' })) }))
      const c1 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Canc 1', { status: 'CANCELADO' })) }))
      const a1 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Arch 1', { status: 'ARCHIVADO' })) }))
      expect(p1.status).toBe(201)
      expect(p2.status).toBe(201)
      expect(b1.status).toBe(201)
      expect(f1.status).toBe(201)
      expect(c1.status).toBe(201)
      expect(a1.status).toBe(201)

      const response = await app.handle(request('/api/v1/events'))
      expect(response.status).toBe(200)
      const data = await response.json() as { items: { name: string; status: string }[] }
      expect(data.items.length).toBeGreaterThanOrEqual(2)
      expect(data.items.every(item => item.status === 'PUBLICADO')).toBe(true)
      expect(data.items.some(item => item.name === 'Draft 1')).toBe(false)
      expect(data.items.some(item => item.name === 'Fin 1')).toBe(false)
      expect(data.items.some(item => item.name === 'Canc 1')).toBe(false)
      expect(data.items.some(item => item.name === 'Arch 1')).toBe(false)
    })

    it('busca con q y q nunca recupera eventos no publicados', async () => {
      await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Quantum Chemistry Workshop', { status: 'PUBLICADO' })) }))
      await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Quantum Draft Secret', { status: 'BORRADOR' })) }))
      await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Quantum Cancelled Event', { status: 'CANCELADO' })) }))

      const res = await app.handle(request('/api/v1/events?q=Quantum'))
      expect(res.status).toBe(200)
      const data = await res.json() as { items: { name: string; status: string }[] }
      expect(data.items.length).toBeGreaterThanOrEqual(1)
      expect(data.items.every(item => item.status === 'PUBLICADO')).toBe(true)
      expect(data.items.some(item => item.name === 'Quantum Chemistry Workshop')).toBe(true)
      expect(data.items.some(item => item.name === 'Quantum Draft Secret')).toBe(false)
      expect(data.items.some(item => item.name === 'Quantum Cancelled Event')).toBe(false)
    })

    it('pagina resultados y ordena por startsAt ASC con desempate determinista por id ASC', async () => {
      const sameTime = '2031-08-10T12:00:00.000Z'
      const earlierTime = '2031-01-01T12:00:00.000Z'
      await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Paging Alpha Early', { startsAt: earlierTime, status: 'PUBLICADO' })) }))
      const eTie1 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Paging Beta Tie 1', { startsAt: sameTime, status: 'PUBLICADO' })) }))
      const eTie2 = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Paging Gamma Tie 2', { startsAt: sameTime, status: 'PUBLICADO' })) }))
      const id1 = (await eTie1.json() as { id: number }).id
      const id2 = (await eTie2.json() as { id: number }).id
      expect(id1).toBeLessThan(id2)

      const pageRes = await app.handle(request('/api/v1/events?q=Paging&page=1&pageSize=2'))
      expect(pageRes.status).toBe(200)
      const pageData = await pageRes.json() as { items: { id: number; name: string }[]; pagination: { total: number; page: number; pageSize: number } }
      expect(pageData.pagination.total).toBe(3)
      expect(pageData.items).toHaveLength(2)
      expect(pageData.items[0]?.name).toBe('Paging Alpha Early')
      expect(pageData.items[1]?.id).toBe(id1)

      const page2Res = await app.handle(request('/api/v1/events?q=Paging&page=2&pageSize=2'))
      const page2Data = await page2Res.json() as { items: { id: number }[] }
      expect(page2Data.items).toHaveLength(1)
      expect(page2Data.items[0]?.id).toBe(id2)
    })

    it('un evento PUBLICADO con startsAt en el pasado sigue siendo visible', async () => {
      const pastTime = '2020-01-01T10:00:00.000Z'
      const pastCreated = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Evento Histórico Pasado', { startsAt: pastTime, status: 'PUBLICADO' })) }))
      const pastEvent = await pastCreated.json() as { id: number }

      const listRes = await app.handle(request('/api/v1/events?q=Histórico'))
      expect(listRes.status).toBe(200)
      const listData = await listRes.json() as { items: { id: number }[] }
      expect(listData.items.some(item => item.id === pastEvent.id)).toBe(true)

      const detailRes = await app.handle(request(`/api/v1/events/${pastEvent.id}`))
      expect(detailRes.status).toBe(200)
    })

    it('GET /events/:id devuelve 200 para evento PUBLICADO y valida contrato público estricto', async () => {
      const createdWithInfo = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(
            baseEventPayload('Evento Público Detallado Con Info', {
              status: 'PUBLICADO',
              imageId,
              additionalInformation: 'Se requiere bata de laboratorio y lentes protectores.'
            })
          )
        })
      )
      const eventWithInfo = await createdWithInfo.json() as { id: number }

      const response = await app.handle(request(`/api/v1/events/${eventWithInfo.id}`))
      expect(response.status).toBe(200)
      const body = await response.json() as Record<string, unknown>

      // SÍ contiene los campos públicos esperados
      expect(body.id).toBe(eventWithInfo.id)
      expect(body.name).toBe('Evento Público Detallado Con Info')
      expect(body.description).toBeDefined()
      expect(body.startsAt).toBeDefined()
      expect(body.location).toBe('Auditorio Central UVG')
      expect(body.maximumCapacity).toBe(50)
      expect(body.status).toBe('PUBLICADO')
      expect(body.additionalInformation).toBe('Se requiere bata de laboratorio y lentes protectores.')
      expect(body.image).toEqual(expect.objectContaining({ id: imageId, originalName: 'banner.png' }))

      // NO contiene campos administrativos, relaciones internas ni cupos dinámicos
      expect(body.createdById).toBeUndefined()
      expect(body.createdBy).toBeUndefined()
      expect(body.createdAt).toBeUndefined()
      expect(body.updatedAt).toBeUndefined()
      expect(body.imageId).toBeUndefined()
      expect(body.registrations).toBeUndefined()
      expect(body.confirmedRegistrationsCount).toBeUndefined()
      expect(body.availableCapacity).toBeUndefined()
      expect(body.participants).toBeUndefined()

      // Prueba additionalInformation null cuando no existe
      const createdWithoutInfo = await app.handle(
        request('/api/v1/admin/events', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify(
            baseEventPayload('Evento Público Sin Info Adicional', {
              status: 'PUBLICADO',
              additionalInformation: null
            })
          )
        })
      )
      const eventWithoutInfo = await createdWithoutInfo.json() as { id: number }
      const resWithoutInfo = await app.handle(request(`/api/v1/events/${eventWithoutInfo.id}`))
      expect(resWithoutInfo.status).toBe(200)
      const bodyWithoutInfo = await resWithoutInfo.json() as Record<string, unknown>
      expect(bodyWithoutInfo.additionalInformation).toBeNull()
    })

    it('GET /events/:id devuelve 404 para BORRADOR, FINALIZADO, CANCELADO, ARCHIVADO e inexistente, y 200 solo para PUBLICADO', async () => {
      const pub = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Pub-Check', { status: 'PUBLICADO' })) }))
      const b = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Draft-1', { status: 'BORRADOR' })) }))
      const f = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Final-1', { status: 'FINALIZADO' })) }))
      const c = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Cancel-1', { status: 'CANCELADO' })) }))
      const a = await app.handle(request('/api/v1/admin/events', { method: 'POST', headers: adminHeaders, body: JSON.stringify(baseEventPayload('Archive-1', { status: 'ARCHIVADO' })) }))
      expect(pub.status).toBe(201)
      expect(b.status).toBe(201)
      expect(f.status).toBe(201)
      expect(c.status).toBe(201)
      expect(a.status).toBe(201)

      const pubId = (await pub.json() as { id: number }).id
      const pubRes = await app.handle(request(`/api/v1/events/${pubId}`))
      expect(pubRes.status).toBe(200)

      const nonPublishedCases = [
        { status: 'BORRADOR', id: (await b.json() as { id: number }).id },
        { status: 'FINALIZADO', id: (await f.json() as { id: number }).id },
        { status: 'CANCELADO', id: (await c.json() as { id: number }).id },
        { status: 'ARCHIVADO', id: (await a.json() as { id: number }).id },
        { status: 'INEXISTENTE', id: 999999 }
      ]

      for (const item of nonPublishedCases) {
        const res = await app.handle(request(`/api/v1/events/${item.id}`))
        expect(res.status).toBe(404)
        const err = await res.json() as { error: { code: string } }
        expect(err.error.code).toBe('EVENT_NOT_FOUND')
      }
    })
  })
})
