import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { AppError } from '../../../shared/errors/app-error'
import { createUserBody, passwordBody, roleListResponse, updateUserBody, userIdParams, userListResponse, userResponse, usersErrorResponse } from '../dtos/users.schemas'
import { usersService } from '../services/users.service'
import { registrationService } from '../services/registration.service'
import { managedStudentDeleteBody, managedStudentDetailResponse, managedStudentListQuery, managedStudentListResponse, studentAuthErrorResponse, studentStatusBody, studentUserResponse } from '../dtos/student-auth.schemas'
import { studentAuthService } from '../services/student-auth.service'
import { studentAccountDeletionService } from '../services/student-account-deletion.service'

export const usersRoutes = new Elysia({ prefix: '/api/v1/admin' })
  .get('/roles', async ({ request }) => {
    await requireAdmin(request, 'ROLES_READ')
    return usersService.roles()
  }, {
    response: { 200: roleListResponse, 401: usersErrorResponse, 403: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista los roles administrativos asignables' }
  })
  .get('/registration-requests', async ({ request }) => {
    await requireAdmin(request, 'USERS_MANAGE')
    return registrationService.list()
  }, {
    response: { 200: t.Array(t.Object({ id: t.Integer(), name: t.String(), firstNames: t.String(), lastNames: t.String(), email: t.String(), status: t.Literal('PENDIENTE'), createdAt: t.Date() })), 401: usersErrorResponse, 403: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista solicitudes de cuentas administrativas pendientes' }
  })
  .post('/registration-requests/:id/review', async ({ request, params, body }) => {
    const actor = await requireAdmin(request, 'USERS_MANAGE')
    return registrationService.review(params.id, actor.user.id, body)
  }, {
    params: userIdParams,
    body: t.Union([
      t.Object({ status: t.Literal('APROBADA'), roleId: t.Integer({ minimum: 1 }) }, { additionalProperties: false }),
      t.Object({ status: t.Literal('RECHAZADA') }, { additionalProperties: false })
    ]),
    response: { 200: t.Object({ id: t.Integer(), status: t.Union([t.Literal('APROBADA'), t.Literal('RECHAZADA')]) }), 401: usersErrorResponse, 403: usersErrorResponse, 404: usersErrorResponse, 409: usersErrorResponse, 422: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Aprueba o rechaza una solicitud de cuenta administrativa' }
  })
  .get('/users', async ({ request }) => {
    await requireAdmin(request, 'USERS_MANAGE')
    return usersService.list()
  }, {
    response: { 200: userListResponse, 401: usersErrorResponse, 403: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista los usuarios administrativos' }
  })
  .post('/users', async ({ request, body, set }) => {
    await requireAdmin(request, 'USERS_MANAGE')
    set.status = 201
    return usersService.create(body)
  }, {
    body: createUserBody,
    response: { 201: userResponse, 401: usersErrorResponse, 403: usersErrorResponse, 409: usersErrorResponse, 422: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea un usuario administrativo y le asigna un rol' }
  })
  .patch('/users/:id', async ({ request, params, body }) => {
    const actor = await requireAdmin(request, 'USERS_MANAGE')
    if (actor.user.id === params.id && (body.roleId !== undefined || body.status !== undefined)) {
      throw new AppError(422, 'SELF_AUTHORIZATION_CHANGE', 'No puedes cambiar tu propio rol o estado.')
    }
    return usersService.update(params.id, body)
  }, {
    params: userIdParams, body: updateUserBody,
    response: { 200: userResponse, 401: usersErrorResponse, 403: usersErrorResponse, 404: usersErrorResponse, 422: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza el perfil, rol o estado de un usuario' }
  })
  .put('/users/:id/password', async ({ request, params, body }) => {
    await requireAdmin(request, 'USERS_MANAGE')
    return usersService.setPassword(params.id, body.password)
  }, {
    params: userIdParams, body: passwordBody,
    response: { 200: t.Object({ message: t.String() }), 401: usersErrorResponse, 403: usersErrorResponse, 404: usersErrorResponse, 422: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Establece una contraseña y revoca las sesiones anteriores' }
  })
  .get('/student-users', async ({ request, query }) => {
    await requireAdmin(request, 'USERS_MANAGE')
    return studentAuthService.listManagedAccounts(query)
  }, {
    query: managedStudentListQuery,
    response: { 200: managedStudentListResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse },
    detail: {
      tags: ['Administración'], summary: 'Lista cuentas normales con filtros y paginación',
      security: [{ cookieAuth: [] }],
      description: 'Exclusivo para administradores con permiso USERS_MANAGE. Busca por nombre/correo con q, filtra por type (ESTUDIANTE o INTERESADO) y status, y pagina con page/pageSize (máximo 100). Las cuentas administrativas no forman parte de este recurso. Visitantes, estudiantes y administradores sin permiso reciben 401/403.'
    }
  })
  .get('/student-users/:id', async ({ request, params }) => {
    await requireAdmin(request, 'USERS_MANAGE')
    return studentAuthService.getManagedAccount(params.id)
  }, {
    params: userIdParams,
    response: { 200: managedStudentDetailResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 404: studentAuthErrorResponse },
    detail: {
      tags: ['Administración'], summary: 'Consulta una cuenta normal y su historial de estados',
      security: [{ cookieAuth: [] }],
      description: 'Exclusivo para administradores con permiso USERS_MANAGE. Incluye historial con actor, fecha, motivo, transición y datos del bloqueo. No permite consultar cuentas administrativas.'
    }
  })
  .patch('/student-users/:id/status', async ({ request, params, body }) => {
    const actor = await requireAdmin(request, 'USERS_MANAGE')
    const allowedFields = body.status === 'ACTIVO'
      ? new Set(['status', 'reason'])
      : body.status === 'BLOQUEADO_TEMPORAL'
        ? new Set(['status', 'blockedUntil', 'reason'])
        : new Set(['status', 'reviewChannel', 'reason'])
    const unknownFields = Object.keys(body as Record<string, unknown>).filter(field => !allowedFields.has(field))
    if (unknownFields.length) throw new AppError(422, 'VALIDATION_ERROR', 'La solicitud contiene campos que no se pueden modificar.', { fields: unknownFields.join(',') })
    return studentAuthService.updateStatus(params.id, body, actor.user.id)
  }, {
    params: userIdParams,
    body: studentStatusBody,
    response: { 200: studentUserResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 404: studentAuthErrorResponse, 422: studentAuthErrorResponse },
    detail: {
      tags: ['Administración'], summary: 'Bloquea, desbloquea y registra la auditoría de una cuenta normal',
      security: [{ cookieAuth: [], csrfToken: [] }],
      description: 'Requiere sesión administrativa con USERS_MANAGE y X-CSRF-Token. reason es obligatorio (5–1000 caracteres). BLOQUEADO_TEMPORAL requiere blockedUntil futuro; al vencimiento, el siguiente inicio de sesión reactiva la cuenta y registra la transición automática. BLOQUEADO_PERMANENTE requiere reviewChannel y no vence automáticamente; solo ADMIN puede desbloquearlo. ACTIVO es el desbloqueo manual, por ejemplo para corregir un falso positivo. Los bloqueos revocan sesiones activas inmediatamente y la reactivación requiere iniciar sesión de nuevo. Se registra actor, fecha, motivo y transición; repetir el mismo estado efectivo no duplica el historial. MOD también puede aplicar bloqueos progresivos cuando existe una política aprobada y configurada; con MODERATION_POLICY_JSON vacío no se cuentan reincidencias ni se aplican sanciones automáticas.'
    }
  })
  .delete('/student-users/:id', async ({ request, params, body }) => {
    const actor = await requireAdmin(request, 'USERS_MANAGE')
    return studentAccountDeletionService.delete(params.id, { actorId: actor.user.id, reason: body.reason })
  }, {
    params: userIdParams,
    body: managedStudentDeleteBody,
    response: { 200: t.Object({ id: t.Integer(), status: t.Literal('ELIMINADO'), deletedAt: t.Date() }), 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 404: studentAuthErrorResponse, 409: studentAuthErrorResponse, 422: studentAuthErrorResponse },
    detail: {
      tags: ['Administración'], summary: 'Elimina administrativamente una cuenta normal mediante BAJA',
      security: [{ cookieAuth: [], csrfToken: [] }],
      description: 'Requiere sesión administrativa con USERS_MANAGE y X-CSRF-Token; reason es obligatorio (5–1000 caracteres). Es una baja lógica irreversible para la cuenta: usa el servicio común BAJA, anonimiza identidad y datos personales, revoca sesiones y conserva comentarios e inscripciones anonimizados. No equivale a desbloquear: el desbloqueo establece ACTIVO y permite volver a acceder; eliminar establece ELIMINADO, no permite reactivación y las solicitudes repetidas responden 409. Las cuentas administrativas están excluidas.'
    }
  })
