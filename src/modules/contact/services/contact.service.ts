import { Prisma, type ContactMethodType, type ContactRequestType } from '@prisma/client'
import { createHash } from 'node:crypto'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText, isHttpUrl } from '../../../shared/utils/text'
import { contactRepository } from '../repositories/contact.repository'
import { contactEmailService } from './contact-email.service'

export type RequestInput = { name: string; email: string; phone: string; type: ContactRequestType; subject: string; message: string; preferredAt?: string | null; consent: true; privacyVersion: string; website?: string }
export type MethodInput = { type: ContactMethodType; label: string; value: string; url?: string | null; displayOrder?: number; active?: boolean }

export const normalizeContactRequest = (input: RequestInput) => {
  if (!input.consent) throw new AppError(422, 'CONSENT_REQUIRED', 'Debes aceptar el aviso de privacidad.')
  if (input.website) throw new AppError(400, 'INVALID_REQUEST', 'La solicitud no es válida.')
  if (input.type === 'REUNION' && !input.preferredAt) throw new AppError(422, 'PREFERRED_DATE_REQUIRED', 'Indica una fecha tentativa para la reunión.', { preferredAt: 'Campo obligatorio para reuniones.' })
  return { name: cleanText(input.name), email: input.email.trim().toLowerCase(), phone: cleanText(input.phone), type: input.type, subject: cleanText(input.subject), message: cleanText(input.message), preferredAt: input.preferredAt ? new Date(input.preferredAt) : null, consentedAt: new Date(), privacyVersion: cleanText(input.privacyVersion) }
}

const normalizeMethod = (input: MethodInput) => {
  const label = cleanText(input.label)
  const value = cleanText(input.value)
  const suppliedUrl = input.url?.trim() || null
  let url = suppliedUrl

  if (input.type === 'EMAIL') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new AppError(422, 'INVALID_CONTACT_EMAIL', 'Ingresa un correo de contacto válido.', { value: 'El correo no es válido.' })
    url = `mailto:${value.toLowerCase()}`
  } else if (input.type === 'TELEFONO') {
    if (!/^[+\d][\d\s().-]{6,39}$/.test(value)) throw new AppError(422, 'INVALID_CONTACT_PHONE', 'Ingresa un teléfono de contacto válido.', { value: 'El teléfono no es válido.' })
    url = suppliedUrl ?? `tel:${value.replace(/[^+\d]/g, '')}`
  } else {
    if (!suppliedUrl || !isHttpUrl(suppliedUrl)) throw new AppError(422, 'CONTACT_URL_REQUIRED', 'Este medio requiere un enlace HTTPS válido.', { url: 'Ingresa un enlace válido.' })
    const parsedUrl = new URL(suppliedUrl)
    if (parsedUrl.protocol !== 'https:') throw new AppError(422, 'INVALID_CONTACT_URL', 'El enlace del medio de contacto debe usar HTTPS.', { url: 'El enlace debe iniciar con https://.' })
    if (input.type === 'UBICACION' && !/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$|(^|\.)maps\.app\.goo\.gl$/i.test(parsedUrl.hostname)) {
      throw new AppError(422, 'GOOGLE_MAPS_URL_REQUIRED', 'La ubicación debe enlazar a Google Maps.', { url: 'Usa un enlace de Google Maps.' })
    }
  }

  return { ...input, label, value: input.type === 'EMAIL' ? value.toLowerCase() : value, url, displayOrder: input.displayOrder ?? 0, active: input.active ?? true }
}

const translateMissingMethod = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    throw new AppError(404, 'CONTACT_METHOD_NOT_FOUND', 'El medio de contacto no existe.')
  }
  throw error
}

export const contactService = {
  publicMethods: contactRepository.publicMethods,
  allMethods: contactRepository.allMethods,
  createMethod: (input: MethodInput) => contactRepository.createMethod(normalizeMethod(input)),
  updateMethod: (id: number, input: MethodInput) => contactRepository.updateMethod(id, normalizeMethod(input)).catch(translateMissingMethod),
  deactivateMethod: (id: number) => contactRepository.deactivateMethod(id).catch(translateMissingMethod),
  async sendRequest(input: RequestInput) {
    const request = normalizeContactRequest(input)
    const recipient = await contactRepository.primaryEmailMethod()
    if (!recipient) throw new AppError(503, 'CONTACT_RECIPIENT_NOT_CONFIGURED', 'El formulario de contacto no está disponible temporalmente.')
    const minuteBucket = Math.floor(Date.now() / 60_000)
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...request, consentedAt: request.consentedAt.toISOString(), preferredAt: request.preferredAt?.toISOString(), minuteBucket })).digest('hex')
    await contactEmailService.send(recipient.value, { ...request, deliveryKey: `contact/${fingerprint}` })
    return { accepted: true as const }
  }
}
