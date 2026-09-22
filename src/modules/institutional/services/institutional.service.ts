import type { InstitutionalBlockType, ContentStatus } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText, isHttpUrl } from '../../../shared/utils/text'
import { institutionalRepository } from '../repositories/institutional.repository'

export type BlockInput = {
  type: InstitutionalBlockType; title: string; subtitle?: string | null; body: string; imageUrl?: string | null
  actionLabel?: string | null; actionUrl?: string | null; displayOrder?: number; status?: ContentStatus
}

const normalize = (input: BlockInput) => {
  if (input.imageUrl && !isHttpUrl(input.imageUrl)) throw new AppError(422, 'INVALID_IMAGE_URL', 'La URL de imagen debe usar HTTP o HTTPS.')
  if (input.actionUrl && !isHttpUrl(input.actionUrl) && !input.actionUrl.startsWith('/')) throw new AppError(422, 'INVALID_ACTION_URL', 'El enlace de acción no es válido.')
  const status = input.status ?? 'BORRADOR'
  return {
    ...input,
    title: cleanText(input.title), subtitle: input.subtitle ? cleanText(input.subtitle) : null, body: cleanText(input.body),
    actionLabel: input.actionLabel ? cleanText(input.actionLabel) : null,
    displayOrder: input.displayOrder ?? 0,
    status,
    publishedAt: status === 'PUBLICADO' ? new Date() : null
  }
}

export const institutionalService = {
  publicList: institutionalRepository.listPublished,
  adminList: institutionalRepository.listAll,
  create: (input: BlockInput) => institutionalRepository.create(normalize(input)),
  update: (id: number, input: BlockInput) => institutionalRepository.update(id, normalize(input)),
  archive: institutionalRepository.archive
}
