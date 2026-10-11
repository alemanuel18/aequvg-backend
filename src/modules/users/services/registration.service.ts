import { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'
import { hashPassword } from '../../../shared/utils/auth-crypto'

const institutionalEmail = /^[^@\s]+@uvg\.edu\.gt$/i
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/

export const registrationService = {
  async request(input: { name: string; email: string; password: string }) {
    const name = input.name.trim()
    const email = input.email.trim().toLowerCase()
    if (!institutionalEmail.test(email)) throw new AppError(422, 'INSTITUTIONAL_EMAIL_REQUIRED', 'El correo debe pertenecer al dominio @uvg.edu.gt.')
    if (!strongPassword.test(input.password)) throw new AppError(422, 'WEAK_PASSWORD', 'La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo.')
    if (await prisma.administrativeUser.findUnique({ where: { email }, select: { id: true } })) {
      throw new AppError(409, 'REGISTRATION_UNAVAILABLE', 'No se pudo registrar la solicitud. Verifica los datos o contacta a administración.')
    }
    const passwordHash = await hashPassword(input.password)
    try {
      await prisma.administrativeRegistrationRequest.create({ data: { name, email, passwordHash } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'REGISTRATION_UNAVAILABLE', 'Ya hay una solicitud pendiente para ese correo.')
      }
      throw error
    }
    return { message: 'La solicitud fue enviada para revisión administrativa.' }
  },

  list() {
    return prisma.administrativeRegistrationRequest.findMany({
      where: { status: 'PENDIENTE' },
      select: { id: true, name: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    }).then(requests => requests.map(request => ({ ...request, status: 'PENDIENTE' as const })))
  },

  async review(id: number, reviewerId: number, decision: { status: 'APROBADA'; roleId: number } | { status: 'RECHAZADA' }) {
    try {
      return await prisma.$transaction(async tx => {
        const request = await tx.administrativeRegistrationRequest.findUnique({ where: { id } })
        if (!request || request.status !== 'PENDIENTE') throw new AppError(409, 'REQUEST_ALREADY_REVIEWED', 'La solicitud ya fue revisada o no existe.')
        if (decision.status === 'APROBADA') {
          const role = await tx.role.findUnique({ where: { id: decision.roleId } })
          if (!role?.active) throw new AppError(422, 'INVALID_ROLE', 'El rol indicado no está disponible.')
        }
        const claimed = await tx.administrativeRegistrationRequest.updateMany({
          where: { id, status: 'PENDIENTE' },
          data: { status: decision.status, reviewedById: reviewerId, reviewedAt: new Date(), passwordHash: null }
        })
        if (claimed.count !== 1) throw new AppError(409, 'REQUEST_ALREADY_REVIEWED', 'La solicitud ya fue revisada o no existe.')
        if (decision.status === 'APROBADA') {
          if (!request.passwordHash) throw new AppError(409, 'REQUEST_PASSWORD_MISSING', 'La solicitud no tiene credenciales válidas.')
          if (await tx.administrativeUser.findUnique({ where: { email: request.email }, select: { id: true } })) {
            throw new AppError(409, 'REGISTRATION_UNAVAILABLE', 'La cuenta ya existe.')
          }
          await tx.administrativeUser.create({
            data: { name: request.name, email: request.email, roleId: decision.roleId, credential: { create: { passwordHash: request.passwordHash } } }
          })
        }
        return { id, status: decision.status }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'REGISTRATION_UNAVAILABLE', 'La cuenta o solicitud ya existe.')
      }
      throw error
    }
  }
}
