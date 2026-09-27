import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/shared/database/prisma'

const runDatabaseTests = process.env.RESOURCE_DATABASE_TEST === 'true'
const describeDatabase = runDatabaseTests ? describe : describe.skip
const runId = `resource-test-${Date.now()}`
let roleId = 0
let authorId = 0
let categoryId = 0

describeDatabase('restricciones de recursos con PostgreSQL', () => {
  beforeAll(async () => {
    const role = await prisma.role.create({ data: { name: `${runId}-role`, description: 'Rol temporal para pruebas de recursos.' } })
    const author = await prisma.administrativeUser.create({ data: { roleId: role.id, name: 'Autor de recursos', email: `${runId}@uvg.edu.gt` } })
    const category = await prisma.resourceCategory.create({ data: { name: `${runId}-category` } })
    roleId = role.id
    authorId = author.id
    categoryId = category.id
  })

  afterAll(async () => {
    await prisma.resource.deleteMany({ where: { createdById: authorId } })
    await prisma.resourceCategory.deleteMany({ where: { id: categoryId } })
    await prisma.administrativeUser.deleteMany({ where: { id: authorId } })
    await prisma.role.deleteMany({ where: { id: roleId } })
    await prisma.$disconnect()
  })

  it('exige fecha únicamente para recursos publicados', async () => {
    await expect(prisma.resource.create({
      data: {
        createdById: authorId,
        categoryId,
        title: 'Borrador con fecha',
        description: 'No debe persistirse.',
        status: 'BORRADOR',
        publishedAt: new Date()
      }
    })).rejects.toThrow()
  })

  it('exige archivo o enlace para un recurso publicado', async () => {
    await expect(prisma.resource.create({
      data: {
        createdById: authorId,
        categoryId,
        title: 'Publicado sin destino',
        description: 'No debe persistirse.',
        status: 'PUBLICADO',
        publishedAt: new Date()
      }
    })).rejects.toThrow()

    const resource = await prisma.resource.create({
      data: {
        createdById: authorId,
        categoryId,
        title: 'Publicado con enlace',
        description: 'Debe persistirse junto con su enlace.',
        status: 'PUBLICADO',
        publishedAt: new Date(),
        links: { create: { label: 'Referencia', url: 'https://example.org/recurso' } }
      },
      include: { links: true }
    })

    expect(resource.links).toHaveLength(1)
  })
})
