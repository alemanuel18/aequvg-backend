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
    detail: { tags: ['Administración'], summary: 'Lista cuentas normales de estudiantes con filtros y paginación' }
  })
  .get('/student-users/:id', async ({ request, params }) => {
    await requireAdmin(request, 'USERS_MANAGE')
    return studentAuthService.getManagedAccount(params.id)
  }, {
    params: userIdParams,
    response: { 200: managedStudentDetailResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 404: studentAuthErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta una cuenta normal y su historial de estados' }
  })
  .patch('/student-users/:id/status', async ({ request, params, body }) => {
    const actor = await requireAdmin(request, 'USERS_MANAGE')
    return studentAuthService.updateStatus(params.id, body, actor.user.id)
  }, {
    params: userIdParams,
    body: studentStatusBody,
    response: { 200: studentUserResponse, 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 404: studentAuthErrorResponse, 422: studentAuthErrorResponse },
    detail: { tags: ['Administración'], summary: 'Cambia el estado, registra actor y motivo y revoca sesiones al bloquear' }
  })
  .delete('/student-users/:id', async ({ request, params, body }) => {
    const actor = await requireAdmin(request, 'USERS_MANAGE')
    return studentAccountDeletionService.delete(params.id, { actorId: actor.user.id, reason: body.reason })
  }, {
    params: userIdParams,
    body: managedStudentDeleteBody,
    response: { 200: t.Object({ id: t.Integer(), status: t.Literal('ELIMINADO'), deletedAt: t.Date() }), 401: studentAuthErrorResponse, 403: studentAuthErrorResponse, 404: studentAuthErrorResponse, 409: studentAuthErrorResponse, 422: studentAuthErrorResponse },
    detail: { tags: ['Administración'], summary: 'Da de baja una cuenta normal mediante el servicio único de BAJA' }
  })
