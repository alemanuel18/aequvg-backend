import { authService } from '../modules/users/services/auth.service'

export const requireAdmin = (request: Request, permission = 'ADMIN_ACCESS') => authService.authenticate(request, permission)
