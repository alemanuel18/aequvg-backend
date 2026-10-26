import { findModerationTerm } from '../../../shared/utils/moderation-text'

/**
 * Política léxica inicial para texto público. Rechaza insultos directos; no
 * determina intención, contexto ni abuso expresado con términos no listados.
 */
const blockedCommentTerms = new Set([
  'puta', 'puto', 'mierda', 'cerote', 'culero', 'idiota', 'imbecil',
  'pendejo', 'fuck', 'shit', 'bitch'
])

export const publicTextModerationService = {
  findOffensiveTerm(content: string) {
    return findModerationTerm(content, [...blockedCommentTerms])
  },
  isCommentAllowed(content: string) {
    return this.findOffensiveTerm(content) === null
  }
}
