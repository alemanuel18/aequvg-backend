import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = new URL('../..', import.meta.url)

describe('modelo de recursos', () => {
  it('normaliza categorías y enlaces sin almacenar binarios', async () => {
    const [schema, migration] = await Promise.all([
      readFile(new URL('prisma/schema.prisma', root), 'utf8'),
      readFile(new URL('prisma/migrations/20260926143000_modelar_recursos_categorias_enlaces_archivos/migration.sql', root), 'utf8')
    ])

    expect(schema).toContain('model ResourceCategory')
    expect(schema).toContain('model ResourceLink')
    expect(schema).toContain('categoryId  Int')
    expect(schema).toContain('fileId      Int?')
    expect(migration).toContain('recurso_id_categoria_recurso_fkey')
    expect(migration).toContain('enlace_recurso_url_http_check')
    expect(migration).toContain('recurso_id_categoria_recurso_estado_publicado_en_idx')
    expect(migration).not.toMatch(/\bBYTEA\b|\bBLOB\b/i)
  })
})
