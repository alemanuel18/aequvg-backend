export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'
export type LogContext = Record<string, boolean | number | string | null | undefined>

const priorities: Record<Exclude<LogLevel, 'silent'>, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const configuredLevel = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')) as LogLevel
const level: LogLevel = configuredLevel in priorities || configuredLevel === 'silent' ? configuredLevel : 'info'
const format = process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')

const enabled = (candidate: Exclude<LogLevel, 'silent'>) => level !== 'silent' && priorities[candidate] >= priorities[level]

const write = (candidate: Exclude<LogLevel, 'silent'>, event: string, context: LogContext = {}) => {
  if (!enabled(candidate)) return

  const entry = { timestamp: new Date().toISOString(), level: candidate, service: 'aequvg-backend', event, ...context }
  const output = format === 'json'
    ? JSON.stringify(entry)
    : `${entry.timestamp} ${candidate.toUpperCase()} ${event}${Object.keys(context).length ? ` ${JSON.stringify(context)}` : ''}`

  if (candidate === 'error') console.error(output)
  else if (candidate === 'warn') console.warn(output)
  else if (candidate === 'info') console.info(output)
  else console.debug(output)
}

export const logger = {
  debug: (event: string, context?: LogContext) => write('debug', event, context),
  info: (event: string, context?: LogContext) => write('info', event, context),
  warn: (event: string, context?: LogContext) => write('warn', event, context),
  error: (event: string, context?: LogContext) => write('error', event, context),
}
