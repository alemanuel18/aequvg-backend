import { t } from 'elysia'

const blockFields = {
  title: t.String({ minLength: 2, maxLength: 220 }),
  subtitle: t.Optional(t.Nullable(t.String({ maxLength: 320 }))),
  body: t.String({ minLength: 2, maxLength: 8000 }),
  imageUrl: t.Optional(t.Nullable(t.String({ maxLength: 2048 }))),
  displayOrder: t.Optional(t.Integer({ minimum: 0 })),
  status: t.Optional(t.Union([t.Literal('BORRADOR'), t.Literal('PUBLICADO'), t.Literal('ARCHIVADO')]))
}

export const blockBody = t.Union([
  t.Object({
    type: t.Literal('HERO'),
    ...blockFields,
    actionLabel: t.String({ minLength: 1, maxLength: 100 }),
    actionUrl: t.String({ minLength: 1, maxLength: 2048 })
  }),
  t.Object({
    type: t.Union([
      t.Literal('CAMPO_LABORAL'),
      t.Literal('TESTIMONIO'),
      t.Literal('LABORATORIO'),
      t.Literal('PLAN_ESTUDIOS')
    ]),
    ...blockFields,
    actionLabel: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
    actionUrl: t.Optional(t.Nullable(t.String({ maxLength: 2048 })))
  })
])

export const featuredBody = t.Object({
  newsIds: t.Array(t.Integer({ minimum: 1 }), { maxItems: 3 }),
  eventIds: t.Array(t.Integer({ minimum: 1 }), { maxItems: 3 })
})

export const institutionalErrorResponse = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String()
  })
})
