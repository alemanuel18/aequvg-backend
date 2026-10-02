import { AuthenticationProvider } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

const userAuthenticationInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  credential: true
} as const

export const authRepository = {
  findUserByEmail: (email: string) => prisma.administrativeUser.findUnique({
    where: { email },
    include: userAuthenticationInclude
  }),

  findSession: (id: string) => prisma.administrativeSession.findUnique({
    where: { id },
    include: { user: { include: userAuthenticationInclude } }
  }),

  createSession: (data: {
    id: string
    userId: number
    tokenIdentifierHash: string
    deviceSecretHash: string
    browserContextHash: string
    csrfTokenHash: string
    expiresAt: Date
  }) => prisma.administrativeSession.create({ data }),

  touchSession: (id: string) => prisma.administrativeSession.update({
    where: { id }, data: { lastSeenAt: new Date() }
  }),

  revokeSession: (id: string, reason: string) => prisma.administrativeSession.updateMany({
    where: { id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: reason }
  }),

  revokeUserSessions: (userId: number, reason: string) => prisma.administrativeSession.updateMany({
    where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: reason }
  }),

  createMicrosoftChallenge: (data: {
    id: string
    stateHash: string
    verifierHash: string
    nonce: string
    returnTo: string | null
    expiresAt: Date
  }) => prisma.microsoftLoginChallenge.create({ data }),

  consumeMicrosoftChallenge: async (stateHash: string) => prisma.$transaction(async tx => {
    const challenge = await tx.microsoftLoginChallenge.findUnique({ where: { stateHash } })
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) return null
    const consumed = await tx.microsoftLoginChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() }
    })
    return consumed.count === 1 ? challenge : null
  }),

  linkMicrosoftIdentity: async (email: string, subject: string) => prisma.$transaction(async tx => {
    const existingIdentity = await tx.administrativeIdentity.findUnique({
      where: { provider_providerSubject: { provider: AuthenticationProvider.MICROSOFT, providerSubject: subject } },
      include: { user: { include: userAuthenticationInclude } }
    })
    if (existingIdentity) return existingIdentity.user
    const user = await tx.administrativeUser.findUnique({ where: { email }, include: userAuthenticationInclude })
    if (!user) return null
    await tx.administrativeIdentity.create({
      data: { userId: user.id, provider: AuthenticationProvider.MICROSOFT, providerSubject: subject }
    })
    return user
  })
}
