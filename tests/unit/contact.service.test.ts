import { describe, expect, it } from 'vitest'
import { AppError } from '../../src/shared/errors/app-error'
import { normalizeContactRequest } from '../../src/modules/contact/services/contact.service'

const valid = { name: 'Ana Pérez', email: 'ANA@example.com', phone: '+502 5555 5555', type: 'CONSULTA' as const, subject: 'Información', message: 'Quisiera conocer más detalles.', consent: true as const, privacyVersion: '2026-09' }

describe('normalización de solicitudes de contacto', () => {
  it('sanitiza texto y normaliza el correo', () => {
    const result = normalizeContactRequest({ ...valid, name: '<b>Ana</b> Pérez' })
    expect(result.name).toBe('Ana Pérez')
    expect(result.email).toBe('ana@example.com')
    expect(result.consentedAt).toBeInstanceOf(Date)
  })
  it('exige fecha tentativa para reuniones', () => expect(() => normalizeContactRequest({ ...valid, type: 'REUNION' })).toThrowError(AppError))
  it('rechaza el campo trampa contra bots', () => expect(() => normalizeContactRequest({ ...valid, website: 'https://spam.invalid' })).toThrowError(AppError))
})
