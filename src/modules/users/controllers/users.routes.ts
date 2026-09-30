import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { createUserBody, passwordBody, roleListResponse, updateUserBody, userIdParams, userListResponse, userResponse, usersErrorResponse } from '../dtos/users.schemas'
import { usersService } from '../services/users.service'

export const usersRoutes = new Elysia({ prefix: '/api/v1/admin' })
  .get('/roles', async ({ request }) => {
    await requireAdmin(request, 'ROLES_READ')
    return usersService.roles()
  }, {
    response: { 200: roleListResponse, 401: usersErrorResponse, 403: usersErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista los roles administrativos asignables' }
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
    await requireAdmin(request, 'USERS_MANAGE')
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
