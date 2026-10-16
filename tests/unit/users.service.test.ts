import { beforeEach, describe, expect, it, vi } from 'vitest'

const userRepositoryMocks = vi.hoisted(() => ({
  list: vi.fn(), findById: vi.fn(), findRole: vi.fn(), listRoles: vi.fn(), create: vi.fn(), update: vi.fn(),
  updateAndRevokeSessions: vi.fn(), setPasswordAndRevokeSessions: vi.fn()
}))

vi.mock('../../src/modules/users/repositories/users.repository', () => ({ usersRepository: userRepositoryMocks }))

import { usersService } from '../../src/modules/users/services/users.service'

const role = { id: 1, name: 'ASSOCIATION_REPRESENTATIVE', description: null, active: true, permissions: [] }
const user = {
  id: 1, roleId: 1, name: 'Ana Representante', firstNames: 'Ana', lastNames: 'Representante', email: 'representante@uvg.edu.gt', status: 'ACTIVO',
  createdAt: new Date(), updatedAt: new Date(), role, identities: [], credential: { userId: 1 }
}

describe('gestión de usuarios administrativos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rechaza cuentas externas y contraseñas débiles', async () => {
    await expect(usersService.create({ firstNames: 'Ana', lastNames: 'Persona', email: 'persona@example.com', roleId: 1 })).rejects.toMatchObject({ code: 'INSTITUTIONAL_EMAIL_REQUIRED' })
    userRepositoryMocks.findRole.mockResolvedValue(role)
    await expect(usersService.create({ firstNames: 'Ana', lastNames: 'Persona', email: 'persona@uvg.edu.gt', roleId: 1, password: 'debil' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' })
  })

  it('normaliza el correo y asigna únicamente roles activos', async () => {
    userRepositoryMocks.findRole.mockResolvedValue(role)
    userRepositoryMocks.create.mockResolvedValue(user)
    await usersService.create({ firstNames: ' Ana ', lastNames: ' Representante ', email: 'REPRESENTANTE@UVG.EDU.GT', roleId: 1, password: 'Clave-segura-123!' })
    expect(userRepositoryMocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana Representante', firstNames: 'Ana', lastNames: 'Representante', email: 'representante@uvg.edu.gt', roleId: 1, passwordHash: expect.stringMatching(/^scrypt\$/) }))
  })

  it('revoca sesiones al cambiar rol o estado', async () => {
    userRepositoryMocks.findRole.mockResolvedValue(role)
    userRepositoryMocks.updateAndRevokeSessions.mockResolvedValue(user)
    await usersService.update(1, { roleId: 1, status: 'BLOQUEADO' })
    expect(userRepositoryMocks.updateAndRevokeSessions).toHaveBeenCalledWith(
      1,
      { roleId: 1, status: 'BLOQUEADO', firstNames: undefined, lastNames: undefined },
      'ACCOUNT_AUTHORIZATION_CHANGED'
    )
  })

  it('cambia la contraseña mediante la operación atómica que revoca sesiones', async () => {
    userRepositoryMocks.findById.mockResolvedValue(user)
    userRepositoryMocks.setPasswordAndRevokeSessions.mockResolvedValue(undefined)
    await usersService.setPassword(1, 'Clave-segura-123!')
    expect(userRepositoryMocks.setPasswordAndRevokeSessions).toHaveBeenCalledWith(1, expect.stringMatching(/^scrypt\$/))
  })
})
