import type { BoardMemberStatus, Prisma } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import { boardRepository } from '../repositories/board.repository'

export type BoardInput = { name: string; position: string; description?: string | null; institutionalEmail: string; termStartsAt: string; termEndsAt: string; displayOrder?: number; status?: BoardMemberStatus }

const notFound = () => new AppError(404, 'BOARD_MEMBER_NOT_FOUND', 'El integrante de junta solicitado no existe.')

export const normalizeBoardInput = async (input: BoardInput, currentDisplayOrder = 0): Promise<Prisma.BoardMemberUncheckedCreateInput> => {
  const email = input.institutionalEmail.trim().toLowerCase()
  const name = cleanText(input.name)
  const position = cleanText(input.position)
  if (name.length < 2 || position.length < 2) throw new AppError(422, 'INVALID_BOARD_CONTENT', 'Nombre y cargo deben contener texto válido.')
  if (!/^[^\s@]+@uvg\.edu\.gt$/i.test(email)) throw new AppError(422, 'INVALID_INSTITUTIONAL_EMAIL', 'El correo institucional debe pertenecer exactamente a @uvg.edu.gt.')
  if (input.termStartsAt > input.termEndsAt) throw new AppError(422, 'INVALID_TERM', 'El inicio del período debe ser anterior al final.')
  const startYear = Number(input.termStartsAt.slice(0, 4))
  const endYear = Number(input.termEndsAt.slice(0, 4))
  const term = startYear === endYear ? String(startYear) : `${startYear}–${endYear}`
  return { name, position, description: input.description ? cleanText(input.description) : null, institutionalEmail: email, term, termStartsAt: new Date(`${input.termStartsAt}T00:00:00.000Z`), termEndsAt: new Date(`${input.termEndsAt}T00:00:00.000Z`), displayOrder: input.displayOrder ?? currentDisplayOrder, status: input.status ?? 'ACTIVO' as BoardMemberStatus }
}

export const boardService = {
  publicList: boardRepository.publicList,
  adminList: boardRepository.adminList,
  async create(input: BoardInput) { return boardRepository.create(await normalizeBoardInput(input)) },
  async update(id: number, input: BoardInput) {
    const current = await boardRepository.findById(id)
    if (!current) throw notFound()
    return boardRepository.update(id, await normalizeBoardInput(input, current.displayOrder))
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
