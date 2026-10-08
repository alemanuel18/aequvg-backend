import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  publicList: vi.fn(), adminList: vi.fn(), findById: vi.fn(), findIds: vi.fn(), findImage: vi.fn(), create: vi.fn(), update: vi.fn(), retire: vi.fn(), reorder: vi.fn()
}))
vi.mock('../../src/modules/board/repositories/board.repository', () => ({ boardRepository: repositoryMocks }))

import { boardService, normalizeBoardInput } from '../../src/modules/board/services/board.service'

const valid = { name: 'Ana Pérez', position: 'Presidenta', institutionalEmail: ' ANA@UVG.EDU.GT ', term: '2026–2027', termStartsAt: '2026-01-01', termEndsAt: '2027-01-01', displayOrder: 1, status: 'ACTIVO' as const }

describe('servicio de Junta Directiva', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normaliza correo y fechas del periodo', async () => {
    await expect(normalizeBoardInput(valid)).resolves.toMatchObject({ institutionalEmail: 'ana@uvg.edu.gt', termStartsAt: new Date('2026-01-01T00:00:00.000Z'), termEndsAt: new Date('2027-01-01T00:00:00.000Z') })
  })

  it('rechaza correo externo y periodo invertido', async () => {
    await expect(normalizeBoardInput({ ...valid, institutionalEmail: 'ana@gmail.com' })).rejects.toMatchObject({ code: 'INVALID_INSTITUTIONAL_EMAIL' })
    await expect(normalizeBoardInput({ ...valid, termEndsAt: '2025-01-01' })).rejects.toMatchObject({ code: 'INVALID_TERM' })
  })

  it('rechaza periodos con una sola fecha y órdenes con IDs manipulados', async () => {
    await expect(normalizeBoardInput({ ...valid, termEndsAt: null })).rejects.toMatchObject({ code: 'INVALID_TERM' })
    repositoryMocks.findIds.mockResolvedValue([{ id: 1 }])
    await expect(boardService.reorder([{ id: 1, displayOrder: 0 }, { id: 999, displayOrder: 1 }])).rejects.toMatchObject({ code: 'INVALID_BOARD_ORDER' })
    expect(repositoryMocks.reorder).not.toHaveBeenCalled()
  })

  it('valida que la fotografía exista y sea una imagen', async () => {
    repositoryMocks.findImage.mockResolvedValue({ id: 8, mimeType: 'application/pdf' })
    await expect(normalizeBoardInput({ ...valid, photoId: 8 })).rejects.toMatchObject({ code: 'INVALID_BOARD_PHOTO' })
    repositoryMocks.findImage.mockResolvedValue({ id: 9, mimeType: 'image/jpeg' })
    await expect(normalizeBoardInput({ ...valid, photoId: 9 })).resolves.toMatchObject({ photoId: 9 })
  })

  it('no permite modificar o retirar IDs inexistentes', async () => {
    repositoryMocks.findById.mockResolvedValue(null)
    await expect(boardService.update(999999, valid)).rejects.toMatchObject({ status: 404, code: 'BOARD_MEMBER_NOT_FOUND' })
    await expect(boardService.retire(999999)).rejects.toMatchObject({ status: 404, code: 'BOARD_MEMBER_NOT_FOUND' })
    expect(repositoryMocks.update).not.toHaveBeenCalled()
    expect(repositoryMocks.retire).not.toHaveBeenCalled()
  })
})
