import { t } from 'elysia'

export const commentTargetType = t.Union([t.Literal('NOTICIA'), t.Literal('PROYECTO'), t.Literal('EVENTO')])
export const commentTargetParams = t.Object({ targetType: commentTargetType, targetId: t.Integer({ minimum: 1 }) })
export const commentBody = t.Object({ content: t.String({ minLength: 1, maxLength: 2000 }) })
export const commentPagination = t.Object({
  page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 }))
})
export const commentIdParams = t.Object({ id: t.Integer({ minimum: 1 }) })
export const commentRevisionAction = t.Union([t.Literal('EDIT'), t.Literal('DELETE')])
export const commentRevisionResponse = t.Object({
  id: t.Integer(), commentId: t.Integer(), targetType: commentTargetType, targetId: t.Integer(),
  action: commentRevisionAction, previousContent: t.String(), nextContent: t.Nullable(t.String()),
  actorName: t.String(), changedAt: t.String({ format: 'date-time' })
})
export const commentResponse = t.Object({
  id: t.Integer(), targetType: commentTargetType, targetId: t.Integer(), content: t.String(),
  authorName: t.String(), createdAt: t.String({ format: 'date-time' })
})
export const commentListResponse = t.Object({ items: t.Array(commentResponse), page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
export const commentRevisionListResponse = t.Object({ items: t.Array(commentRevisionResponse), page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
export const commentDeleteResponse = t.Object({ deleted: t.Boolean() })
export const commentErrorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String(), details: t.Optional(t.Record(t.String(), t.String())) }) })
