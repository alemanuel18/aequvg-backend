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

  .get('/admin/projects', async ({ request }) => { await requireAdmin(request, 'PROJECTS_MANAGE'); return ProjectService.getAllProjects() }, {
    response: { 200: t.Array(adminProjectResponse), 401: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista todos los proyectos', description: 'Requiere una sesión con PROJECTS_MANAGE.' },
  })

  .get('/admin/projects/:id', async ({ request, params }) => { await requireAdmin(request, 'PROJECTS_MANAGE'); return ProjectService.getProjectById(params.id) }, {
    params: projectIdParams,
    response: { 200: adminProjectResponse, 401: projectErrorResponse, 404: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta un proyecto por identificador' },
  })

  .post('/admin/projects', async ({ request, body, set }) => {
    const authenticated = await requireAdmin(request, 'PROJECTS_MANAGE')
    set.status = 201
    return ProjectService.createProject(body, authenticated.user.id)
  }, {
    body: AdminCreateProjectDTO,
    response: { 201: adminProjectResponse, 401: projectErrorResponse, 409: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea un proyecto', description: 'El proyecto inicia en EN_REVISION y se atribuye al usuario de la sesión.' },
  })
  .put('/admin/projects/:id', async ({ request, params, body }) => { await requireAdmin(request, 'PROJECTS_MANAGE'); return ProjectService.updateProject(params.id, body) }, {
    params: projectIdParams,
    body: UpdateProjectDTO,
    response: { 200: adminProjectResponse, 401: projectErrorResponse, 404: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza parcialmente un proyecto' },
  })

  .patch('/admin/projects/:id/review', async ({ request, params, body }) => {
    const authenticated = await requireAdmin(request, 'PROJECTS_MANAGE')
    return ProjectService.reviewProject(params.id, body.status, authenticated.user.id, body.rejectionReason)
  }, {
    params: projectIdParams,
    body: ReviewProjectDTO,
    response: { 200: adminProjectResponse, 401: projectErrorResponse, 404: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Revisa un proyecto', description: 'Registra revisor y fecha; el motivo se conserva únicamente para NO_APROBADO.' },
  })
  .delete('/admin/projects/:id', async ({ request, params }) => {
    await requireAdmin(request, 'PROJECTS_MANAGE')
    await ProjectService.deleteProject(params.id)
    return { message: 'Proyecto eliminado correctamente' }
  }, {
    params: projectIdParams,
    response: { 200: projectMessageResponse, 401: projectErrorResponse, 404: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina un proyecto' },
  })
