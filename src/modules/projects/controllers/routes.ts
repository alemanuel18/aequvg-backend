import { Elysia } from 'elysia'
import { projectListQuery } from '../dtos/project.dto'
import { ProjectService } from '../services/project.service'

export const projectRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/projects', ({ query }) => ProjectService.getFilteredProjects(query), {
    query: projectListQuery,
    detail: {
      tags: ['Proyectos'],
      summary: 'Lista proyectos aprobados con búsqueda, filtros, orden y paginación',
      description: 'year filtra el año UTC de creación y type corresponde a la categoría TESIS o PROYECTO. El catálogo público solo muestra proyectos APROBADO.',
    },
  })
