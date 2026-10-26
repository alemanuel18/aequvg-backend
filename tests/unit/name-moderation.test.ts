import { describe, expect, it } from 'vitest'
import { containsOffensiveName } from '../../src/shared/utils/name-moderation'
import { innocuousNameCorpus, offensiveNameCorpus } from '../fixtures/moderation-corpus'

describe('filtro de nombres de estudiantes', () => {
  it.each(offensiveNameCorpus)('detecta el corpus ofensivo (%s): %s', (_label, candidate) => {
    expect(containsOffensiveName(candidate)).toBe(true)
  })

  it.each(innocuousNameCorpus)('no marca como ofensivo el caso inocuo (%s): %s', (_label, candidate) => {
    expect(containsOffensiveName(candidate)).toBe(false)
  })
})
