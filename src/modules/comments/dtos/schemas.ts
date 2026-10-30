import { t } from 'elysia'

export const commentTargetType = t.Union([
  t.Literal('NOTICIA'), t.Literal('PROYECTO'), t.Literal('EVENTO')
], { description: 'Tipo de publicación con comentarios habilitados en S4: NOTICIA, proyecto de tipo PROYECTO (no TESIS) o EVENTO.' })
export const commentTargetParams = t.Object({
  targetType: commentTargetType,
  targetId: t.Integer({ minimum: 1, description: 'ID de la noticia, proyecto o evento existente.' })
})
export const commentBody = t.Object({
  content: t.String({ minLength: 1, maxLength: 2000, description: 'Texto plano de 1 a 2000 caracteres. La identidad del autor siempre se deriva de la sesión estudiantil.' })
})
export const commentPagination = t.Object({
  page: t.Optional(t.Integer({ minimum: 1, default: 1, description: 'Página basada en 1.' })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20, description: 'Elementos por página; máximo 100.' }))
})
export const commentIdParams = t.Object({ id: t.Integer({ minimum: 1 }) })
export const commentRevisionAction = t.Union([t.Literal('EDIT'), t.Literal('DELETE')])
export const commentRevisionResponse = t.Object({
  id: t.Integer(), commentId: t.Integer(), targetType: commentTargetType, targetId: t.Integer(),
  action: commentRevisionAction, previousContent: t.String(), nextContent: t.Nullable(t.String()),
  actorName: t.String(), changedAt: t.String({ format: 'date-time' })
})
export const commentResponse = t.Object({
  id: t.Integer(), targetType: commentTargetType, targetId: t.Integer(),
  content: t.String({ description: 'Texto plano; el cliente debe representarlo como texto escapado, nunca como HTML.' }),
  authorName: t.String({ description: 'Nombre visible del autor o Anónimo después de la anonimización de cuenta.' }),
  createdAt: t.String({ format: 'date-time' })
})
export const commentListResponse = t.Object({ items: t.Array(commentResponse), page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
export const commentRevisionListResponse = t.Object({ items: t.Array(commentRevisionResponse), page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
export const commentDeleteResponse = t.Object({ deleted: t.Boolean() })
export const commentErrorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String(), details: t.Optional(t.Record(t.String(), t.String())) }) })
