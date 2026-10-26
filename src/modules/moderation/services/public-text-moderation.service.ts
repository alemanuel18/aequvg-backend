/**
 * Política léxica inicial para texto público. Rechaza insultos directos; no
 * determina intención, contexto ni abuso expresado con términos no listados.
 */
const blockedCommentTerms = new Set([
  'puta', 'puto', 'mierda', 'cerote', 'culero', 'idiota', 'imbecil',
  'pendejo', 'fuck', 'shit', 'bitch'
])

const normalize = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .toLocaleLowerCase('es')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

export const publicTextModerationService = {
  isCommentAllowed(content: string) {
    return !normalize(content).split(/\s+/).some(term => blockedCommentTerms.has(term))
  }
}
