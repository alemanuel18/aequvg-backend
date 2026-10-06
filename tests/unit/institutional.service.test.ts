import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMocks = vi.hoisted(() => ({
  listPublished: vi.fn(),
  listAll: vi.fn(),
  listFeatured: vi.fn(),
  findById: vi.fn(),
  findExistingNews: vi.fn(),
  findExistingEvents: vi.fn(),
  countActiveAnnouncements: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  saveFeatured: vi.fn()
}))

vi.mock('../../src/modules/institutional/repositories/institutional.repository', () => ({
  institutionalRepository: repoMocks
}))

import { AppError } from '../../src/shared/errors/app-error'
import { institutionalService } from '../../src/modules/institutional/services/institutional.service'

describe('servicio de contenido institucional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repoMocks.countActiveAnnouncements.mockResolvedValue(0)
    repoMocks.findById.mockResolvedValue(null)
  })

  it('rechaza URLs de imagen que no sean HTTP o HTTPS', async () => {
    await expect(institutionalService.create({
      type: 'LABORATORIO',
      title: 'Laboratorio de Orgánica',
      body: 'Descripción de laboratorio',
      imageUrl: 'javascript:alert(1)'
    })).rejects.toThrowError(AppError)
  })

  it('rechaza enlaces de acción que no sean HTTP o relativos', async () => {
    await expect(institutionalService.create({
      type: 'LABORATORIO',
      title: 'Laboratorio de Orgánica',
      body: 'Descripción de laboratorio',
      actionUrl: 'ftp://invalido.com'
    })).rejects.toThrowError(AppError)
  })

  it('impide superar el límite de 3 anuncios activos en Conocer la Licenciatura de Química', async () => {
    repoMocks.countActiveAnnouncements.mockResolvedValue(3)

    await expect(institutionalService.create({
      type: 'TESTIMONIO',
      title: 'Estudiante de 4to año',
      body: 'Excelente experiencia en laboratorios'
    })).rejects.toThrowError(AppError)
  })

  it('rechaza seleccionar más de 3 noticias o 3 eventos destacados', async () => {
    await expect(institutionalService.saveFeatured({
      newsIds: [1, 2, 3, 4],
      eventIds: [1]
    })).rejects.toThrowError(AppError)

    await expect(institutionalService.saveFeatured({
      newsIds: [1],
      eventIds: [1, 2, 3, 4]
    })).rejects.toThrowError(AppError)
  })

  it('rechaza IDs duplicados en destacados', async () => {
    await expect(institutionalService.saveFeatured({
      newsIds: [1, 1],
      eventIds: []
    })).rejects.toThrowError(AppError)

    await expect(institutionalService.saveFeatured({
      newsIds: [],
      eventIds: [2, 2]
    })).rejects.toThrowError(AppError)
  })

  it('lanza 404 al intentar actualizar un bloque inexistente', async () => {
    repoMocks.findById.mockResolvedValue(null)

    await expect(institutionalService.update(999, {
      type: 'HERO',
      title: 'Nuevo título',
      body: 'Nuevo cuerpo'
    })).rejects.toThrowError(AppError)
  })
})
