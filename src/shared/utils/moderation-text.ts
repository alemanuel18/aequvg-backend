const lookalikes: Record<string, string> = {
  'а': 'a', 'ɑ': 'a', 'α': 'a', 'в': 'b', 'β': 'b', 'с': 'c', 'ϲ': 'c',
  'ԁ': 'd', 'е': 'e', 'ε': 'e', 'ё': 'e', 'ғ': 'f', 'ց': 'g', 'һ': 'h',
  'і': 'i', 'ι': 'i', 'ї': 'i', 'ј': 'j', 'κ': 'k', 'к': 'k', 'ӏ': 'l',
  'м': 'm', 'ո': 'n', 'п': 'n', 'о': 'o', 'ο': 'o', 'р': 'p', 'ρ': 'p',
  'զ': 'q', 'г': 'r', 'ѕ': 's', 'ტ': 't', 'т': 't', 'υ': 'u', 'ν': 'v',
  'х': 'x', 'χ': 'x', 'у': 'y', 'γ': 'y', 'з': '3', '０': '0', '１': '1'
}
const evasions: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' }

const mapCharacters = (value: string, map: Record<string, string>) => [...value].map(character => map[character] ?? character).join('')

export const normalizeModerationText = (value: string) => mapCharacters(
  mapCharacters(value.normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Cf}/gu, '')
    .toLocaleLowerCase('es'), lookalikes), evasions
).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

/** Exact words and simple punctuation/leet evasions, without substring matching. */
export const findModerationTerm = (value: string, terms: readonly string[], exceptions: readonly string[] = []) => {
  const normalized = normalizeModerationText(value)
  if (!normalized || exceptions.some(exception => normalizeModerationText(exception) === normalized)) return null
  const blocked = new Map(terms.map(term => [normalizeModerationText(term), term]))
  const candidates = new Set(normalized.split(' '))

  // Punctuation inserted inside a single whitespace-delimited token is removed
  // for a second exact-token check; ordinary word boundaries remain intact.
  const folded = mapCharacters(mapCharacters(value.normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Cf}/gu, '')
    .toLocaleLowerCase('es'), lookalikes), evasions)
  for (const rawToken of folded.split(/\s+/)) {
    const compact = rawToken.replace(/[^a-z0-9]/g, '')
    if (compact) candidates.add(compact)
  }

  for (const candidate of candidates) {
    const matched = blocked.get(candidate)
    if (matched) return matched
  }
  return null
}
