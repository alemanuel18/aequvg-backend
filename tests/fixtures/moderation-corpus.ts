/** Fixtures técnicas tomadas de los filtros locales actuales; no son política aprobada. */
export const offensiveNameCorpus = [
  ['insulto directo', 'puta'],
  ['insulto directo', 'puto'],
  ['insulto directo', 'mierda'],
  ['insulto directo', 'cerote'],
  ['insulto directo', 'culero'],
  ['insulto directo', 'idiota'],
  ['insulto directo con tilde', 'imbécil'],
  ['insulto directo', 'pendejo'],
  ['término en inglés', 'fuck'],
  ['término en inglés', 'shit'],
  ['término en inglés', 'bitch'],
  ['término directo', 'nazi'],
  ['mayúsculas y tildes', 'IDÍOTA Pérez'],
  ['separadores', 'i.d.i.o.t.a'],
  ['caracteres invisibles', 'i\u200Bd\u200Biota'],
  ['sustituciones leet', '1d10ta'],
  ['sustituciones leet', 'p3nd3j0'],
  ['letra cirílica visual', '\u0456diota'],
  ['compatibilidad Unicode', 'ｉｄｉｏｔａ']
] as const

export const offensiveCommentCorpus = [
  ['insulto directo', 'Eres una puta'],
  ['insulto directo', 'Qué mierda'],
  ['insulto directo', 'Ese cerote no respondió'],
  ['insulto directo', 'No seas culero'],
  ['insulto directo', 'Eres un idiota'],
  ['insulto directo con tilde', 'Qué imbécil'],
  ['insulto directo', 'Eres un pendejo'],
  ['término en inglés', 'That was fuck'],
  ['término en inglés', 'This is shit'],
  ['término en inglés', 'You are a bitch'],
  ['mayúsculas y tildes', 'Eres un IDIÓTA'],
  ['mayúsculas', 'Qué MIERDA'],
  ['separadores', 'i.d.i.o.t.a'],
  ['caracteres invisibles', 'i\u200Bd\u200Biota'],
  ['sustituciones leet', '1d10ta'],
  ['sustituciones leet', 'p3nd3j0'],
  ['letra cirílica visual', '\u0456diota'],
  ['compatibilidad Unicode', 'ｉｄｉｏｔａ']
] as const

export const innocuousNameCorpus = [
  ['nombre común con tildes', 'María José Pérez'],
  ['topónimo con coincidencia parcial', 'Putomayo'],
  ['nombre académico', 'María Analía Pérez'],
  ['palabra derivada, no término completo', 'Imbecilidad'],
  ['nombre con minúsculas y acentos', 'José María López']
] as const

export const innocuousCommentCorpus = [
  ['agradecimiento', 'Gracias por compartir la información.'],
  ['frase académica', 'La química analítica estudia las sustancias.'],
  ['topónimo en una frase', 'Putomayo es un topónimo de Sudamérica.'],
  ['palabra académica inocua', 'El análisis cuantitativo usa métodos cuidadosos.'],
  ['palabra derivada, no término completo', 'La imbecilidad no es un término químico.']
] as const
