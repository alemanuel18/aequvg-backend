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

  it('deniega el CRUD administrativo sin credencial', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/admin/board-members'))
    expect([401, 503]).toContain(response.status)
    const body = await response.json() as { error: { code: string } }
    expect(body.error.code).toMatch(/UNAUTHORIZED|ADMIN_AUTH_NOT_CONFIGURED/)
  })

  it('publica la interfaz OpenAPI', async () => {
    const response = await app.handle(new Request('http://localhost/openapi'))
    expect(response.status).toBe(200)
  })

  it('devuelve un error público estable cuando el cuerpo no es válido', async () => {
    const response = await app.handle(new Request('http://localhost/api/v1/contact-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.' } })
  })
})
