import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  updateProfile: vi.fn(),
  findSession: vi.fn(),
  createUser: vi.fn(),
  createSession: vi.fn(),
  touchSession: vi.fn(),
  revokeSession: vi.fn(),
  activateExpiredTemporaryBlock: vi.fn(),
  updateStatusAndRevokeSessions: vi.fn(),
  deleteAccountAndRevokeSessions: vi.fn()
}))

vi.mock('../../src/modules/users/repositories/student-auth.repository', () => ({ studentAuthRepository: repositoryMocks }))

import { studentAuthService } from '../../src/modules/users/services/student-auth.service'
import { hashPassword } from '../../src/shared/utils/auth-crypto'

const activeStudent = async () => ({
  id: 41,
  name: 'Estudiante UVG',
  firstNames: 'Estudiante',
  lastNames: 'UVG',
  email: 'estudiante@uvg.edu.gt',
  isStudent: true,
  status: 'ACTIVO' as const,
  blockedUntil: null,
  reviewChannel: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  credential: { userId: 41, passwordHash: await hashPassword('Clave-estudiante-123!'), updatedAt: new Date() }
})

describe('servicio de acceso estudiantil', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_SECRET = 'secreto-estudiantil-de-pruebas-32-caracteres'
  })

  afterEach(() => { delete process.env.SESSION_SECRET })

  it('crea siempre una cuenta estudiantil sin aceptar un rol desde el cliente', async () => {
    const user = await activeStudent()
    repositoryMocks.createUser.mockResolvedValue(user)
    await expect(studentAuthService.register({
      firstNames: ' Estudiante ',
      lastNames: ' UVG ',
      email: 'ESTUDIANTE@UVG.EDU.GT',
      password: 'Clave-estudiante-123!',
      isStudent: true
    })).resolves.toMatchObject({ role: 'STUDENT', isStudent: true })
    expect(repositoryMocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Estudiante UVG', firstNames: 'Estudiante', lastNames: 'UVG', email: 'estudiante@uvg.edu.gt' }))
  })

  it('rechaza nombres ofensivos antes de crear la cuenta', async () => {
    await expect(studentAuthService.register({
      firstNames: 'Nombre',
      lastNames: 'cerote',
      email: 'estudiante@uvg.edu.gt',
      password: 'Clave-estudiante-123!',
      isStudent: true
    })).rejects.toMatchObject({ status: 422, code: 'OFFENSIVE_NAME' })
    expect(repositoryMocks.createUser).not.toHaveBeenCalled()
  })

  it('normaliza y modera los nombres del perfil antes de persistirlos', async () => {
    const user = await activeStudent()
    repositoryMocks.updateProfile.mockResolvedValue({ ...user, firstNames: 'Ana María', lastNames: 'López Pérez', name: 'Ana María López Pérez' })
    await expect(studentAuthService.updateOwnProfile(41, { firstNames: ' Ana   María ', lastNames: ' López Pérez ' }))
      .resolves.toMatchObject({ firstNames: 'Ana María', lastNames: 'López Pérez', name: 'Ana María López Pérez' })
    expect(repositoryMocks.updateProfile).toHaveBeenCalledWith(41, { name: 'Ana María López Pérez', firstNames: 'Ana María', lastNames: 'López Pérez' })

    await expect(studentAuthService.updateOwnProfile(41, { firstNames: 'Nombre', lastNames: 'cerote' }))
      .rejects.toMatchObject({ status: 422, code: 'OFFENSIVE_NAME' })
    expect(repositoryMocks.updateProfile).toHaveBeenCalledTimes(1)
  })

  it('rechaza una asignación de rol aunque el cliente la incluya', async () => {
    await expect(studentAuthService.register({
      firstNames: 'Estudiante',
      lastNames: 'UVG',
      email: 'estudiante@uvg.edu.gt',
      password: 'Clave-estudiante-123!',
      isStudent: true,
      role: 'ADMIN'
    })).rejects.toMatchObject({ status: 422, code: 'ROLE_ASSIGNMENT_FORBIDDEN' })
    expect(repositoryMocks.createUser).not.toHaveBeenCalled()
  })

  it('solo consulta la tabla estudiantil al iniciar sesión', async () => {
    repositoryMocks.findUserByEmail.mockResolvedValue(null)
    await expect(studentAuthService.login('administrador@uvg.edu.gt', 'Clave-estudiante-123!', new Headers()))
      .rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
    expect(repositoryMocks.findUserByEmail).toHaveBeenCalledWith('administrador@uvg.edu.gt')
  })

  it('informa la fecha de fin del bloqueo temporal', async () => {
    const blockedUntil = new Date(Date.now() + 60_000)
    repositoryMocks.findUserByEmail.mockResolvedValue({ ...(await activeStudent()), status: 'BLOQUEADO_TEMPORAL', blockedUntil })
    await expect(studentAuthService.login('estudiante@uvg.edu.gt', 'Clave-estudiante-123!', new Headers()))
      .rejects.toMatchObject({ code: 'ACCOUNT_TEMPORARILY_BLOCKED', details: { blockedUntil: blockedUntil.toISOString() } })
    expect(repositoryMocks.createSession).not.toHaveBeenCalled()
  })

  it('informa el canal de revisión del bloqueo permanente', async () => {
    repositoryMocks.findUserByEmail.mockResolvedValue({ ...(await activeStudent()), status: 'BLOQUEADO_PERMANENTE', reviewChannel: 'revision@uvg.edu.gt' })
    await expect(studentAuthService.login('estudiante@uvg.edu.gt', 'Clave-estudiante-123!', new Headers()))
      .rejects.toMatchObject({ code: 'ACCOUNT_PERMANENTLY_BLOCKED', details: { reviewChannel: 'revision@uvg.edu.gt' } })
  })

  it('permite la baja propia bloqueada tras volver a verificar la contraseña', async () => {
    repositoryMocks.findUserByEmail.mockResolvedValue({ ...(await activeStudent()), status: 'BLOQUEADO_PERMANENTE', reviewChannel: 'revision@uvg.edu.gt' })
    repositoryMocks.deleteAccountAndRevokeSessions.mockResolvedValue({ alreadyDeleted: false, user: { id: 41, status: 'ELIMINADO', deletedAt: new Date(), email: 'estudiante@uvg.edu.gt' } })
    await expect(studentAuthService.deleteOwnAccount({
      email: 'estudiante@uvg.edu.gt', password: 'Clave-estudiante-123!', confirm: true
    })).resolves.toBeUndefined()
    expect(repositoryMocks.deleteAccountAndRevokeSessions).toHaveBeenCalledWith(41, { actorId: null, reason: 'BAJA_SOLICITADA_POR_USUARIO' })
  })

  it('exige una fecha futura para el bloqueo temporal', async () => {
    await expect(studentAuthService.updateStatus(41, {
      status: 'BLOQUEADO_TEMPORAL', blockedUntil: '2020-01-01T00:00:00.000Z', reason: 'Política interna'
    }, 8)).rejects.toMatchObject({ status: 422, code: 'INVALID_BLOCK_END' })
    expect(repositoryMocks.updateStatusAndRevokeSessions).not.toHaveBeenCalled()
  })

  it('delega el cambio permanente con canal de revisión y revocación transaccional', async () => {
    const user = { ...(await activeStudent()), status: 'BLOQUEADO_PERMANENTE' as const, reviewChannel: 'revision@uvg.edu.gt' }
    repositoryMocks.updateStatusAndRevokeSessions.mockResolvedValue({ user, changed: true })
    await expect(studentAuthService.updateStatus(41, {
      status: 'BLOQUEADO_PERMANENTE', reviewChannel: ' revision@uvg.edu.gt ', reason: 'Incumplimiento documentado'
    }, 8)).resolves.toMatchObject({ status: 'BLOQUEADO_PERMANENTE' })
    expect(repositoryMocks.updateStatusAndRevokeSessions).toHaveBeenCalledWith(41, {
      status: 'BLOQUEADO_PERMANENTE', blockedUntil: null, reviewChannel: 'revision@uvg.edu.gt', actorId: 8, reason: 'Incumplimiento documentado'
    })
  })
})
