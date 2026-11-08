import type { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

const fileSelect = {
  id: true, uploadedById: true, originalName: true, storageKey: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true
} satisfies Prisma.FileSelect

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

export const fileRepository = {
  create: (data: Prisma.FileCreateInput) => prisma.file.create({ data, select: fileSelect }),
  listImages: () => prisma.file.findMany({
    where: { mimeType: { in: [...imageMimeTypes] } },
    select: fileSelect,
    orderBy: { createdAt: 'desc' }
  }),
  findImageById: (id: number) => prisma.file.findFirst({
    where: { id, mimeType: { in: [...imageMimeTypes] } },
    select: fileSelect
  }),
  findById: (id: number) => prisma.file.findUnique({ where: { id }, select: { ...fileSelect, _count: { select: { publications: true, newsImages: true, eventImages: true, resources: true, boardPhotos: true, projectCovers: true, projectDocuments: true } } } }),
  remove: (id: number) => prisma.file.delete({ where: { id }, select: fileSelect })
}
