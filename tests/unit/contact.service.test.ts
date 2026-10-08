import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../src/shared/errors/app-error'

const repositoryMocks = vi.hoisted(() => ({
  primaryEmailMethod: vi.fn(),
  publicMethods: vi.fn(),
  allMethods: vi.fn(),
  createMethod: vi.fn(),
  updateMethod: vi.fn(),
  deactivateMethod: vi.fn(),
  reorderMethods: vi.fn()
}))
const emailMocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('../../src/modules/contact/repositories/contact.repository', () => ({ contactRepository: repositoryMocks }))
vi.mock('../../src/modules/contact/services/contact-email.service', () => ({ contactEmailService: emailMocks }))

import { contactService, normalizeContactRequest } from '../../src/modules/contact/services/contact.service'

const valid = { name: 'Ana Pérez', email: 'ANA@example.com', phone: '+502 5555 5555', type: 'CONSULTA' as const, subject: 'Información', message: 'Quisiera conocer más detalles.', consent: true as const, privacyVersion: '2026-09' }

describe('normalización de solicitudes de contacto', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sanitiza texto y normaliza el correo', () => {
    const result = normalizeContactRequest({ ...valid, name: '<b>Ana</b> Pérez' })
    expect(result.name).toBe('Ana Pérez')
    expect(result.email).toBe('ana@example.com')
    expect(result.consentedAt).toBeInstanceOf(Date)
  })
  it('exige fecha tentativa para reuniones', () => expect(() => normalizeContactRequest({ ...valid, type: 'REUNION' })).toThrowError(AppError))
  it('rechaza el campo trampa contra bots', () => expect(() => normalizeContactRequest({ ...valid, website: 'https://spam.invalid' })).toThrowError(AppError))

  it('envía al correo oficial activo sin persistir una bandeja de solicitudes', async () => {
    repositoryMocks.primaryEmailMethod.mockResolvedValue({ value: 'contacto@uvg.edu.gt' })
    emailMocks.send.mockResolvedValue(undefined)

    await expect(contactService.sendRequest(valid)).resolves.toEqual({ accepted: true })

    expect(emailMocks.send).toHaveBeenCalledWith('contacto@uvg.edu.gt', expect.objectContaining({
      email: 'ana@example.com',
      subject: 'Información',
      deliveryKey: expect.stringMatching(/^contact\/[a-f0-9]{64}$/)
    }))
  })

  it('rechaza el envío cuando no existe un correo oficial activo', async () => {
    repositoryMocks.primaryEmailMethod.mockResolvedValue(null)
    await expect(contactService.sendRequest(valid)).rejects.toMatchObject({
      status: 503,
      code: 'CONTACT_RECIPIENT_NOT_CONFIGURED'
    })
    expect(emailMocks.send).not.toHaveBeenCalled()
  })

  it('valida los valores y enlaces según el tipo de medio', async () => {
    expect(() => contactService.createMethod({ type: 'EMAIL', label: 'Correo', value: 'invalido' }))
      .toThrow(expect.objectContaining({ code: 'INVALID_CONTACT_EMAIL' }))
    expect(() => contactService.createMethod({ type: 'UBICACION', label: 'Sede', value: 'Zona 15', url: 'https://example.com/mapa' }))
      .toThrow(expect.objectContaining({ code: 'GOOGLE_MAPS_URL_REQUIRED' }))

    repositoryMocks.allMethods.mockResolvedValue([])
    repositoryMocks.createMethod.mockResolvedValue({ id: 1 })
    await contactService.createMethod({ type: 'OTRO', label: 'TikTok', value: '@aeq', url: 'https://tiktok.com/@aeq' })
    expect(repositoryMocks.createMethod).toHaveBeenCalledWith(expect.objectContaining({ type: 'OTRO', url: 'https://tiktok.com/@aeq', displayOrder: 0 }))
  })

  it('ordena ubicaciones al final y resuelve empates por ID', async () => {
    repositoryMocks.publicMethods.mockResolvedValue([
      { id: 4, type: 'UBICACION', displayOrder: 0 },
      { id: 3, type: 'EMAIL', displayOrder: 1 },
      { id: 2, type: 'TELEFONO', displayOrder: 1 }
    ])
    await expect(contactService.publicMethods()).resolves.toEqual([
      expect.objectContaining({ id: 2 }),
      expect.objectContaining({ id: 3 }),
      expect.objectContaining({ id: 4 })
    ])
  })

  it('guarda un orden único sin permitir ubicaciones ni IDs omitidos', async () => {
    const configured = [
      { id: 1, type: 'EMAIL', displayOrder: 0 },
      { id: 2, type: 'UBICACION', displayOrder: 0 },
      { id: 3, type: 'OTRO', displayOrder: 0 }
    ]
    repositoryMocks.allMethods.mockResolvedValue(configured)
    repositoryMocks.reorderMethods.mockResolvedValue(undefined)

    await contactService.reorderMethods([3, 1])
    expect(repositoryMocks.reorderMethods).toHaveBeenCalledWith([3, 1])
    await expect(contactService.reorderMethods([1, 2, 3])).rejects.toMatchObject({ code: 'INVALID_CONTACT_ORDER' })
    await expect(contactService.reorderMethods([1])).rejects.toMatchObject({ code: 'INVALID_CONTACT_ORDER' })
  })
})
