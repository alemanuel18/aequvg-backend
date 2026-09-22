export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message)
  }
}

export const errorBody = (error: unknown) => {
  if (error instanceof AppError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message, details: error.details } } }
  }
  console.error('Error interno no sensible', error instanceof Error ? error.name : 'UnknownError')
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'No fue posible completar la solicitud.' } } }
}
