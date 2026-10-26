import { AppError } from '../../../shared/errors/app-error'
import { clearAuthFailuresForEmail } from '../../../middleware/auth-rate-limit'
import { studentAuthRepository } from '../repositories/student-auth.repository'

export const studentAccountDeletionService = {
  async delete(userId: number, input: { actorId: number | null; reason: string; revalidation?: { email: string; password: string } }) {
    const reason = input.reason.trim()
    if (reason.length < 5) throw new AppError(422, 'INVALID_STATUS_REASON', 'El motivo debe tener al menos 5 caracteres.')
    const result = await studentAuthRepository.deleteAccountAndRevokeSessions(userId, {
      actorId: input.actorId,
      reason,
      revalidation: input.revalidation
    })
    if (!result) throw new AppError(404, 'STUDENT_NOT_FOUND', 'La cuenta estudiantil no existe.')
    if (result.alreadyDeleted) throw new AppError(409, 'STUDENT_ALREADY_DELETED', 'La cuenta estudiantil ya fue dada de baja.')
    if ('revalidationFailed' in result) throw new AppError(401, 'INVALID_CREDENTIALS', 'El correo o la contraseña no son válidos.')
    if ('notAccessible' in result) {
      if (result.notAccessible === 'BLOQUEADO_TEMPORAL') throw new AppError(403, 'ACCOUNT_TEMPORARILY_BLOCKED', 'La cuenta está bloqueada temporalmente.')
      throw new AppError(403, 'ACCOUNT_PERMANENTLY_BLOCKED', 'La cuenta está bloqueada permanentemente.')
    }
    clearAuthFailuresForEmail(result.originalEmail)
    return { id: result.user.id, status: 'ELIMINADO' as const, deletedAt: result.user.deletedAt ?? new Date() }
  }
}
