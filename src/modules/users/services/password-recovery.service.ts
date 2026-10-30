import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'
import { logger } from '../../../shared/logging/logger'
import { hashPassword, randomToken, sha256 } from '../../../shared/utils/auth-crypto'
import { authEmailService } from './auth-email.service'

const GENERIC_MESSAGE = 'Si existe una cuenta administrativa con ese correo, enviaremos un enlace de recuperación.'
const TOKEN_TTL_MS = 30 * 60 * 1000
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/

const recoveryUrl = (token: string) => {
  const base = process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3001'
  const url = new URL('/administrador/reset-password', base)
  url.hash = new URLSearchParams({ token }).toString()
  return url.toString()
}

export const passwordRecoveryService = {
  async request(emailInput: string) {
    const email = emailInput.trim().toLowerCase()
    const user = await prisma.administrativeUser.findUnique({
      where: { email },
      include: { role: true }
    })
    if (!user || user.status !== 'ACTIVO' || !user.role.active) return { message: GENERIC_MESSAGE }

    const token = randomToken()
    const tokenHash = sha256(token)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await prisma.$transaction(async tx => {
      await tx.administrativePasswordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() }
      })
      await tx.administrativePasswordReset.create({ data: { userId: user.id, tokenHash, expiresAt } })
    })

    try {
      await authEmailService.sendPasswordRecovery(email, recoveryUrl(token))
    } catch (error) {
      logger.error('password_recovery_delivery_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
      await prisma.administrativePasswordReset.updateMany({
        where: { tokenHash, usedAt: null }, data: { usedAt: new Date() }
      }).catch(() => undefined)
    }
    return { message: GENERIC_MESSAGE }
  },

  async reset(token: string, password: string) {
    if (!strongPassword.test(password)) throw new AppError(422, 'WEAK_PASSWORD', 'La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo.')
    const passwordHash = await hashPassword(password)
    const tokenHash = sha256(token)
    return prisma.$transaction(async tx => {
      const reset = await tx.administrativePasswordReset.findUnique({
        where: { tokenHash }, include: { user: { include: { role: true } } }
      })
      const now = new Date()
      if (!reset || reset.usedAt || reset.expiresAt <= now || reset.user.status !== 'ACTIVO' || !reset.user.role.active) {
        throw new AppError(422, 'INVALID_RECOVERY_TOKEN', 'El enlace no es válido o ya venció. Solicita uno nuevo.')
      }
      const claimed = await tx.administrativePasswordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now }
      })
      if (claimed.count !== 1) throw new AppError(422, 'INVALID_RECOVERY_TOKEN', 'El enlace no es válido o ya venció. Solicita uno nuevo.')
      await tx.administrativeCredential.upsert({
        where: { userId: reset.userId }, update: { passwordHash }, create: { userId: reset.userId, passwordHash }
      })
      await tx.administrativeSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_RECOVERED' }
      })
      await tx.administrativePasswordReset.updateMany({
        where: { userId: reset.userId, id: { not: reset.id }, usedAt: null }, data: { usedAt: now }
      })
      return { message: 'La contraseña se actualizó. Inicia sesión con la nueva contraseña.' }
    })
  }
}
