import { AppError } from '../../../shared/errors/app-error'
import { logger } from '../../../shared/logging/logger'

const mailConfig = () => {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.CONTACT_FROM_EMAIL?.trim()
  if (!apiKey || !from) throw new AppError(503, 'AUTH_EMAIL_NOT_CONFIGURED', 'El correo de recuperación no está disponible temporalmente.')
  return { apiKey, from }
}

export const authEmailService = {
  async sendPasswordRecovery(recipient: string, resetUrl: string) {
    const { apiKey, from } = mailConfig()
    let response: Response
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: 'Recuperación de acceso administrativo · AsoQuímica UVG',
          text: `Solicitaste cambiar la contraseña de tu cuenta administrativa. Abre este enlace en los próximos 30 minutos: ${resetUrl}\n\nSi no solicitaste este cambio, ignora este correo.`,
          html: `<p>Solicitaste cambiar la contraseña de tu cuenta administrativa de AsoQuímica UVG.</p><p><a href="${resetUrl}">Crear una contraseña nueva</a></p><p>El enlace vence en 30 minutos y solo puede usarse una vez. Si no solicitaste este cambio, ignora este correo.</p>`
        })
      })
    } catch (error) {
      logger.error('password_recovery_email_transport_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
      throw new AppError(502, 'RECOVERY_EMAIL_FAILED', 'No se pudo enviar el correo de recuperación.')
    }
    if (!response.ok) {
      logger.error('password_recovery_email_provider_rejected', { status: response.status })
      throw new AppError(502, 'RECOVERY_EMAIL_FAILED', 'No se pudo enviar el correo de recuperación.')
    }
  }
}
