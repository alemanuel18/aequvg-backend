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
    if (targetType === 'PROYECTO') return prisma.project.findFirst({ where: { id: targetId, status: 'APROBADO' }, select: { id: true } })
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
  listForTarget: async (targetType: CommentTargetType, targetId: number, { page, pageSize }: CommentPage) => {
    const where = targetWhere(targetType, targetId)
    const [items, total] = await Promise.all([
      prisma.publicationComment.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.publicationComment.count({ where })
    ])
    return { items, total }
  },
  listForStudent: async (studentId: number, { page, pageSize }: CommentPage) => {
    const where = { studentId }
    const [items, total] = await Promise.all([
      prisma.publicationComment.findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.publicationComment.count({ where })
    ])
    return { items, total }
  }
}
