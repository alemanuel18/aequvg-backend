import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = new URL('../..', import.meta.url)

describe('contrato de persistencia del MVP público', () => {
  it('mantiene el proveedor de migraciones y la representación de archivos como metadatos', async () => {
    const [lock, schema, migration] = await Promise.all([
      readFile(new URL('prisma/migrations/migration_lock.toml', root), 'utf8'),
      readFile(new URL('prisma/schema.prisma', root), 'utf8'),
      readFile(new URL('prisma/migrations/20260922170000_sprint_2_public_content/migration.sql', root), 'utf8')
    ])

    expect(lock).toContain('provider = "postgresql"')
    expect(schema).toContain('storageKey   String')
    expect(schema).not.toMatch(/content\s+(Bytes|Buffer)|bytea|blob/i)
    expect(migration).toContain('recurso_destino_check')
    expect(migration).toContain('archivo_cargado_por_fkey')
    expect(migration).toContain('recurso_estado_publicado_en_idx')
    expect(migration).not.toMatch(/\bBYTEA\b|\bBLOB\b/i)
  })
})
