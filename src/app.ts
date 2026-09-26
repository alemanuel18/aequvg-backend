import { cors } from '@elysiajs/cors'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { boardRoutes } from './modules/board/controllers/routes'
import { contactRoutes } from './modules/contact/controllers/routes'
import { institutionalRoutes } from './modules/institutional/controllers/routes'
import { newsRoutes } from './modules/news/controllers/routes'
import { errorBody } from './shared/errors/app-error'
import { requestIdFor, requestLogger } from './middleware/request-logger'

export const createApp = () => new Elysia()
  .use(requestLogger)
  .use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3001' }))
  .use(openapi({ path: '/openapi', documentation: { info: { title: 'AEQUVG API', version: '1.0.0', description: 'API pública y administrativa de la Asociación de Estudiantes de Química UVG.' }, tags: [{ name: 'Contenido institucional' }, { name: 'Junta directiva' }, { name: 'Contacto' }, { name: 'Noticias' }, { name: 'Administración' }] } }))
  .onError(({ code, error, request, set }) => {
    if (code === 'VALIDATION') { set.status = 422; return { error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.' } } }
    if (code === 'NOT_FOUND') { set.status = 404; return { error: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' } } }
    const response = errorBody(error, requestIdFor(request)); set.status = response.status; return response.body
  })
  .get('/health', () => ({ status: 'ok' }))
  .use(institutionalRoutes)
  .use(newsRoutes)
  .use(boardRoutes)
  .use(contactRoutes)
