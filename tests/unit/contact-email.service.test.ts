import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contactEmailService } from '../../src/modules/contact/services/contact-email.service'

const request = {
  name: '<Persona segura>', email: 'persona@example.com', phone: '+502 5555 5555', type: 'CONSULTA' as const,
  subject: 'Información', message: '<script>alert(1)</script>', preferredAt: null, deliveryKey: 'contact/test-key'
}

describe('entrega de correo de contacto', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.CONTACT_FROM_EMAIL = 'AsoQuímica <contacto@example.org>'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.RESEND_API_KEY
    delete process.env.CONTACT_FROM_EMAIL
  })

  it('envía texto y HTML escapado al proveedor sin exponer el secreto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    await contactEmailService.send('destino@uvg.edu.gt', request)

    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST' }))
    const options = fetchMock.mock.calls[0]![1] as RequestInit
    expect(new Headers(options.headers).get('idempotency-key')).toBe('contact/test-key')
    const body = JSON.parse(String(options.body)) as { to: string[]; reply_to: string; html: string }
    expect(body.to).toEqual(['destino@uvg.edu.gt'])
    expect(body.reply_to).toBe('persona@example.com')
    expect(body.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(body.html).not.toContain('<script>')
    expect(String(options.body)).not.toContain('re_test_key')
  })

  it('falla de forma segura si falta configuración o el proveedor rechaza', async () => {
    delete process.env.RESEND_API_KEY
    await expect(contactEmailService.send('destino@uvg.edu.gt', request)).rejects.toMatchObject({ status: 503, code: 'CONTACT_DELIVERY_NOT_CONFIGURED' })

    process.env.RESEND_API_KEY = 're_test_key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    await expect(contactEmailService.send('destino@uvg.edu.gt', request)).rejects.toMatchObject({ status: 502, code: 'CONTACT_DELIVERY_FAILED' })
  })
})
