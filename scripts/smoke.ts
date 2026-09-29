import { createApp } from '../src/app'
import { prisma } from '../src/shared/database/prisma'

const app = createApp()
const jsonRequest = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify(body) })

async function main() {
  const boardResponse = await app.handle(new Request('http://localhost/api/v1/board-members'))
  const methodsResponse = await app.handle(new Request('http://localhost/api/v1/contact-methods'))
  const contactResponse = await app.handle(jsonRequest('/api/v1/contact-requests', { name: 'Integración automatizada', email: 'integration@example.com', phone: '+502 5555-5555', type: 'CONSULTA', subject: 'Prueba de integración', message: 'Solicitud temporal para validar el flujo.', consent: true, privacyVersion: '2026-09' }))
  const board = await boardResponse.json() as unknown[]
  const methods = await methodsResponse.json() as unknown[]
  if (boardResponse.status !== 200 || methodsResponse.status !== 200 || contactResponse.status !== 201 || board.length === 0 || methods.length === 0) throw new Error('Falló la integración pública')
  console.info(JSON.stringify({ boardMembers: board.length, contactMethods: methods.length, contactRequestStatus: contactResponse.status }))
}

main().finally(() => prisma.$disconnect())
