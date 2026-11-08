import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../../../shared/errors/app-error'
import { prisma } from '../../../shared/database/prisma'
import { fileRepository } from '../repositories/file.repository'
import { resourceRepository } from '../repositories/resource.repository'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const allowedDocumentMimeTypes = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/x-zip-compressed'])
const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const storageRoot = () => path.resolve(process.env.STORAGE_ROOT ?? path.resolve(process.cwd(), 'storage'))

const responseFile = (file: { id: number; uploadedById: number; originalName: string; mimeType: string; sizeBytes: bigint; sha256: string; createdAt: Date }) => ({
  id: file.id, uploadedById: file.uploadedById, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: Number(file.sizeBytes), sha256: file.sha256, createdAt: file.createdAt
})

const safeName = (name: string) => {
  const normalized = path.basename(name).replace(/[\u0000-\u001f\\/]+/g, '-').trim()
  if (!normalized || normalized === '.' || normalized === '..') throw new AppError(422, 'INVALID_FILE_NAME', 'El nombre del archivo no es válido.')
  return normalized.slice(0, 255)
}

export const fileService = {
  async upload(uploadedById: number, input: File, kind: 'document' | 'image' = 'document') {
    if (!input || input.size <= 0) throw new AppError(422, 'INVALID_FILE', 'Debes enviar un archivo no vacío.')
    if (input.size > MAX_FILE_BYTES) throw new AppError(422, 'FILE_TOO_LARGE', 'El archivo supera el límite de 25 MB.')
    const allowedMimeTypes = kind === 'image' ? allowedImageMimeTypes : allowedDocumentMimeTypes
    if (!allowedMimeTypes.has(input.type)) throw new AppError(422, 'UNSUPPORTED_FILE_TYPE', 'El tipo de archivo no está permitido.')

    const originalName = safeName(input.name)
    const bytes = Buffer.from(await input.arrayBuffer())
    if (input.type === 'application/pdf' && !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw new AppError(422, 'INVALID_PDF_CONTENT', 'El archivo no contiene una cabecera PDF válida.')
    }
    if (kind === 'image') {
      const validSignature = input.type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        || input.type === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        || input.type === 'image/gif' && bytes.subarray(0, 6).toString('ascii').startsWith('GIF8')
        || input.type === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      if (!validSignature) throw new AppError(422, 'INVALID_IMAGE_CONTENT', 'El archivo no contiene una imagen válida.')
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const storageKey = `${kind === 'image' ? 'images' : 'resources'}/${randomUUID()}/${originalName}`
    const root = storageRoot()
    const absolutePath = path.resolve(root, storageKey)
    if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new AppError(422, 'INVALID_FILE_NAME', 'El nombre del archivo no es válido.')

    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, bytes, { flag: 'wx' })
    try {
      const file = await fileRepository.create({ uploadedBy: { connect: { id: uploadedById } }, originalName, storageKey, mimeType: input.type, sizeBytes: BigInt(input.size), sha256 })
      return responseFile(file)
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined)
      throw error
    }
  },

  async listImages() {
    return (await fileRepository.listImages()).map(file => ({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      createdAt: file.createdAt,
      previewUrl: `/api/v1/admin/news/images/${file.id}/preview`
    }))
  },

  async uploadImage(uploadedById: number, input: File) {
    const file = await this.upload(uploadedById, input, 'image')
    return { ...file, previewUrl: `/api/v1/admin/news/images/${file.id}/preview` }
  },

  async previewImage(id: number) {
    const file = await fileRepository.findImageById(id)
    if (!file) throw new AppError(404, 'IMAGE_NOT_FOUND', 'La imagen solicitada no existe.')
    const bytes = await readFile(path.resolve(storageRoot(), file.storageKey))
    return { bytes, mimeType: file.mimeType, originalName: file.originalName }
  },

  async remove(id: number) {
    const file = await fileRepository.findById(id)
    if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'El archivo solicitado no existe.')
    if (Object.values(file._count).some(count => count > 0)) throw new AppError(409, 'FILE_IN_USE', 'El archivo está asociado a contenido y no puede eliminarse.')
    const removed = await fileRepository.remove(id)
    await unlink(path.resolve(storageRoot(), removed.storageKey)).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error })
    return responseFile(removed)
  },

  async downloadForPublicResource(resourceId: number) {
    const result = await resourceRepository.findPublicFile(resourceId)
    if (!result?.file) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'El recurso solicitado no existe.')
    const bytes = await readFile(path.resolve(storageRoot(), result.file.storageKey))
    return { bytes, originalName: result.file.originalName, mimeType: result.file.mimeType }
  },

  async downloadProjectDocument(projectId: number) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { documentFile: { select: { originalName: true, mimeType: true, storageKey: true } } } })
    if (!project?.documentFile || project.documentFile.mimeType !== 'application/pdf') throw new AppError(404, 'PROJECT_DOCUMENT_NOT_FOUND', 'El proyecto no tiene un PDF asociado.')
    const bytes = await readFile(path.resolve(storageRoot(), project.documentFile.storageKey))
    return { bytes, originalName: project.documentFile.originalName, mimeType: project.documentFile.mimeType }
  },

  async downloadPublicProjectDocument(projectId: number) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, status: 'APROBADO' },
      select: { documentFile: { select: { originalName: true, mimeType: true, storageKey: true } } }
    })
    if (!project?.documentFile || project.documentFile.mimeType !== 'application/pdf') {
      throw new AppError(404, 'PROJECT_DOCUMENT_NOT_FOUND', 'El proyecto no tiene un PDF publicado.')
    }
    const bytes = await readFile(path.resolve(storageRoot(), project.documentFile.storageKey))
    return { bytes, originalName: project.documentFile.originalName, mimeType: project.documentFile.mimeType }
  }
}
