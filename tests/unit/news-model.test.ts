import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = new URL('../..', import.meta.url)

describe('modelo de noticias', () => {
  it('normaliza categorías y exige una fecha solo para publicaciones visibles', async () => {
    const [schema, migration] = await Promise.all([
      readFile(new URL('prisma/schema.prisma', root), 'utf8'),
      readFile(new URL('prisma/migrations/20260925090000_modelar_noticias_y_categorias/migration.sql', root), 'utf8')
    ])
    const newsModel = schema.match(/model News \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(schema).toContain('model NewsCategory')
    expect(newsModel).toContain('categoryId Int')
    expect(newsModel).toContain('category  NewsCategory')
    expect(newsModel).toContain('updatedAt  DateTime')
    expect(newsModel).not.toMatch(/category\s+String/)
    expect(migration).toContain('noticia_id_categoria_noticia_fkey')
    expect(migration).toContain('noticia_estado_publicacion_check')
    expect(migration).toContain('noticia_id_categoria_noticia_estado_publicado_en_idx')
  })
})
