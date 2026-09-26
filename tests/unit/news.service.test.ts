import { describe, expect, it } from 'vitest'
import { publicationDate } from '../../src/modules/news/services/news.service'

describe('servicio de noticias', () => {
  it('solo conserva la fecha para publicaciones activas', () => {
    expect(publicationDate('BORRADOR', '2026-09-25T12:00:00.000Z')).toBeNull()
    expect(publicationDate('ARCHIVADO', '2026-09-25T12:00:00.000Z')).toBeNull()
    expect(publicationDate('PUBLICADO', '2026-09-25T12:00:00.000Z')).toEqual(new Date('2026-09-25T12:00:00.000Z'))
  })
})
