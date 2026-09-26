import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const expectedTables = [
  'rol', 'permiso', 'rol_permiso', 'usuario_administrativo', 'credencial_administrativa', 'archivo',
  'publicacion_cientifica', 'persona_autora', 'publicacion_contribuyente', 'aprobacion_publicacion',
  'noticia', 'evento', 'inscripcion_evento', 'recurso', 'miembro_junta', 'solicitud_contacto',
  'bloque_institucional', 'medio_contacto', 'proyecto'
]

const expectedConstraints = [
  'archivo_cargado_por_fkey', 'noticia_creado_por_fkey', 'evento_creado_por_fkey', 'recurso_creado_por_fkey',
  'recurso_destino_check', 'archivo_tamano_positivo_check', 'evento_capacidad_positiva_check',
  'reunion_fecha_preferida_check', 'proyecto_id_autor_fkey', 'proyecto_id_revisor_fkey',
  'proyecto_id_imagen_portada_fkey'
]

const expectedIndexes = [
  'archivo_clave_almacenamiento_key', 'noticia_estado_publicado_en_idx', 'evento_estado_inicia_en_idx',
  'recurso_estado_publicado_en_idx', 'miembro_junta_estado_orden_idx', 'solicitud_contacto_estado_atencion_enviado_en_idx',
  'proyecto_slug_key', 'proyecto_estado_creado_en_idx', 'proyecto_id_autor_idx', 'proyecto_id_revisor_idx',
  'proyecto_id_imagen_portada_idx'
]

const requireAll = (actual: string[], expected: string[], label: string) => {
  const missing = expected.filter(item => !actual.includes(item))
  if (missing.length) throw new Error(`${label} faltantes: ${missing.join(', ')}`)
}

async function main() {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
  `
  requireAll(tables.map(table => table.table_name), expectedTables, 'Tablas')

  const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace
  `
  requireAll(constraints.map(constraint => constraint.conname), expectedConstraints, 'Restricciones')

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `
  requireAll(indexes.map(index => index.indexname), expectedIndexes, 'Índices')

  const binaryColumns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND udt_name = 'bytea'
  `
  if (binaryColumns.length) throw new Error(`No se permiten binarios en PostgreSQL: ${binaryColumns.map(column => `${column.table_name}.${column.column_name}`).join(', ')}`)

  const [boardMembers, contactMethods, blocks, news, resources, projects, pdfMetadata] = await Promise.all([
    prisma.boardMember.count(),
    prisma.contactMethod.count(),
    prisma.institutionalBlock.count(),
    prisma.news.count(),
    prisma.resource.count(),
    prisma.project.count(),
    prisma.file.findUnique({ where: { storageKey: 'development/resources/guia-seguridad-laboratorio.pdf' } })
  ])
  if (!boardMembers || !contactMethods || !blocks || !news || !resources || !projects || !pdfMetadata) throw new Error('Faltan datos de desarrollo después de ejecutar la seed.')
  if (pdfMetadata.mimeType !== 'application/pdf' || !pdfMetadata.storageKey || pdfMetadata.sizeBytes <= 0n) throw new Error('Los metadatos del PDF de desarrollo son inválidos.')

  console.info(JSON.stringify({ tables: tables.length, boardMembers, contactMethods, blocks, news, resources, projects, pdfStorage: pdfMetadata.storageKey }))
}

main().finally(() => prisma.$disconnect())
