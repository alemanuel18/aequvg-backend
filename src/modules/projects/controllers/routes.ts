import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { adminProjectResponse, AdminCreateProjectDTO, projectErrorResponse, projectIdParams, projectListQuery, projectListResponse, projectMessageResponse, publicProjectResponse, ReviewProjectDTO, UpdateProjectDTO } from '../dtos/project.dto'
import { ProjectService } from '../services/project.service'

export const projectRoutes = new Elysia({ prefix: '/api/v1' })
  
.get('/projects', ({ query }) => ProjectService.getFilteredProjects(query), {
    query: projectListQuery,
    response: { 200: projectListResponse, 422: projectErrorResponse },
    detail: {
      tags: ['Proyectos'],
      summary: 'Lista proyectos aprobados con búsqueda, filtros, orden y paginación',
      description: 'year filtra el año UTC de creación y type corresponde a la categoría TESIS o PROYECTO. El catálogo público solo muestra proyectos APROBADO.',
    },
  })
  .get('/projects/:id', ({ params }) => ProjectService.getPublicProjectById(params.id), {
    params: projectIdParams,
    response: { 200: publicProjectResponse, 404: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Proyectos'], summary: 'Consulta un proyecto aprobado', description: 'Devuelve únicamente proyectos con estado APROBADO.' },
  })

  .get('/admin/projects', ({ headers }) => { requireAdmin(headers.authorization); return ProjectService.getAllProjects() }, {
    response: { 200: t.Array(adminProjectResponse), 401: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista todos los proyectos', description: 'Requiere Authorization: Bearer <ADMIN_API_KEY>.' },
  })

  .get('/admin/projects/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return ProjectService.getProjectById(params.id) }, {
    params: projectIdParams,
    response: { 200: adminProjectResponse, 401: projectErrorResponse, 404: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta un proyecto por identificador' },
  })

  .post('/admin/projects', ({ headers, body, set }) => {
    requireAdmin(headers.authorization)
    set.status = 201
    return ProjectService.createProject(body, body.authorId)
  }, {
    body: AdminCreateProjectDTO,
    response: { 201: adminProjectResponse, 401: projectErrorResponse, 409: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea un proyecto', description: 'El proyecto inicia en EN_REVISION; authorId debe referir a un usuario administrativo existente.' },
  })
  .put('/admin/projects/:id', ({ headers, params, body }) => { requireAdmin(headers.authorization); return ProjectService.updateProject(params.id, body) }, {
    params: projectIdParams,
    body: UpdateProjectDTO,
    response: { 200: adminProjectResponse, 401: projectErrorResponse, 404: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza parcialmente un proyecto' },
  })

  .patch('/admin/projects/:id/review', ({ headers, params, body }) => { requireAdmin(headers.authorization); return ProjectService.reviewProject(params.id, body.status, body.reviewerId, body.rejectionReason) }, {
    params: projectIdParams,
    body: ReviewProjectDTO,
    response: { 200: adminProjectResponse, 401: projectErrorResponse, 404: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Revisa un proyecto', description: 'Registra revisor y fecha; el motivo se conserva únicamente para NO_APROBADO.' },
  })
  .delete('/admin/projects/:id', async ({ headers, params }) => {
    requireAdmin(headers.authorization)
    await ProjectService.deleteProject(params.id)
    return { message: 'Proyecto eliminado correctamente' }
  }, {
    params: projectIdParams,
    response: { 200: projectMessageResponse, 401: projectErrorResponse, 404: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina un proyecto' },
  })
