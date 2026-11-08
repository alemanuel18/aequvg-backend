import { AppError } from '../../../shared/errors/app-error'
import { logger } from '../../../shared/logging/logger'

type ContactEmail = {
  name: string
  email: string
  phone: string
  type: 'CONSULTA' | 'REUNION'
  subject: string
  message: string
  preferredAt: Date | null
  deliveryKey: string
}

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const emailConfig = () => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.CONTACT_FROM_EMAIL?.trim()
  if (!apiKey || !from) {
    throw new AppError(503, 'CONTACT_DELIVERY_NOT_CONFIGURED', 'El formulario de contacto no está disponible temporalmente.')
  }
  return { apiKey, from }
}

export const contactEmailService = {
  async send(recipient: string, request: ContactEmail) {
    const { apiKey, from } = emailConfig()
    const preferredAt = request.preferredAt
      ? request.preferredAt.toLocaleString('es-GT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guatemala' })
      : 'No aplica'
    const text = [
      'Nueva solicitud desde el sitio de AsoQuímica UVG',
      `Tipo: ${request.type === 'REUNION' ? 'Solicitud de reunión' : 'Consulta'}`,
      `Nombre: ${request.name}`,
      `Correo: ${request.email}`,
      `Teléfono: ${request.phone}`,
      `Fecha tentativa: ${preferredAt}`,
      `Asunto: ${request.subject}`,
      '',
      request.message
    ].join('\n')
    const html = `
      <h1>Nueva solicitud desde el sitio de AsoQuímica UVG</h1>
      <p><strong>Tipo:</strong> ${request.type === 'REUNION' ? 'Solicitud de reunión' : 'Consulta'}</p>
      <p><strong>Nombre:</strong> ${escapeHtml(request.name)}</p>
      <p><strong>Correo:</strong> ${escapeHtml(request.email)}</p>
      <p><strong>Teléfono:</strong> ${escapeHtml(request.phone)}</p>
      <p><strong>Fecha tentativa:</strong> ${escapeHtml(preferredAt)}</p>
      <p><strong>Asunto:</strong> ${escapeHtml(request.subject)}</p>
      <p><strong>Mensaje:</strong></p>
      <p>${escapeHtml(request.message).replaceAll('\n', '<br>')}</p>
    `.trim()

    let response: Response
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': request.deliveryKey
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          reply_to: request.email,
          subject: `[Contacto web] ${request.subject}`,
          text,
          html
        })
      })
    } catch (error) {
      logger.error('contact_email_transport_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
      throw new AppError(502, 'CONTACT_DELIVERY_FAILED', 'No pudimos enviar tu mensaje. Intenta nuevamente más tarde.')
    }

    if (!response.ok) {
      logger.error('contact_email_provider_rejected', { status: response.status })
      throw new AppError(502, 'CONTACT_DELIVERY_FAILED', 'No pudimos enviar tu mensaje. Intenta nuevamente más tarde.')
    }
  }
}
