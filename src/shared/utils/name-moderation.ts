const offensiveTerms = [
  'puta', 'puto', 'mierda', 'cerote', 'culero', 'idiota', 'imbecil',
  'pendejo', 'fuck', 'shit', 'bitch', 'nazi'
]

const normalizeForModeration = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

export const containsOffensiveName = (value: string) => {
  const tokens = normalizeForModeration(value).split(/\s+/).filter(Boolean)
  return tokens.some(token => offensiveTerms.includes(token))
}
