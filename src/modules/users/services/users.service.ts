import { Prisma } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { hashPassword } from '../../../shared/utils/auth-crypto'
import { authRepository } from '../repositories/auth.repository'
import { usersRepository } from '../repositories/users.repository'

const institutionalEmail = /^[^@\s]+@uvg\.edu\.gt$/i
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/

type PublicUserSource = NonNullable<Awaited<ReturnType<typeof usersRepository.findById>>>
type RoleSource = Awaited<ReturnType<typeof usersRepository.listRoles>>[number]

const serializeUser = (user: PublicUserSource) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
  role: { id: user.role.id, name: user.role.name },
  authenticationProviders: [
    ...(user.credential ? ['PASSWORD' as const] : []),
    ...user.identities.map(identity => identity.provider)
  ],
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
})

const serializeRole = (role: RoleSource) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  permissions: role.permissions.map(item => item.permission.code).sort()
})

const assertRole = async (roleId: number) => {
  const role = await usersRepository.findRole(roleId)
  if (!role || !role.active) throw new AppError(422, 'INVALID_ROLE', 'El rol indicado no está disponible.')
}

const assertPassword = (password: string) => {
  if (!strongPassword.test(password)) throw new AppError(422, 'WEAK_PASSWORD', 'La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo.')
}

const mapPersistenceError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Ya existe una cuenta con ese correo institucional.')
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new AppError(404, 'USER_NOT_FOUND', 'El usuario administrativo no existe.')
  throw error
}

export const usersService = {
  async list() {
    return (await usersRepository.list()).map(serializeUser)
  },

  async roles() {
    return (await usersRepository.listRoles()).map(serializeRole)
  },

  async create(input: { name: string; email: string; roleId: number; password?: string }) {
    const name = input.name.trim()
    const email = input.email.trim().toLowerCase()
    if (!institutionalEmail.test(email)) throw new AppError(422, 'INSTITUTIONAL_EMAIL_REQUIRED', 'El correo debe pertenecer al dominio @uvg.edu.gt.')
    await assertRole(input.roleId)
    if (input.password) assertPassword(input.password)
    try {
      const user = await usersRepository.create({ name, email, roleId: input.roleId, passwordHash: input.password ? await hashPassword(input.password) : undefined })
      return serializeUser(user)
    } catch (error) {
      return mapPersistenceError(error)
    }
  },

  async update(id: number, input: { name?: string; roleId?: number; status?: 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO' }) {
    if (input.roleId !== undefined) await assertRole(input.roleId)
    try {
      const user = await usersRepository.update(id, { ...input, name: input.name?.trim() })
      if (input.roleId !== undefined || input.status !== undefined) await authRepository.revokeUserSessions(id, 'ACCOUNT_AUTHORIZATION_CHANGED')
      return serializeUser(user)
    } catch (error) {
      return mapPersistenceError(error)
    }
  },

  async setPassword(id: number, password: string) {
    assertPassword(password)
    if (!await usersRepository.findById(id)) throw new AppError(404, 'USER_NOT_FOUND', 'El usuario administrativo no existe.')
    await usersRepository.setPassword(id, await hashPassword(password))
    await authRepository.revokeUserSessions(id, 'PASSWORD_CHANGED')
    return { message: 'Contraseña actualizada; las sesiones anteriores fueron revocadas.' }
  }
}
