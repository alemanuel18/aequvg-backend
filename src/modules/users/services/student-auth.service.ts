import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { containsOffensiveName } from '../../../shared/utils/name-moderation'
import { hashPassword, hmacSha256, randomToken, secureEqual, sha256, signSessionJwt, verifyPassword, verifyStudentSessionJwt } from '../../../shared/utils/auth-crypto'
import { studentAuthRepository } from '../repositories/student-auth.repository'

export const STUDENT_AUTH_COOKIE = 'aequvg_student_session'
export const STUDENT_DEVICE_COOKIE = 'aequvg_student_device'
export const STUDENT_CSRF_COOKIE = 'aequvg_student_csrf'
const SESSION_SECONDS = 8 * 60 * 60
const institutionalEmail = /^[^@\s]+@uvg\.edu\.gt$/i
const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/
const dummyPasswordHash = 'scrypt$16384$8$1$MDAwMDAwMDAwMDAwMDAwMA$MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA'

type Student = NonNullable<Awaited<ReturnType<typeof studentAuthRepository.findUserByEmail>>>

const normalizeEmail = (email: string) => email.trim().toLowerCase()
const browserContext = (headers: Headers) => `${headers.get('user-agent')?.trim() || 'unknown'}\n${headers.get('sec-ch-ua-platform')?.trim() || 'unknown'}`
const sessionSecret = () => {
  const value = process.env.SESSION_SECRET
  if (!value || Buffer.byteLength(value) < 32) throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'La autenticación de estudiantes no está configurada.')
  return value
}

const publicUser = (user: Student) => ({
  id: user.id,
  name: user.name,
  firstNames: user.firstNames,
  lastNames: user.lastNames,
  email: user.email,
  isStudent: user.isStudent,
  status: user.status,
  role: 'STUDENT' as const
})

const accessibleStudent = async (user: Student) => {
  if (!user.isStudent || !institutionalEmail.test(user.email)) throw new AppError(403, 'FORBIDDEN', 'La cuenta no cumple las condiciones de acceso estudiantil.')
  if (user.status === 'BLOQUEADO_TEMPORAL') {
    if (user.blockedUntil && user.blockedUntil <= new Date()) return studentAuthRepository.activateExpiredTemporaryBlock(user.id)
    throw new AppError(403, 'ACCOUNT_TEMPORARILY_BLOCKED', 'La cuenta está bloqueada temporalmente.', {
      blockedUntil: user.blockedUntil?.toISOString() ?? ''
    })
  }
  if (user.status === 'BLOQUEADO_PERMANENTE') {
    throw new AppError(403, 'ACCOUNT_PERMANENTLY_BLOCKED', 'La cuenta está bloqueada permanentemente.', {
      reviewChannel: user.reviewChannel ?? 'Contacta a AsoQuímica UVG para solicitar una revisión.'
    })
  }
  if (user.status === 'ELIMINADO') throw new AppError(403, 'ACCOUNT_DELETED', 'La cuenta fue eliminada y no puede iniciar sesión.')
  return user
}

const createSession = async (candidate: Student, headers: Headers) => {
  const user = await accessibleStudent(candidate)
  const id = randomUUID()
  const jti = randomToken()
  const deviceSecret = randomToken()
  const csrfToken = randomToken()
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = new Date((issuedAt + SESSION_SECONDS) * 1000)
  const accessToken = signSessionJwt({ sub: String(user.id), sid: id, jti, iat: issuedAt, exp: issuedAt + SESSION_SECONDS, iss: 'aequvg', aud: 'aequvg-student' })
  await studentAuthRepository.createSession({
    id,
    userId: user.id,
    tokenIdentifierHash: sha256(jti),
    deviceSecretHash: sha256(deviceSecret),
    browserContextHash: hmacSha256(browserContext(headers), sessionSecret()),
    csrfTokenHash: sha256(csrfToken),
    expiresAt
  })
  return { accessToken, deviceSecret, csrfToken, expiresAt, user }
}

const verifyCredentials = async (emailInput: string, password: string) => {
  const email = normalizeEmail(emailInput)
  const user = institutionalEmail.test(email) ? await studentAuthRepository.findUserByEmail(email) : null
  const passwordHash = user?.credential?.passwordHash ?? dummyPasswordHash
  const validPassword = await verifyPassword(password, passwordHash).catch(() => false)
  if (!user || !user.credential || !validPassword) throw new AppError(401, 'INVALID_CREDENTIALS', 'El correo o la contraseña no son válidos.')
  return user
}

