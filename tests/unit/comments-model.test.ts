import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../prisma/migrations/20261024120000_publication_comments/migration.sql', import.meta.url), 'utf8')

describe('contrato de persistencia de comentarios', () => {
  it('conserva un solo destino y referencia al autor anulable', () => {
    expect(schema).toContain('model PublicationComment')
    expect(schema).toContain('student StudentUser? @relation(fields: [studentId], references: [id], onDelete: SetNull)')
    expect(migration).toContain('comentario_publicacion_un_destino_check')
    expect(migration).toContain('ON DELETE SET NULL')
  })

  it('indexa historial y evita duplicados por autor, destino y hash de texto', () => {
    expect(schema).toContain('@unique(map: "comentario_publicacion_no_duplicado_idx")')
    expect(migration).toContain('comentario_publicacion_no_duplicado_idx')
    expect(migration).toContain('comentario_publicacion_estudiante_fecha_idx')
  })
})
