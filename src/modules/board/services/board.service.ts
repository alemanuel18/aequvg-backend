import type { BoardMemberStatus } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import { boardRepository } from '../repositories/board.repository'

export type BoardInput = { name: string; position: string; description?: string | null; institutionalEmail: string; term: string; termStartsAt?: string | null; termEndsAt?: string | null; displayOrder?: number; status?: BoardMemberStatus }

const normalize = (input: BoardInput) => {
  if (!input.institutionalEmail.toLowerCase().endsWith('@uvg.edu.gt')) throw new AppError(422, 'INVALID_INSTITUTIONAL_EMAIL', 'El correo autorizado debe pertenecer a @uvg.edu.gt.')
  if (input.termStartsAt && input.termEndsAt && input.termStartsAt > input.termEndsAt) throw new AppError(422, 'INVALID_TERM', 'El inicio del período debe ser anterior al final.')
  return { name: cleanText(input.name), position: cleanText(input.position), description: input.description ? cleanText(input.description) : null, institutionalEmail: input.institutionalEmail.toLowerCase(), term: cleanText(input.term), termStartsAt: input.termStartsAt ? new Date(input.termStartsAt) : null, termEndsAt: input.termEndsAt ? new Date(input.termEndsAt) : null, displayOrder: input.displayOrder ?? 0, status: input.status ?? 'ACTIVO' as BoardMemberStatus }
}

export const boardService = { publicList: boardRepository.publicList, adminList: boardRepository.adminList, create: (input: BoardInput) => boardRepository.create(normalize(input)), update: (id: number, input: BoardInput) => boardRepository.update(id, normalize(input)), retire: boardRepository.retire, reorder: boardRepository.reorder }
