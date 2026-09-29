import type { ContactMethodType, ContactRequestStatus, ContactRequestType } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText, isHttpUrl } from '../../../shared/utils/text'
import { contactRepository } from '../repositories/contact.repository'

export type RequestInput = { name: string; email: string; phone: string; type: ContactRequestType; subject: string; message: string; preferredAt?: string | null; consent: true; privacyVersion: string; website?: string }
export type MethodInput = { type: ContactMethodType; label: string; value: string; url?: string | null; displayOrder?: number; active?: boolean }

export const normalizeContactRequest = (input: RequestInput) => {
  if (!input.consent) throw new AppError(422, 'CONSENT_REQUIRED', 'Debes aceptar el aviso de privacidad.')
  if (input.website) throw new AppError(400, 'INVALID_REQUEST', 'La solicitud no es válida.')
  if (input.type === 'REUNION' && !input.preferredAt) throw new AppError(422, 'PREFERRED_DATE_REQUIRED', 'Indica una fecha tentativa para la reunión.', { preferredAt: 'Campo obligatorio para reuniones.' })
  return { name: cleanText(input.name), email: input.email.trim().toLowerCase(), phone: cleanText(input.phone), type: input.type, subject: cleanText(input.subject), message: cleanText(input.message), preferredAt: input.preferredAt ? new Date(input.preferredAt) : null, consentedAt: new Date(), privacyVersion: cleanText(input.privacyVersion) }
}

const normalizeMethod = (input: MethodInput) => {
  if (input.url && !isHttpUrl(input.url) && !input.url.startsWith('mailto:') && !input.url.startsWith('tel:')) throw new AppError(422, 'INVALID_CONTACT_URL', 'El enlace del medio de contacto no es válido.')
  return { ...input, label: cleanText(input.label), value: cleanText(input.value), displayOrder: input.displayOrder ?? 0, active: input.active ?? true }
}

export const contactService = {
  publicMethods: contactRepository.publicMethods,
  allMethods: contactRepository.allMethods,
  createMethod: (input: MethodInput) => contactRepository.createMethod(normalizeMethod(input)),
  updateMethod: (id: number, input: MethodInput) => contactRepository.updateMethod(id, normalizeMethod(input)),
  deactivateMethod: contactRepository.deactivateMethod,
  createRequest: (input: RequestInput) => contactRepository.createRequest(normalizeContactRequest(input)),
  async listRequests(page: number, pageSize: number) { const [items, total] = await Promise.all([contactRepository.listRequests((page - 1) * pageSize, pageSize), contactRepository.countRequests()]); return { items, pagination: { page, pageSize, total } } },
  updateRequest: (id: number, status: ContactRequestStatus, assignedToId?: number | null) => contactRepository.updateRequest(id, { status, assignedTo: assignedToId ? { connect: { id: assignedToId } } : undefined })
}
