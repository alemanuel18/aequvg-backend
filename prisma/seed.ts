import { PrismaClient, ProjectStatus } from '@prisma/client'

const prisma = new PrismaClient()
const developmentPublishedAt = new Date('2026-01-15T12:00:00.000Z')

const board = [
  ['Pablo José', 'Presidente', 'ros23193@uvg.edu.gt'],
  ['Andrea María', 'Vicepresidenta', 'moc23178@uvg.edu.gt'],
  ['Carlos Eduardo', 'Secretario', 'rom23159@uvg.edu.gt'],
  ['Sofía Alejandra', 'Tesorera', 'moc23162@uvg.edu.gt'],
  ['Luis Fernando', 'Vocal', 'ros23170@uvg.edu.gt']
] as const

async function main() {
  const role = await prisma.role.upsert({
    where: { name: 'CONTENT_ADMIN' },
    update: { description: 'Rol de desarrollo para contenido público.', active: true },
    create: { name: 'CONTENT_ADMIN', description: 'Rol de desarrollo para contenido público.' }
  })

  for (const permission of [
    { code: 'CONTENT_MANAGE', description: 'Gestionar contenido público.' },
    { code: 'FILES_MANAGE', description: 'Gestionar metadatos de archivos externos.' }
  ]) {
    const savedPermission = await prisma.permission.upsert({
      where: { code: permission.code }, update: permission, create: permission
    })
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: savedPermission.id } },
      update: {}, create: { roleId: role.id, permissionId: savedPermission.id }
    })
  }

  const developmentUser = await prisma.administrativeUser.upsert({
    where: { email: 'contenido.desarrollo@uvg.edu.gt' },
    update: { name: 'Contenido de desarrollo', roleId: role.id, status: 'ACTIVO' },
    create: { name: 'Contenido de desarrollo', email: 'contenido.desarrollo@uvg.edu.gt', roleId: role.id }
  })

  const methods = [
    { type: 'EMAIL' as const, label: 'Correo oficial', value: 'asoquimica@uvg.edu.gt', url: 'mailto:asoquimica@uvg.edu.gt', displayOrder: 1 },
    { type: 'TELEFONO' as const, label: 'Teléfono / WhatsApp', value: '+502 2368-8000', url: 'tel:+5022368-8000', displayOrder: 2 },
    { type: 'UBICACION' as const, label: 'Ubicación presencial', value: 'Campus Central UVG, zona 15, Ciudad de Guatemala', displayOrder: 3 },
    { type: 'INSTAGRAM' as const, label: 'Instagram', value: '@aeq__uvg', url: 'https://www.instagram.com/aeq__uvg/', displayOrder: 4 }
  ]
  for (const method of methods) {
    const existing = await prisma.contactMethod.findFirst({ where: { type: method.type, value: method.value } })
    if (existing) await prisma.contactMethod.update({ where: { id: existing.id }, data: { ...method, active: true } })
    else await prisma.contactMethod.create({ data: method })
  }

  for (const [index, [name, position, institutionalEmail]] of board.entries()) {
    const data = { name, position, institutionalEmail, term: '2026', displayOrder: index + 1, status: 'ACTIVO' as const }
    const existing = await prisma.boardMember.findFirst({ where: { institutionalEmail } })
    if (existing) await prisma.boardMember.update({ where: { id: existing.id }, data })
    else await prisma.boardMember.create({ data })
  }

  const blocks = [
    { type: 'HERO' as const, title: 'Contenido de desarrollo', subtitle: 'Datos de ejemplo para una base local.', body: 'Este bloque permite verificar el flujo público sin usar contenido institucional definitivo.', displayOrder: 1 },
    { type: 'LABORATORIO' as const, title: 'Laboratorios', subtitle: null, body: 'Información de ejemplo para validar el orden del contenido.', displayOrder: 1 }
  ]
  for (const block of blocks) {
    const existing = await prisma.institutionalBlock.findFirst({ where: { type: block.type, displayOrder: block.displayOrder } })
    const data = { ...block, status: 'PUBLICADO' as const, publishedAt: developmentPublishedAt }
    if (existing) await prisma.institutionalBlock.update({ where: { id: existing.id }, data })
    else await prisma.institutionalBlock.create({ data })
  }

  const pdfMetadata = await prisma.file.upsert({
    where: { storageKey: 'development/resources/guia-seguridad-laboratorio.pdf' },
    update: { originalName: 'guia-seguridad-laboratorio.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(2048), sha256: '4fd1d6e7e84d9b7b8f1695af1cb68a1ff35f4a9c39b06d955efc29c8c8376520', uploadedById: developmentUser.id },
    create: { originalName: 'guia-seguridad-laboratorio.pdf', storageKey: 'development/resources/guia-seguridad-laboratorio.pdf', mimeType: 'application/pdf', sizeBytes: BigInt(2048), sha256: '4fd1d6e7e84d9b7b8f1695af1cb68a1ff35f4a9c39b06d955efc29c8c8376520', uploadedById: developmentUser.id }
  })

  const resource = await prisma.resource.findFirst({ where: { createdById: developmentUser.id, title: 'Guía de seguridad de laboratorio (desarrollo)' } })
  const resourceData = { fileId: pdfMetadata.id, title: 'Guía de seguridad de laboratorio (desarrollo)', description: 'Recurso de prueba que referencia metadatos de un PDF almacenado fuera de PostgreSQL.', category: 'Laboratorio', externalUrl: null, status: 'PUBLICADO' as const, publishedAt: developmentPublishedAt }
  if (resource) await prisma.resource.update({ where: { id: resource.id }, data: resourceData })
  else await prisma.resource.create({ data: { ...resourceData, createdById: developmentUser.id } })

  const news = await prisma.news.findFirst({ where: { createdById: developmentUser.id, title: 'Noticia de desarrollo del MVP público' } })
  const newsData = { title: 'Noticia de desarrollo del MVP público', summary: 'Registro de ejemplo para validar la base limpia.', content: 'Este contenido es exclusivamente de desarrollo y no corresponde a una comunicación institucional.', category: 'Desarrollo', status: 'PUBLICADO' as const, publishedAt: developmentPublishedAt }
  if (news) await prisma.news.update({ where: { id: news.id }, data: newsData })
  else await prisma.news.create({ data: { ...newsData, createdById: developmentUser.id } })

  const projects = [
    { title: 'Plataforma de Control Académico', slug: 'plataforma-control-academico', description: 'Sistema web para la gestión de notas y asignación de cursos universitarios.', repositoryUrl: 'https://github.com/ejemplo/control-academico', liveUrl: 'https://demo.control-academico.edu', status: ProjectStatus.APROBADO, reviewerId: developmentUser.id, reviewedAt: developmentPublishedAt },
    { title: 'Aplicación Móvil de Eventos Universitarios', slug: 'app-eventos-universitarios', description: 'App para consultar agenda institucional e inscribirse a talleres.', repositoryUrl: 'https://github.com/ejemplo/app-eventos', liveUrl: null, status: ProjectStatus.EN_REVISION, reviewerId: null, reviewedAt: null },
    { title: 'Script de Monitoreo de Redes', slug: 'script-monitoreo-redes', description: 'Herramienta en terminal para analizar tráfico local.', repositoryUrl: null, liveUrl: null, status: ProjectStatus.NO_APROBADO, reviewerId: developmentUser.id, reviewedAt: developmentPublishedAt, rejectionReason: 'El proyecto debe ser una aplicación web expuesta con interfaz visual.' }
  ]
  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: { ...project, authorId: developmentUser.id },
      create: { ...project, authorId: developmentUser.id }
    })
  }

  console.info('Seed completado')
}

main()
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
