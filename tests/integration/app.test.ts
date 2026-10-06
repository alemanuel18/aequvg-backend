import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'

describe('contrato HTTP base', () => {
  const app = createApp()

  it('expone el healthcheck', async () => {
    const response = await app.handle(new Request('http://localhost/health'))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('reemplaza identificadores de solicitud no seguros', async () => {
    const response = await app.handle(new Request('http://localhost/health', { headers: { 'x-request-id': 'correo@example.com' } }))
    expect(response.headers.get('x-request-id')).not.toBe('correo@example.com')
    expect(response.headers.get('x-request-id')).toMatch(/^[a-zA-Z0-9-]{8,100}$/)
  })

  it('deniega el CRUD administrativo sin credencial', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/admin/board-members'))
    expect([401, 503]).toContain(response.status)
    const body = await response.json() as { error: { code: string } }
    expect(body.error.code).toMatch(/UNAUTHORIZED|ADMIN_AUTH_NOT_CONFIGURED/)
  })

  it('deniega la creación administrativa de noticias sin credencial', async () => {
    const body = { createdById: 1, categoryId: 1, title: 'Noticia de prueba', summary: 'Resumen válido para comprobar la autorización.', content: 'Contenido válido con suficiente longitud para pasar el contrato de entrada.' }
    const response = await app.handle(new Request('http://localhost/api/v1/admin/news', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
    expect([401, 503]).toContain(response.status)
  })

  it('publica la interfaz OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi'))
    expect(response.status).toBe(200)
  })

  it('documenta el contrato de noticias en OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi/json'))
    expect(response.status).toBe(200)
    const document = await response.json() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> }
    expect(document.paths['/api/v1/news']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/admin/news']?.post?.responses['201']).toBeTruthy()
    expect(document.paths['/api/v1/news/{id}']?.get?.responses['404']).toBeTruthy()
  })

  it('documenta autenticación, usuarios y protecciones de cookie en OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi/json'))
    const document = await response.json() as {
      components: { securitySchemes: Record<string, unknown> }
      paths: Record<string, Record<string, unknown>>
    }
    expect(document.components.securitySchemes.cookieAuth).toBeTruthy()
    expect(document.components.securitySchemes.csrfToken).toBeTruthy()
    expect(document.paths['/api/v1/auth/login']?.post).toBeTruthy()
    expect(document.paths['/api/v1/auth/microsoft']?.get).toBeTruthy()
    expect(document.paths['/api/v1/admin/users']?.post).toBeTruthy()
    expect(document.paths['/api/v1/admin/roles']?.get).toBeTruthy()
  })

  it('documenta el contrato de recursos en OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi/json'))
    expect(response.status).toBe(200)
    const document = await response.json() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> }
    expect(document.paths['/api/v1/resources/categories']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/resources']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/resources/{id}']?.get?.responses['404']).toBeTruthy()
    expect(document.paths['/api/v1/admin/resources']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/admin/resources']?.post?.responses['201']).toBeTruthy()
    expect(document.paths['/api/v1/admin/resources/{id}']?.put?.responses['422']).toBeTruthy()
    expect(document.paths['/api/v1/admin/resources/{id}/archive']?.patch?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/admin/resources/{id}']?.delete?.responses['404']).toBeTruthy()
  })

  it('documenta el contrato de eventos e inscripciones en OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi/json'))
    expect(response.status).toBe(200)
    const document = await response.json() as {
      tags: Array<{ name: string }>
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    expect(document.tags.some((tag) => tag.name === 'Eventos')).toBe(true)
    expect(document.paths['/api/v1/events']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/events/{id}']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/events/{id}']?.get?.responses['404']).toBeTruthy()
    expect(document.paths['/api/v1/events/{id}/registrations']?.post?.responses['201']).toBeTruthy()
    expect(document.paths['/api/v1/events/{id}/registrations']?.post?.responses['409']).toBeTruthy()
    expect(document.paths['/api/v1/admin/events']?.get?.responses['200']).toBeTruthy()
    expect(document.paths['/api/v1/admin/events/{id}/registrations']?.get?.responses['200']).toBeTruthy()
  })

  it('devuelve un error público estable cuando el cuerpo no es válido', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/contact-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.' } })
  })

  it('valida los parámetros del catálogo de proyectos', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/projects?page=0'))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.' } })
  })

  it('valida el tipo del catálogo de proyectos', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/projects?type=EN_REVISION'))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.' } })
  })

  it('rechaza filtros y paginación fuera del contrato', async () => {
    for (const query of ['year=1969', 'sortBy=status', 'sortOrder=up', 'pageSize=101']) {
      const response = await app.handle(new Request(`http://localhost/api/v1/projects?${query}`))
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.' } })
    }
  })

  it('documenta parámetros y respuestas del catálogo de proyectos en OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi/json'))
    const document = await response.json() as { paths: Record<string, { get?: { parameters?: Array<{ name: string }>; responses: Record<string, unknown> } }> }
    const operation = document.paths['/api/v1/projects']?.get
    expect(operation?.parameters?.map(parameter => parameter.name)).toEqual(expect.arrayContaining(['search', 'year', 'type', 'sortBy', 'sortOrder', 'page', 'pageSize']))
    expect(operation?.responses['200']).toBeTruthy()
    expect(operation?.responses['422']).toBeTruthy()
  })

  it('documenta el contenido institucional y destacados en OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi/json'))
    expect(response.status).toBe(200)
    const document = await response.json() as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> }
    expect(document.paths['/api/v1/institutional-content']?.get).toBeTruthy()
    expect(document.paths['/api/v1/institutional-content/featured']?.get).toBeTruthy()
    expect(document.paths['/api/v1/admin/institutional-content']?.get).toBeTruthy()
    expect(document.paths['/api/v1/admin/institutional-content/featured']?.put).toBeTruthy()
    expect(document.paths['/api/v1/admin/institutional-content']?.post).toBeTruthy()
    expect(document.paths['/api/v1/admin/institutional-content/{id}']?.put).toBeTruthy()
  })

  it('deniega la modificación administrativa de contenido institucional sin credencial', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/admin/institutional-content'))
    expect([401, 503]).toContain(response.status)
  })
})
