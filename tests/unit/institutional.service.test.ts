import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../src/shared/errors/app-error'
import { institutionalService } from '../../src/modules/institutional/services/institutional.service'
import { institutionalRepository } from '../../src/modules/institutional/repositories/institutional.repository'

describe('servicio de contenido institucional', () => {
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
    vi.spyOn(institutionalRepository, 'countActiveAnnouncements').mockResolvedValue(3)

    await expect(institutionalService.create({
      type: 'TESTIMONIO',
      title: 'Estudiante de 4to año',
      body: 'Excelente experiencia en laboratorios'
    })).rejects.toThrowError(AppError)

    vi.restoreAllMocks()
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
    vi.spyOn(institutionalRepository, 'findById').mockResolvedValue(null)

    await expect(institutionalService.update(999, {
      type: 'HERO',
      title: 'Nuevo título',
      body: 'Nuevo cuerpo'
    })).rejects.toThrowError(AppError)

    vi.restoreAllMocks()
  })
})
