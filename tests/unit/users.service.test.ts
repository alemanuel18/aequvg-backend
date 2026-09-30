import { beforeEach, describe, expect, it, vi } from 'vitest'

const userRepositoryMocks = vi.hoisted(() => ({
  list: vi.fn(), findById: vi.fn(), findRole: vi.fn(), listRoles: vi.fn(), create: vi.fn(), update: vi.fn(), setPassword: vi.fn()
}))
const authRepositoryMocks = vi.hoisted(() => ({ revokeUserSessions: vi.fn() }))

vi.mock('../../src/modules/users/repositories/users.repository', () => ({ usersRepository: userRepositoryMocks }))
vi.mock('../../src/modules/users/repositories/auth.repository', () => ({ authRepository: authRepositoryMocks }))

import { usersService } from '../../src/modules/users/services/users.service'

const role = { id: 1, name: 'ASSOCIATION_REPRESENTATIVE', description: null, active: true, permissions: [] }
const user = {
  id: 1, roleId: 1, name: 'Representante', email: 'representante@uvg.edu.gt', status: 'ACTIVO',
  createdAt: new Date(), updatedAt: new Date(), role, identities: [], credential: { userId: 1 }
}

describe('gestión de usuarios administrativos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rechaza cuentas externas y contraseñas débiles', async () => {
    await expect(usersService.create({ name: 'Persona', email: 'persona@example.com', roleId: 1 })).rejects.toMatchObject({ code: 'INSTITUTIONAL_EMAIL_REQUIRED' })
    userRepositoryMocks.findRole.mockResolvedValue(role)
    await expect(usersService.create({ name: 'Persona', email: 'persona@uvg.edu.gt', roleId: 1, password: 'debil' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' })
  })

  it('normaliza el correo y asigna únicamente roles activos', async () => {
    userRepositoryMocks.findRole.mockResolvedValue(role)
    userRepositoryMocks.create.mockResolvedValue(user)
    await usersService.create({ name: ' Representante ', email: 'REPRESENTANTE@UVG.EDU.GT', roleId: 1, password: 'Clave-segura-123!' })
    expect(userRepositoryMocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Representante', email: 'representante@uvg.edu.gt', roleId: 1, passwordHash: expect.stringMatching(/^scrypt\$/) }))
  })

  it('revoca sesiones al cambiar rol o estado', async () => {
    userRepositoryMocks.findRole.mockResolvedValue(role)
    userRepositoryMocks.update.mockResolvedValue(user)
    await usersService.update(1, { roleId: 1, status: 'BLOQUEADO' })
    expect(authRepositoryMocks.revokeUserSessions).toHaveBeenCalledWith(1, 'ACCOUNT_AUTHORIZATION_CHANGED')
  })
})
