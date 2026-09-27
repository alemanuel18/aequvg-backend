import { describe, expect, it } from 'vitest'
import { normalizeProjectListQuery } from '../../src/modules/projects/services/project.service'

describe('normalización del listado público de proyectos', () => {
  it('aplica paginación y orden predeterminados, y limpia la búsqueda', () => {
    expect(normalizeProjectListQuery({ search: '  <b>Química</b>  ' })).toEqual({
      search: 'Química',
      year: undefined,
      type: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      pageSize: 12,
    })
  })
})
