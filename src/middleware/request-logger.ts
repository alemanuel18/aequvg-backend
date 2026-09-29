import { Elysia } from 'elysia'
import { logger } from '../shared/logging/logger'

interface RequestLogContext {
  requestId: string
  startedAt: number
}

const requests = new WeakMap<Request, RequestLogContext>()
const requestIdPattern = /^[a-zA-Z0-9._-]{8,100}$/

export const requestLogger = new Elysia({ name: 'request-logger' })
  .onRequest(({ request, set }) => {
    const incomingId = request.headers.get('x-request-id')
    const requestId = incomingId && requestIdPattern.test(incomingId) ? incomingId : crypto.randomUUID()
    requests.set(request, { requestId, startedAt: performance.now() })
    set.headers['x-request-id'] = requestId
  })
  .onAfterResponse(({ request, set }) => {
    const context = requests.get(request)
    const path = new URL(request.url).pathname
    if (!context || (path === '/health' && process.env.LOG_HEALTHCHECKS !== 'true')) return

    logger.info('http_request_completed', {
      requestId: context.requestId,
      method: request.method,
      path,
      status: typeof set.status === 'number' ? set.status : Number(set.status ?? 200),
      durationMs: Math.round((performance.now() - context.startedAt) * 100) / 100,
    })
    requests.delete(request)
  })

export const requestIdFor = (request: Request) => requests.get(request)?.requestId
