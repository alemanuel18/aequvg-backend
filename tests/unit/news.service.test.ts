import { describe, expect, it } from 'vitest'
import { normalizeNewsText, publicationDate } from '../../src/modules/news/services/news.service'

describe('servicio de noticias', () => {
  it('solo conserva la fecha para publicaciones activas', () => {
    expect(publicationDate('BORRADOR', '2026-09-25T12:00:00.000Z')).toBeNull()
    expect(publicationDate('ARCHIVADO', '2026-09-25T12:00:00.000Z')).toBeNull()
    expect(publicationDate('PUBLICADO', '2026-09-25T12:00:00.000Z')).toEqual(new Date('2026-09-25T12:00:00.000Z'))
  })

  it('limpia HTML y rechaza contenido vacío después de normalizarlo', () => {
    expect(normalizeNewsText('  Noticia <strong>importante</strong>  ', 'title', 3)).toBe('Noticia importante')
    expect(() => normalizeNewsText('   <p></p>   ', 'summary', 10)).toThrowError(/summary/i)
  })
})
