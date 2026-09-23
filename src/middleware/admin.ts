import { AppError } from '../shared/errors/app-error'

export const requireAdmin = (authorization: string | null | undefined) => {
  const configuredKey = process.env.ADMIN_API_KEY
  if (!configuredKey) throw new AppError(503, 'ADMIN_AUTH_NOT_CONFIGURED', 'La autenticación administrativa no está configurada.')
  if (authorization !== `Bearer ${configuredKey}`) throw new AppError(401, 'UNAUTHORIZED', 'Se requiere autorización administrativa.')
}
