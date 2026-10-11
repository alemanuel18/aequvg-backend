import type { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

const fileSelect = {
  id: true, uploadedById: true, originalName: true, storageKey: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true
} satisfies Prisma.FileSelect

export const fileRepository = {
  create: (data: Prisma.FileCreateInput) => prisma.file.create({ data, select: fileSelect }),
  findById: (id: number) => prisma.file.findUnique({ where: { id }, select: { ...fileSelect, _count: { select: { publications: true, newsImages: true, eventImages: true, resources: true, boardPhotos: true, projectCovers: true } } } }),
  remove: (id: number) => prisma.file.delete({ where: { id }, select: fileSelect })
}