export const studentAuthService = {
  publicUser,

  async register(input: { firstNames: string; lastNames: string; email: string; password: string; isStudent: true; role?: string }) {
    const firstNames = input.firstNames.trim().replace(/\s+/g, ' ')
    const lastNames = input.lastNames.trim().replace(/\s+/g, ' ')
    const name = `${firstNames} ${lastNames}`
    const email = normalizeEmail(input.email)
    if (input.role !== undefined) throw new AppError(422, 'ROLE_ASSIGNMENT_FORBIDDEN', 'No se permite asignar roles durante el registro estudiantil.')
    if (!input.isStudent) throw new AppError(422, 'STUDENT_STATUS_REQUIRED', 'Debes confirmar que eres estudiante de UVG.')
    if (!institutionalEmail.test(email)) throw new AppError(422, 'INSTITUTIONAL_EMAIL_REQUIRED', 'El correo debe pertenecer al dominio @uvg.edu.gt.')
    if (firstNames.length < 2 || lastNames.length < 2 || firstNames.length > 80 || lastNames.length > 80 || name.length > 160) throw new AppError(422, 'INVALID_NAME', 'Escribe nombres y apellidos válidos.')
    if (containsOffensiveName(name)) throw new AppError(422, 'OFFENSIVE_NAME', 'Los nombres o apellidos contienen términos no permitidos.')
    if (!strongPassword.test(input.password)) throw new AppError(422, 'WEAK_PASSWORD', 'La contraseña debe tener entre 12 y 128 caracteres e incluir mayúscula, minúscula, número y símbolo.')
    try {
      const user = await studentAuthRepository.createUser({ name, firstNames, lastNames, email, passwordHash: await hashPassword(input.password) })
      return publicUser(user)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Ya existe una cuenta estudiantil con ese correo institucional.')
      }
      throw error
    }
  },

  async login(email: string, password: string, headers: Headers) {
    return createSession(await verifyCredentials(email, password), headers)
  },

  async authenticate(request: Request) {
    const cookies = Object.fromEntries((request.headers.get('cookie') ?? '').split(';').map(part => part.trim().split(/=(.*)/s, 2)).filter(([name]) => name))
    const token = cookies[STUDENT_AUTH_COOKIE]
    const deviceSecret = cookies[STUDENT_DEVICE_COOKIE]
    if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Se requiere una sesión de estudiante.')
    const payload = verifyStudentSessionJwt(token)
    const session = await studentAuthRepository.findSession(payload.sid)
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.userId !== Number(payload.sub) || !secureEqual(session.tokenIdentifierHash, sha256(payload.jti))) {
      throw new AppError(401, 'INVALID_SESSION', 'La sesión no es válida o ya expiró.')
    }
    const validDevice = deviceSecret && secureEqual(session.deviceSecretHash, sha256(deviceSecret))
    const validContext = secureEqual(session.browserContextHash, hmacSha256(browserContext(request.headers), sessionSecret()))
    if (!validDevice || !validContext) {
      await studentAuthRepository.revokeSession(session.id, 'DEVICE_BINDING_MISMATCH')
      throw new AppError(401, 'SESSION_REVOKED', 'La sesión fue revocada por un cambio de dispositivo.')
    }
    const user = await accessibleStudent(session.user)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrfToken = request.headers.get('x-csrf-token')
      if (!csrfToken || !secureEqual(session.csrfTokenHash, sha256(csrfToken))) throw new AppError(403, 'CSRF_TOKEN_INVALID', 'El token de protección CSRF no es válido.')
    }
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) void studentAuthRepository.touchSession(session.id)
    return { sessionId: session.id, user }
  },

  async updateOwnProfile(userId: number, input: { firstNames: string; lastNames: string }) {
    const firstNames = input.firstNames.trim().replace(/\s+/g, ' ')
    const lastNames = input.lastNames.trim().replace(/\s+/g, ' ')
    const name = `${firstNames} ${lastNames}`
    if (firstNames.length < 2 || lastNames.length < 2 || firstNames.length > 80 || lastNames.length > 80 || name.length > 160) {
      throw new AppError(422, 'INVALID_NAME', 'Escribe nombres y apellidos válidos.')
    }
    if (containsOffensiveName(name)) throw new AppError(422, 'OFFENSIVE_NAME', 'Los nombres o apellidos contienen términos no permitidos.')
    try {
      const user = await studentAuthRepository.updateProfile(userId, { name, firstNames, lastNames })
      return publicUser(user)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new AppError(404, 'STUDENT_NOT_FOUND', 'La cuenta estudiantil no existe.')
      throw error
    }
  },

  async revokeFromRequest(request: Request, reason = 'LOGOUT') {
    const cookies = Object.fromEntries((request.headers.get('cookie') ?? '').split(';').map(part => part.trim().split(/=(.*)/s, 2)).filter(([name]) => name))
    const token = cookies[STUDENT_AUTH_COOKIE]
    if (!token) return
    try {
      const payload = verifyStudentSessionJwt(token)
      await studentAuthRepository.revokeSession(payload.sid, reason)
    } catch {
      // El cierre continúa siendo idempotente para cookies inválidas o vencidas.
    }
  },

  async deleteOwnAccount(input: { email: string; password: string; confirm: true }) {
    if (!input.confirm) throw new AppError(422, 'ACCOUNT_DELETION_CONFIRMATION_REQUIRED', 'Debes confirmar la baja de la cuenta.')
    const user = await verifyCredentials(input.email, input.password)
    if (user.status === 'ELIMINADO') throw new AppError(403, 'ACCOUNT_DELETED', 'La cuenta ya fue eliminada.')
    await studentAuthRepository.deleteAccountAndRevokeSessions(user.id)
  },

  async updateStatus(userId: number, input:
    | { status: 'ACTIVO' }
    | { status: 'BLOQUEADO_TEMPORAL'; blockedUntil: string }
    | { status: 'BLOQUEADO_PERMANENTE'; reviewChannel: string }
  ) {
    let blockedUntil: Date | null = null
    let reviewChannel: string | null = null
    if (input.status === 'BLOQUEADO_TEMPORAL') {
      blockedUntil = new Date(input.blockedUntil)
      if (Number.isNaN(blockedUntil.getTime()) || blockedUntil <= new Date()) throw new AppError(422, 'INVALID_BLOCK_END', 'La fecha de fin del bloqueo debe estar en el futuro.')
    }
    if (input.status === 'BLOQUEADO_PERMANENTE') reviewChannel = input.reviewChannel.trim()
    try {
      const user = await studentAuthRepository.updateStatusAndRevokeSessions(userId, { status: input.status, blockedUntil, reviewChannel })
      return publicUser(user)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new AppError(404, 'STUDENT_NOT_FOUND', 'La cuenta estudiantil no existe.')
      throw error
    }
  }
}
