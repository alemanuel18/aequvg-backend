import { createApp } from './app'
import { prisma } from './shared/database/prisma'
import { logger } from './shared/logging/logger'

const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOST ?? '0.0.0.0'
const server = createApp().listen({ port, hostname })
logger.info('server_started', { hostname, port, environment: process.env.NODE_ENV ?? 'development' })

const shutdown = async (signal: string) => {
  logger.info('server_stopping', { signal })
  await server.stop()
  await prisma.$disconnect()
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
