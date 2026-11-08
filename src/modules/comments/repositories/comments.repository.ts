import { createHash } from 'node:crypto'
import type { CommentTargetType, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export type CommentPage = { page: number; pageSize: number }
export const normalizeComment = (input: string) => input.normalize('NFC').replace(/\r\n?/g, '\n').trim()
export const commentHash = (studentId: number, targetType: CommentTargetType, targetId: number, content: string) => createHash('sha256')
  .update(`${studentId}\n${targetType}\n${targetId}\n${content.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es')}`)
  .digest('hex')

const select = {
  id: true, studentId: true, targetType: true, newsId: true, projectId: true, eventId: true,
  content: true, createdAt: true,
  student: { select: { firstNames: true, lastNames: true } }
} satisfies Prisma.PublicationCommentSelect

const targetWhere = (targetType: CommentTargetType, targetId: number) => targetType === 'NOTICIA'
  ? { targetType, newsId: targetId }
  : targetType === 'PROYECTO' ? { targetType, projectId: targetId } : { targetType, eventId: targetId }

export const commentsRepository = {
  findVisibleTarget: async (targetType: CommentTargetType, targetId: number) => {
    if (targetType === 'NOTICIA') return prisma.news.findFirst({ where: { id: targetId, status: 'PUBLICADO', publishedAt: { lte: new Date() }, category: { active: true } }, select: { id: true } })
    if (targetType === 'PROYECTO') return prisma.project.findFirst({ where: { id: targetId, type: 'PROYECTO', status: 'APROBADO' }, select: { id: true } })
    return prisma.event.findFirst({ where: { id: targetId, status: 'PUBLICADO' }, select: { id: true } })
  },
  create: (data: {
    studentId: number; targetType: CommentTargetType; targetId: number; content: string; dedupeHash: string
  }) => prisma.publicationComment.create({
    data: {
      studentId: data.studentId, targetType: data.targetType, content: data.content, dedupeHash: data.dedupeHash,
      ...(data.targetType === 'NOTICIA' ? { newsId: data.targetId } : {}),
      ...(data.targetType === 'PROYECTO' ? { projectId: data.targetId } : {}),
      ...(data.targetType === 'EVENTO' ? { eventId: data.targetId } : {})
    }, select
  }),
  updateOwned: (studentId: number, commentId: number, content: string) => prisma.$transaction(async tx => {
    const current = await tx.publicationComment.findFirst({ where: { id: commentId, studentId, deletedAt: null }, select })
    if (!current) return null
    if (current.content === content) return { comment: current, changed: false }
    const targetId = current.newsId ?? current.projectId ?? current.eventId!
    const dedupeHash = commentHash(studentId, current.targetType, targetId, content)
    await tx.publicationComment.update({ where: { id: commentId }, data: { content, dedupeHash } })
    await tx.publicationCommentRevision.create({ data: {
      commentId, actorStudentId: studentId, action: 'EDIT', previousContent: current.content, nextContent: content
    } })
    const updated = await tx.publicationComment.findUniqueOrThrow({ where: { id: commentId }, select })
    return { comment: updated, changed: true }
  }),
  deleteOwned: (studentId: number, commentId: number) => prisma.$transaction(async tx => {
    const current = await tx.publicationComment.findFirst({ where: { id: commentId, studentId, deletedAt: null }, select })
    if (!current) return false
    await tx.publicationCommentRevision.create({ data: {
      commentId, actorStudentId: studentId, action: 'DELETE', previousContent: current.content, nextContent: null
    } })
    const targetId = current.newsId ?? current.projectId ?? current.eventId!
    await tx.publicationComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date(), dedupeHash: commentHash(studentId, current.targetType, targetId, `deleted:${commentId}:${Date.now()}`) }
    })
    return true
  }),
  listForTarget: async (targetType: CommentTargetType, targetId: number, { page, pageSize }: CommentPage) => {
    const where = { ...targetWhere(targetType, targetId), deletedAt: null }
    const [items, total] = await Promise.all([
      prisma.publicationComment.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.publicationComment.count({ where })
    ])
    return { items, total }
  },
  listForStudent: async (studentId: number, { page, pageSize }: CommentPage) => {
    const where = { studentId, deletedAt: null }
    const [items, total] = await Promise.all([
      prisma.publicationComment.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.publicationComment.count({ where })
    ])
    return { items, total }
  },
  listHistoryForAdmins: async ({ page, pageSize }: CommentPage) => {
    const [items, total] = await Promise.all([
      prisma.publicationCommentRevision.findMany({
        include: {
          actor: { select: { firstNames: true, lastNames: true } },
          comment: { select: { id: true, targetType: true, newsId: true, projectId: true, eventId: true } }
        },
        orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.publicationCommentRevision.count()
    ])
    return { items, total }
  }
}
