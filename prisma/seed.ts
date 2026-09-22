import { PrismaClient } from '@prisma/client'

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
  const methods = [
    { type: 'EMAIL' as const, label: 'Correo oficial', value: 'asoquimica@uvg.edu.gt', url: 'mailto:asoquimica@uvg.edu.gt', displayOrder: 1 },
    { type: 'TELEFONO' as const, label: 'Teléfono / WhatsApp', value: '+502 2368-8000', url: 'tel:+50223688000', displayOrder: 2 },
    { type: 'UBICACION' as const, label: 'Ubicación presencial', value: 'Campus Central UVG, zona 15, Ciudad de Guatemala', displayOrder: 3 },
    { type: 'INSTAGRAM' as const, label: 'Instagram', value: '@aeq__uvg', url: 'https://www.instagram.com/aeq__uvg/', displayOrder: 4 }
  ]
  for (const method of methods) {
    const existing = await prisma.contactMethod.findFirst({ where: { type: method.type, value: method.value } })
    if (existing) await prisma.contactMethod.update({ where: { id: existing.id }, data: { ...method, active: true } })
    else await prisma.contactMethod.create({ data: method })
  }
  for (const [index, [name, position, institutionalEmail]] of board.entries()) {
    const existing = await prisma.boardMember.findFirst({ where: { institutionalEmail } })
    const data = { name, position, institutionalEmail, term: '2026', displayOrder: index + 1, status: 'ACTIVO' as const }
    if (existing) await prisma.boardMember.update({ where: { id: existing.id }, data })
    else await prisma.boardMember.create({ data })
  }
}

main().finally(() => prisma.$disconnect())
