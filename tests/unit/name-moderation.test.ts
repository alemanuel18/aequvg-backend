import { describe, expect, it } from 'vitest'
import { containsOffensiveName } from '../../src/shared/utils/name-moderation'

describe('filtro de nombres de estudiantes', () => {
  it('acepta nombres personales sin términos bloqueados', () => {
    expect(containsOffensiveName('María José Pérez')).toBe(false)
  })

  it.each([
    ['CEROTE', 'Nombre CEROTE'],
    ['tildes y mayúsculas', 'IDÍOTA Pérez'],
    ['separadores', 'i.d.i.o.t.a'],
    ['caracteres invisibles', 'i\u200Bd\u200Biota'],
    ['sustituciones simples', '1d10ta']
  ])('detecta el corpus ofensivo con %s', (_label, candidate) => {
    expect(containsOffensiveName(candidate)).toBe(true)
  })

  it.each([
    ['topónimo con coincidencia parcial', 'Putomayo'],
    ['nombre académico', 'María Analía Pérez'],
    ['nombre inocuo con acentos', 'José María López']
  ])('no marca como ofensivo el caso inocuo: %s', (_label, candidate) => {
    expect(containsOffensiveName(candidate)).toBe(false)
  })
})
