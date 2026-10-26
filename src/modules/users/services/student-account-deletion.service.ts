import { AppError } from '../../../shared/errors/app-error'
import { clearAuthFailuresForEmail } from '../../../middleware/auth-rate-limit'
import { studentAuthRepository } from '../repositories/student-auth.repository'

export const studentAccountDeletionService = {
  async delete(userId: number, input: { actorId: number | null; reason: string }) {
    const reason = input.reason.trim()
    if (reason.length < 5) throw new AppError(422, 'INVALID_STATUS_REASON', 'El motivo debe tener al menos 5 caracteres.')
    const result = await studentAuthRepository.deleteAccountAndRevokeSessions(userId, {
      actorId: input.actorId,
      reason
    })
    if (!result) throw new AppError(404, 'STUDENT_NOT_FOUND', 'La cuenta estudiantil no existe.')
    if (result.alreadyDeleted) throw new AppError(409, 'STUDENT_ALREADY_DELETED', 'La cuenta estudiantil ya fue dada de baja.')
    clearAuthFailuresForEmail(result.originalEmail)
    return { id: result.user.id, status: 'ELIMINADO' as const, deletedAt: result.user.deletedAt ?? new Date() }
  }
}
