import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../../src/app'
import { prisma } from '../../src/shared/database/prisma'
import { createAdminSessionHeaders } from '../helpers/admin-session'

const runDatabaseTests = process.env.RESOURCE_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `file-api-test-${Date.now()}`
let roleId = 0
let userId = 0
let fileId = 0
let storageRoot = ''
let headers: Record<string, string>
let multipartHeaders: Record<string, string>

const request = (pathName: string, options: RequestInit = {}) => new Request(`http://localhost${pathName}`, options)

describeDatabase('Carga y eliminación HTTP de archivos con PostgreSQL', () => {
  beforeAll(async () => {
    storageRoot = await mkdtemp(path.join(tmpdir(), 'aequvg-files-'))
    process.env.STORAGE_ROOT = storageRoot
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de archivos.' } })
    const user = await prisma.administrativeUser.create({ data: { roleId: role.id, name: 'Administrador de archivos', email: `${runId}@uvg.edu.gt` } })
    roleId = role.id
    userId = user.id
    headers = await createAdminSessionHeaders(prisma, user.id, role.id, ['RESOURCES_MANAGE'])
    multipartHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'content-type'))
  })

  afterAll(async () => {
    await prisma.file.deleteMany({ where: { uploadedById: userId } })
    await prisma.administrativeUser.deleteMany({ where: { id: userId } })
    await prisma.rolePermission.deleteMany({ where: { roleId } })
    await prisma.role.deleteMany({ where: { id: roleId } })
    await rm(storageRoot, { recursive: true, force: true })
    delete process.env.STORAGE_ROOT
    await prisma.$disconnect()
  })

  it('carga un multipart autorizado y persiste el binario y sus metadatos', async () => {
    const form = new FormData()
    form.append('file', new File(['contenido PDF de prueba'], 'guia.pdf', { type: 'application/pdf' }))
    const response = await createApp().handle(request('/api/v1/admin/files', { method: 'POST', headers: multipartHeaders, body: form }))
    expect(response.status).toBe(201)
    const body = await response.json() as { id: number; storageKey?: string; originalName: string; mimeType: string; sizeBytes: number }
    fileId = body.id
    expect(body).toMatchObject({ originalName: 'guia.pdf', mimeType: 'application/pdf', sizeBytes: 23 })
    const stored = await prisma.file.findUnique({ where: { id: fileId } })
    expect(stored?.uploadedById).toBe(userId)
    await access(path.join(storageRoot, stored!.storageKey))
    await expect(readFile(path.join(storageRoot, stored!.storageKey), 'utf8')).resolves.toBe('contenido PDF de prueba')
  })

  it('rechaza un MIME no permitido sin crear archivo', async () => {
    const before = await prisma.file.count({ where: { uploadedById: userId } })
    const form = new FormData()
    form.append('file', new File(['script'], 'script.js', { type: 'application/javascript' }))
    const response = await createApp().handle(request('/api/v1/admin/files', { method: 'POST', headers: multipartHeaders, body: form }))
    expect(response.status).toBe(422)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(await prisma.file.count({ where: { uploadedById: userId } })).toBe(before)
  })

  it('elimina el archivo autorizado de la base y del almacenamiento', async () => {
    const stored = await prisma.file.findUniqueOrThrow({ where: { id: fileId } })
    const response = await createApp().handle(request(`/api/v1/admin/files/${fileId}`, { method: 'DELETE', headers }))
    expect(response.status).toBe(200)
    await expect(prisma.file.findUnique({ where: { id: fileId } })).resolves.toBeNull()
    await expect(access(path.join(storageRoot, stored.storageKey))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rechaza carga sin sesión antes de tocar datos o almacenamiento', async () => {
    const form = new FormData()
    form.append('file', new File(['contenido'], 'sin-sesion.pdf', { type: 'application/pdf' }))
    const before = await prisma.file.count({ where: { uploadedById: userId } })
    const response = await createApp().handle(request('/api/v1/admin/files', { method: 'POST', body: form }))
    expect(response.status).toBe(401)
    expect(await prisma.file.count({ where: { uploadedById: userId } })).toBe(before)
  })
})
