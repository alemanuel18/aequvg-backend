import { createHash, randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../../../shared/errors/app-error'
import { fileRepository } from '../repositories/file.repository'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const allowedMimeTypes = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/x-zip-compressed'])
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
  async upload(uploadedById: number, input: File) {
    if (!input || input.size <= 0) throw new AppError(422, 'INVALID_FILE', 'Debes enviar un archivo no vacío.')
    if (input.size > MAX_FILE_BYTES) throw new AppError(422, 'FILE_TOO_LARGE', 'El archivo supera el límite de 25 MB.')
    if (!allowedMimeTypes.has(input.type)) throw new AppError(422, 'UNSUPPORTED_FILE_TYPE', 'El tipo de archivo no está permitido.')

    const originalName = safeName(input.name)
    const bytes = Buffer.from(await input.arrayBuffer())
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const storageKey = `resources/${randomUUID()}/${originalName}`
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

  async remove(id: number) {
    const file = await fileRepository.findById(id)
    if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'El archivo solicitado no existe.')
    if (Object.values(file._count).some(count => count > 0)) throw new AppError(409, 'FILE_IN_USE', 'El archivo está asociado a contenido y no puede eliminarse.')
    const removed = await fileRepository.remove(id)
    await unlink(path.resolve(storageRoot(), removed.storageKey)).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error })
    return responseFile(removed)
  }
}
