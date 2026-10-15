import { describe, expect, it } from 'vitest'
import { containsOffensiveName } from '../../src/shared/utils/name-moderation'

describe('filtro de nombres de estudiantes', () => {
  it('acepta nombres personales sin términos bloqueados', () => {
    expect(containsOffensiveName('María José Pérez')).toBe(false)
  })

  it('detecta términos ofensivos aunque usen mayúsculas o tildes', () => {
    expect(containsOffensiveName('Nombre CEROTE')).toBe(true)
    expect(containsOffensiveName('Idióta')).toBe(true)
  })

  it('no bloquea coincidencias parciales dentro de un nombre', () => {
    expect(containsOffensiveName('Putomayo')).toBe(false)
  })
})
