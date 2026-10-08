import type { BoardMemberStatus, Prisma } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import { boardRepository } from '../repositories/board.repository'

export type BoardInput = { photoId?: number | null; name: string; position: string; description?: string | null; institutionalEmail: string; term: string; termStartsAt?: string | null; termEndsAt?: string | null; displayOrder?: number; status?: BoardMemberStatus }

const notFound = () => new AppError(404, 'BOARD_MEMBER_NOT_FOUND', 'El integrante de junta solicitado no existe.')

export const normalizeBoardInput = async (input: BoardInput): Promise<Prisma.BoardMemberUncheckedCreateInput> => {
  const email = input.institutionalEmail.trim().toLowerCase()
  const name = cleanText(input.name)
  const position = cleanText(input.position)
  const term = cleanText(input.term)
  if (name.length < 2 || position.length < 2 || term.length < 2) throw new AppError(422, 'INVALID_BOARD_CONTENT', 'Nombre, cargo y periodo deben contener texto válido.')
  if (!/^[^\s@]+@uvg\.edu\.gt$/i.test(email)) throw new AppError(422, 'INVALID_INSTITUTIONAL_EMAIL', 'El correo institucional debe pertenecer exactamente a @uvg.edu.gt.')
  if (Boolean(input.termStartsAt) !== Boolean(input.termEndsAt)) throw new AppError(422, 'INVALID_TERM', 'El período debe incluir ambas fechas o ninguna.')
  if (input.termStartsAt && input.termEndsAt && input.termStartsAt > input.termEndsAt) throw new AppError(422, 'INVALID_TERM', 'El inicio del período debe ser anterior al final.')
  if (input.photoId) {
    const photo = await boardRepository.findImage(input.photoId)
    if (!photo || !photo.mimeType.toLowerCase().startsWith('image/')) throw new AppError(422, 'INVALID_BOARD_PHOTO', 'La fotografía indicada no existe o no es una imagen válida.')
  }
  return { photoId: input.photoId ?? null, name, position, description: input.description ? cleanText(input.description) : null, institutionalEmail: email, term, termStartsAt: input.termStartsAt ? new Date(`${input.termStartsAt}T00:00:00.000Z`) : null, termEndsAt: input.termEndsAt ? new Date(`${input.termEndsAt}T00:00:00.000Z`) : null, displayOrder: input.displayOrder ?? 0, status: input.status ?? 'ACTIVO' as BoardMemberStatus }
}

export const boardService = {
  publicList: boardRepository.publicList,
  adminList: boardRepository.adminList,
  async create(input: BoardInput) { return boardRepository.create(await normalizeBoardInput(input)) },
  async update(id: number, input: BoardInput) {
    if (!await boardRepository.findById(id)) throw notFound()
    return boardRepository.update(id, await normalizeBoardInput(input))
  },
  async retire(id: number) {
    if (!await boardRepository.findById(id)) throw notFound()
    return boardRepository.retire(id)
  },
  async reorder(items: { id: number; displayOrder: number }[]) {
    const ids = items.map(item => item.id)
    if (new Set(ids).size !== ids.length || (await boardRepository.findIds(ids)).length !== ids.length) throw new AppError(422, 'INVALID_BOARD_ORDER', 'El orden contiene integrantes duplicados o inexistentes.')
    return boardRepository.reorder(items)
  }
}
