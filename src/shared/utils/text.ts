export const cleanText = (value: string) => value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()

export const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
