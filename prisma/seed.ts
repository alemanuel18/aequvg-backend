import { PrismaClient, ProjectStatus, AdministrativeUserStatus } from '@prisma/client'

const prisma = new PrismaClient()

const board = [
  ['Pablo José', 'Presidente', 'ros23193@uvg.edu.gt'],
  ['María Alejandra Angel García', 'Vicepresidente', 'ang23087@uvg.edu.gt'],
  ['Nina María Díaz', 'Secretaria', 'dia24029@uvg.edu.gt'],
  ['Juan Pablo Armira Barco', 'Tesorero', 'arm24919@uvg.edu.gt'],
  ['Amelia Mariana Vásquez Alvarado', 'Vocal de Divulgación Científica', 'vas24558@uvg.edu.gt'],
  ['Herbert Adolfo Galindo Escobar', 'Vocal de Excursiones y Visitas Profesionales', 'gal25684@uvg.edu.gt'],
  ['Lucía Jiménez Marroquín', 'Vocal de Comunicación y Relaciones Públicas', 'jim251982@uvg.edu.gt']
] as const

async function main() {
  // 1. Limpiar la tabla de proyectos antes de reinsertar
  await prisma.project.deleteMany()

  // 2. Insertar/Actualizar Métodos de Contacto
  const methods = [
    { type: 'EMAIL' as const, label: 'Correo oficial', value: 'asoquimica@uvg.edu.gt', url: 'mailto:asoquimica@uvg.edu.gt', displayOrder: 1 },
    { type: 'TELEFONO' as const, label: 'Teléfono / WhatsApp', value: '+502 2368-8000', url: 'tel:+50223688000', displayOrder: 2 },
    { type: 'UBICACION' as const, label: 'Ubicación presencial', value: 'Campus Central UVG, zona 15, Ciudad de Guatemala', displayOrder: 3 },
    { type: 'INSTAGRAM' as const, label: 'Instagram', value: '@aeq__uvg', url: 'https://www.instagram.com/aeq__uvg/', displayOrder: 4 }
  ]
  
  for (const method of methods) {
    const existing = await prisma.contactMethod.findFirst({ where: { type: method.type, value: method.value } })
    if (existing) {
      await prisma.contactMethod.update({ where: { id: existing.id }, data: { ...method, active: true } })
    } else {
      await prisma.contactMethod.create({ data: method })
    }
  }

  // 3. Insertar/Actualizar Miembros de la Junta
  for (const [index, [name, position, institutionalEmail]] of board.entries()) {
    const existing = await prisma.boardMember.findFirst({ where: { institutionalEmail } })
    const data = { name, position, institutionalEmail, term: '2026', displayOrder: index + 1, status: 'ACTIVO' as const }
    if (existing) {
      await prisma.boardMember.update({ where: { id: existing.id }, data })
    } else {
      await prisma.boardMember.create({ data })
    }
  }

  // 4. Buscar un usuario activo o crear uno de respaldo si la BD está vacía
  let author = await prisma.administrativeUser.findFirst({
    where: { status: AdministrativeUserStatus.ACTIVO }
  })

  if (!author) {
    // Si no hay un rol existente, crea uno por defecto para asociar al usuario
    let defaultRole = await prisma.role.findFirst()
    if (!defaultRole) {
      defaultRole = await prisma.role.create({
        data: {
          name: 'ADMIN_SEED',
          description: 'Rol creado automáticamente para ejecución del seed'
        }
      })
    }

    author = await prisma.administrativeUser.create({
      data: {
        roleId: defaultRole.id,
        name: 'Administrador de Pruebas',
        email: 'admin.seed@uvg.edu.gt',
        status: AdministrativeUserStatus.ACTIVO
      }
    })
    console.log('Usuario administrativo de respaldo creado:', author.email)
  }

  // 5. Crear Proyectos de prueba
  await prisma.project.create({
    data: {
      title: 'Plataforma de Control Académico',
      slug: 'plataforma-control-academico',
      description: 'Sistema web para la gestión de notas y asignación de cursos universitarios.',
      repositoryUrl: 'https://github.com/ejemplo/control-academico',
      liveUrl: 'https://demo.control-academico.edu',
      status: ProjectStatus.APROBADO,
      authorId: author.id,
      reviewerId: author.id,
      reviewedAt: new Date(),
    },
  })

  await prisma.project.create({
    data: {
      title: 'Aplicación Móvil de Eventos Universitarios',
      slug: 'app-eventos-universitarios',
      description: 'App para consultar agenda institucional e inscribirse a talleres.',
      repositoryUrl: 'https://github.com/ejemplo/app-eventos',
      status: ProjectStatus.EN_REVISION,
      authorId: author.id,
    },
  })

  await prisma.project.create({
    data: {
      title: 'Script de Monitoreo de Redes',
      slug: 'script-monitoreo-redes',
      description: 'Herramienta en terminal para analizar tráfico local.',
      status: ProjectStatus.NO_APROBADO,
      rejectionReason: 'El proyecto debe ser una aplicación web expuesta con interfaz visual.',
      authorId: author.id,
      reviewerId: author.id,
      reviewedAt: new Date(),
    },
  })

  console.log('Proyectos de prueba creados exitosamente.')
  console.log('Seed completado')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
