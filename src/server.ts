import { createApp } from './app'

const port = Number(process.env.PORT ?? 3000)
createApp().listen({ port, hostname: process.env.HOST ?? '0.0.0.0' })
console.info(`AEQUVG API disponible en http://localhost:${port}`)
