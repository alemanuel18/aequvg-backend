import { t } from 'elysia'

export const blockBody = t.Object({
  type: t.Union([t.Literal('HERO'), t.Literal('CAMPO_LABORAL'), t.Literal('TESTIMONIO'), t.Literal('LABORATORIO'), t.Literal('PLAN_ESTUDIOS')]),
  title: t.String({ minLength: 2, maxLength: 220 }),
  subtitle: t.Optional(t.Nullable(t.String({ maxLength: 320 }))),
  body: t.String({ minLength: 2, maxLength: 8000 }),
  imageUrl: t.Optional(t.Nullable(t.String({ maxLength: 2048 }))),
  actionLabel: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  actionUrl: t.Optional(t.Nullable(t.String({ maxLength: 2048 }))),
  displayOrder: t.Optional(t.Integer({ minimum: 0 })),
  status: t.Optional(t.Union([t.Literal('BORRADOR'), t.Literal('PUBLICADO'), t.Literal('ARCHIVADO')]))
})
