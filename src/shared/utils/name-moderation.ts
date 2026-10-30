import { findModerationTerm } from './moderation-text'

const offensiveTerms = [
  'puta', 'puto', 'mierda', 'cerote', 'culero', 'idiota', 'imbecil',
  'pendejo', 'fuck', 'shit', 'bitch', 'nazi'
]

export const findOffensiveNameTerm = (value: string) => findModerationTerm(value, offensiveTerms)
export const containsOffensiveName = (value: string) => findOffensiveNameTerm(value) !== null
