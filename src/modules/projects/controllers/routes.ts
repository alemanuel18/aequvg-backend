import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { adminProjectResponse, AdminCreateProjectDTO, projectAdminListQuery, projectAdminListResponse, projectErrorResponse, projectFileUploadResponse, projectIdParams, projectListQuery, projectListResponse, projectMessageResponse, publicProjectResponse, ReviewProjectDTO, UpdateProjectDTO } from '../dtos/project.dto'
import { ProjectService } from '../services/project.service'
import { fileService } from '../../resources/services/file.service'
import { AppError } from '../../../shared/errors/app-error'

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
  .get('/projects/:id/document', async ({ params, set }) => {
    const file = await fileService.downloadPublicProjectDocument(params.id)
    set.headers['content-type'] = file.mimeType
    set.headers['content-disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    set.headers['x-content-type-options'] = 'nosniff'
    return file.bytes
  }, {
    params: projectIdParams,
    detail: { tags: ['Proyectos'], summary: 'Consulta el PDF de un proyecto aprobado', description: 'Solo entrega el PDF asociado a proyectos con estado APROBADO.' },
  })
  .get('/projects/:id', ({ params }) => ProjectService.getPublicProjectById(params.id), {
    params: projectIdParams,
    response: { 200: publicProjectResponse, 404: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Proyectos'], summary: 'Consulta un proyecto aprobado', description: 'Devuelve únicamente proyectos con estado APROBADO.' },
  })

  .get('/admin/projects', async ({ request, query }) => { await requireAdmin(request, 'PROJECTS_MANAGE'); return ProjectService.getAdminProjects(query) }, {
    query: projectAdminListQuery,
    response: { 200: projectAdminListResponse, 401: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Busca proyectos administrativos', description: 'Incluye todos los estados y permite filtrar por texto, tipo y estado. Requiere PROJECTS_MANAGE.' },
  })
  .post('/admin/projects/files', async ({ request, set }) => {
    const authenticated = await requireAdmin(request, 'PROJECTS_MANAGE')
    const input = (await request.formData()).get('file')
    if (!input || typeof input !== 'object' || typeof (input as File).arrayBuffer !== 'function' || (input as File).type !== 'application/pdf') throw new AppError(422, 'PDF_REQUIRED', 'Debes seleccionar un archivo PDF.')
    set.status = 201
    return fileService.upload(authenticated.user.id, input as File)
  }, {
    parse: 'none',
    response: { 201: projectFileUploadResponse, 401: projectErrorResponse, 403: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Carga el PDF de un proyecto', description: 'Solo acepta PDF y requiere PROJECTS_MANAGE.' }
  })
  .get('/admin/projects/:id/document', async ({ request, params, set }) => {
    await requireAdmin(request, 'PROJECTS_MANAGE')
    const file = await fileService.downloadProjectDocument(params.id)
    set.headers['content-type'] = file.mimeType
    set.headers['content-disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    set.headers['x-content-type-options'] = 'nosniff'
    return file.bytes
  }, { params: projectIdParams, detail: { tags: ['Administración'], summary: 'Consulta el PDF de un proyecto' } })

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
    response: { 200: adminProjectResponse, 401: projectErrorResponse, 404: projectErrorResponse, 409: projectErrorResponse, 422: projectErrorResponse, 503: projectErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza parcialmente un proyecto', description: 'Si se modifica un proyecto aprobado, vuelve a EN_REVISION hasta que se apruebe de nuevo.' },
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
