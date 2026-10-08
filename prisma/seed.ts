import { PrismaClient, ProjectStatus, ProjectType } from '@prisma/client'
import { hashPassword } from '../src/shared/utils/auth-crypto'

const prisma = new PrismaClient()
const developmentPublishedAt = new Date('2026-01-15T12:00:00.000Z')
const testAdministrator = {
  name: 'Administrador de pruebas',
  email: 'admin.pruebas@uvg.edu.gt',
  password: 'AEQUVG-Pruebas-2026!'
} as const

const board = [
  ['Pablo José', 'Presidente', 'ros23193@uvg.edu.gt'],
  ['Andrea María', 'Vicepresidenta', 'moc23178@uvg.edu.gt'],
  ['Carlos Eduardo', 'Secretario', 'rom23159@uvg.edu.gt'],
  ['Sofía Alejandra', 'Tesorera', 'moc23162@uvg.edu.gt'],
  ['Luis Fernando', 'Vocal', 'ros23170@uvg.edu.gt']
] as const

async function main() {
  const permissions = [
    { code: 'ADMIN_ACCESS', description: 'Acceder al panel administrativo.' },
    { code: 'USERS_MANAGE', description: 'Crear y administrar usuarios administrativos.' },
    { code: 'ROLES_READ', description: 'Consultar roles y permisos asignables.' },
    { code: 'INSTITUTIONAL_MANAGE', description: 'Gestionar contenido institucional.' },
    { code: 'BOARD_MANAGE', description: 'Gestionar la junta directiva.' },
    { code: 'CONTACT_MANAGE', description: 'Gestionar medios y solicitudes de contacto.' },
    { code: 'NEWS_MANAGE', description: 'Gestionar noticias.' },
    { code: 'RESOURCES_MANAGE', description: 'Gestionar recursos.' },
    { code: 'PROJECTS_MANAGE', description: 'Gestionar proyectos.' },
    { code: 'EVENTS_MANAGE', description: 'Gestionar eventos e inscripciones.' },
    { code: 'PAPERS_MANAGE', description: 'Gestionar publicaciones científicas.' },
    { code: 'FILES_MANAGE', description: 'Gestionar metadatos de archivos externos.' }
  ] as const
  const savedPermissions: Array<{ id: number }> = []
  for (const permission of permissions) {
    const savedPermission = await prisma.permission.upsert({
      where: { code: permission.code }, update: permission, create: permission
    })
    savedPermissions.push(savedPermission)
  }

  const roles = [
    { name: 'ASSOCIATION_REPRESENTATIVE', description: 'Representante de la Asociación de Estudiantes de Química.' },
    { name: 'FACULTY_REPRESENTATIVE', description: 'Representante de la Facultad de Química.' },
    { name: 'CAREER_DIRECTOR', description: 'Directora de la carrera de Química.' },
    { name: 'CAREER_SECRETARY', description: 'Secretaria de la carrera de Química.' }
  ] as const
  const savedRoles = new Map<string, { id: number }>()
  for (const role of roles) {
    const savedRole = await prisma.role.upsert({
      where: { name: role.name }, update: { ...role, active: true }, create: role
    })
    savedRoles.set(role.name, savedRole)
    for (const permission of savedPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: savedRole.id, permissionId: permission.id } },
        update: {}, create: { roleId: savedRole.id, permissionId: permission.id }
      })
    }
  }

  await prisma.role.updateMany({
    where: { name: 'CONTENT_ADMIN' },
    data: { active: false }
  })

  const role = savedRoles.get('ASSOCIATION_REPRESENTATIVE')!

  const developmentUser = await prisma.administrativeUser.upsert({
    where: { email: 'contenido.desarrollo@uvg.edu.gt' },
    update: { name: 'Contenido de desarrollo', roleId: role.id, status: 'ACTIVO' },
    create: { name: 'Contenido de desarrollo', email: 'contenido.desarrollo@uvg.edu.gt', roleId: role.id }
  })
  if (process.env.SEED_ADMIN_PASSWORD) {
    const passwordHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD)
    await prisma.administrativeCredential.upsert({
      where: { userId: developmentUser.id },
      update: { passwordHash },
      create: { userId: developmentUser.id, passwordHash }
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    const user = await prisma.administrativeUser.upsert({
      where: { email: testAdministrator.email },
      update: { name: testAdministrator.name, roleId: role.id, status: 'ACTIVO' },
      create: { name: testAdministrator.name, email: testAdministrator.email, roleId: role.id }
    })
    const passwordHash = await hashPassword(testAdministrator.password)
    await prisma.administrativeCredential.upsert({
      where: { userId: user.id },
      update: { passwordHash },
      create: { userId: user.id, passwordHash }
    })
  }

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

  const resourceCategory = await prisma.resourceCategory.upsert({ where: { name: 'Laboratorio' }, update: { active: true }, create: { name: 'Laboratorio', active: true } })
  const resource = await prisma.resource.findFirst({ where: { createdById: developmentUser.id, title: 'Guía de seguridad de laboratorio (desarrollo)' } })
  const resourceData = { fileId: pdfMetadata.id, categoryId: resourceCategory.id, title: 'Guía de seguridad de laboratorio (desarrollo)', description: 'Recurso de prueba que referencia metadatos de un PDF almacenado fuera de PostgreSQL.', status: 'PUBLICADO' as const, publishedAt: developmentPublishedAt }
  const savedResource = resource ? await prisma.resource.update({ where: { id: resource.id }, data: resourceData }) : await prisma.resource.create({ data: { ...resourceData, createdById: developmentUser.id } })
  await prisma.resourceLink.upsert({ where: { resourceId_url: { resourceId: savedResource.id, url: 'https://www.uvg.edu.gt/' } }, update: { label: 'Sitio UVG', displayOrder: 1 }, create: { resourceId: savedResource.id, label: 'Sitio UVG', url: 'https://www.uvg.edu.gt/', displayOrder: 1 } })

  const legacyNewsCategory = await prisma.newsCategory.findUnique({ where: { name: 'Actividades y eventos' } })
  const existingNewsCategory = await prisma.newsCategory.findUnique({ where: { name: 'Noticias' } })
  const newsCategory = legacyNewsCategory && !existingNewsCategory
    ? await prisma.newsCategory.update({ where: { id: legacyNewsCategory.id }, data: { name: 'Noticias', active: true } })
    : await prisma.newsCategory.upsert({
      where: { name: 'Noticias' },
      update: { active: true },
      create: { name: 'Noticias', active: true }
    })
  if (legacyNewsCategory && existingNewsCategory && legacyNewsCategory.id !== existingNewsCategory.id) {
    await prisma.news.updateMany({ where: { categoryId: legacyNewsCategory.id, createdById: developmentUser.id }, data: { categoryId: existingNewsCategory.id } })
    await prisma.newsCategory.update({ where: { id: legacyNewsCategory.id }, data: { active: false } })
  }
  const news = await prisma.news.findFirst({ where: { createdById: developmentUser.id, title: 'Noticia de desarrollo del MVP público' } })
  const newsData = { categoryId: newsCategory.id, title: 'Noticia de desarrollo del MVP público', summary: 'Registro de ejemplo para validar la base limpia.', content: 'Este contenido es exclusivamente de desarrollo y no corresponde a una comunicación institucional.', status: 'PUBLICADO' as const, publishedAt: developmentPublishedAt }
  if (news) await prisma.news.update({ where: { id: news.id }, data: newsData })
  else await prisma.news.create({ data: { ...newsData, createdById: developmentUser.id } })

  const projects = [
    { title: 'Plataforma de Control Académico', slug: 'plataforma-control-academico', description: 'Sistema web para la gestión de notas y asignación de cursos universitarios.', repositoryUrl: 'https://github.com/ejemplo/control-academico', liveUrl: 'https://demo.control-academico.edu', type: ProjectType.PROYECTO, status: ProjectStatus.APROBADO, reviewerId: developmentUser.id, reviewedAt: developmentPublishedAt },
    { title: 'Aplicación Móvil de Eventos Universitarios', slug: 'app-eventos-universitarios', description: 'App para consultar agenda institucional e inscribirse a talleres.', repositoryUrl: 'https://github.com/ejemplo/app-eventos', liveUrl: null, type: ProjectType.PROYECTO, status: ProjectStatus.EN_REVISION, reviewerId: null, reviewedAt: null },
    { title: 'Script de Monitoreo de Redes', slug: 'script-monitoreo-redes', description: 'Herramienta en terminal para analizar tráfico local.', repositoryUrl: null, liveUrl: null, type: ProjectType.PROYECTO, status: ProjectStatus.NO_APROBADO, reviewerId: developmentUser.id, reviewedAt: developmentPublishedAt, rejectionReason: 'El proyecto debe ser una aplicación web expuesta con interfaz visual.' },
    { title: 'Análisis de microplásticos en fuentes hídricas urbanas (desarrollo)', slug: 'analisis-microplasticos-fuentes-hidricas', description: 'Investigación de desarrollo para explorar la identificación de microplásticos en muestras de agua mediante espectroscopía y clasificación de datos.', repositoryUrl: null, liveUrl: null, type: ProjectType.PROYECTO, status: ProjectStatus.APROBADO, reviewerId: developmentUser.id, reviewedAt: developmentPublishedAt }
  ]
  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: { ...project, authorId: developmentUser.id },
      create: { ...project, authorId: developmentUser.id }
    })
  }

  const developmentEvent = {
    name: 'Taller de espectrometría UV-Vis (desarrollo)',
    description: 'Evento de desarrollo para verificar que el sitio público consulta y presenta la agenda desde la API.',
    startsAt: new Date('2030-04-20T16:00:00.000Z'),
    location: 'Laboratorio de Química Analítica (E-302)',
    maximumCapacity: 30,
    additionalInformation: 'Registro de ejemplo; no corresponde a una convocatoria institucional.',
    status: 'PUBLICADO' as const,
  }
  const additionalNews = [
    {
      title: 'Inauguración del nuevo laboratorio de fisicoquímica',
      summary: 'Espacio renovado con equipos de alta precisión para prácticas y proyectos de investigación.',
      content: 'La carrera de Química y la Asociación celebran la apertura de nuevas instalaciones de laboratorio.'
    },
    {
      title: 'Semana de la Química 2026: Conferencias y talleres',
      summary: 'Una serie de charlas magistrales y actividades prácticas abiertas a toda la comunidad estudiantil.',
      content: 'Cronograma y detalles de los expositores invitados nacionales e internacionales para este ciclo.'
    }
  ]
  for (const item of additionalNews) {
    const existing = await prisma.news.findFirst({ where: { createdById: developmentUser.id, title: item.title } })
    const data = { categoryId: newsCategory.id, title: item.title, summary: item.summary, content: item.content, status: 'PUBLICADO' as const, publishedAt: developmentPublishedAt }
    if (existing) await prisma.news.update({ where: { id: existing.id }, data })
    else await prisma.news.create({ data: { ...data, createdById: developmentUser.id } })
  }

  const additionalEvents = [
    {
      name: 'Simposio de Innovación en Materiales y Polímeros',
      description: 'Conferencia técnica sobre polímeros biodegradables y síntesis verde en la industria actual.',
      startsAt: new Date('2030-05-15T15:00:00.000Z'),
      location: 'Auditorio I-100, Campus Central',
      maximumCapacity: 50,
      additionalInformation: 'Dirigido a estudiantes de ingeniería y ciencias químicas.',
      status: 'PUBLICADO' as const
    },
    {
      name: 'Visita técnica a la planta de tratamiento de aguas',
      description: 'Recorrido guiado para conocer procesos físico-químicos aplicados a escala industrial.',
      startsAt: new Date('2030-06-10T14:00:00.000Z'),
      location: 'Planta de Tratamiento Metrópoli',
      maximumCapacity: 25,
      additionalInformation: 'Se requiere equipo de protección personal completo.',
      status: 'PUBLICADO' as const
    }
  ]
  for (const item of additionalEvents) {
    const existing = await prisma.event.findFirst({ where: { createdById: developmentUser.id, name: item.name } })
    if (existing) await prisma.event.update({ where: { id: existing.id }, data: item })
    else await prisma.event.create({ data: { ...item, createdById: developmentUser.id } })
  }

  const firstNews = await prisma.news.findFirst({ where: { status: 'PUBLICADO' } })
  const firstEvent = await prisma.event.findFirst({ where: { status: 'PUBLICADO' } })
  if (firstNews) {
    await prisma.featuredItem.upsert({
      where: { newsId: firstNews.id },
      update: { displayOrder: 0 },
      create: { newsId: firstNews.id, displayOrder: 0 }
    })
  }
  if (firstEvent) {
    await prisma.featuredItem.upsert({
      where: { eventId: firstEvent.id },
      update: { displayOrder: 0 },
      create: { eventId: firstEvent.id, displayOrder: 0 }
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
