import type { Prisma, ThesisAuthorRole } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'

export type ThesisContributorInput = { personId?: number; name?: string }
export type ResolvedThesisContributor = { personId: number; name: string; role: ThesisAuthorRole; authorOrder: number }
const authorNameCollator = new Intl.Collator('es', { sensitivity: 'base' })

export const resolveThesisContributors = async (
  tx: Prisma.TransactionClient,
  inputs: ThesisContributorInput[]
): Promise<ResolvedThesisContributor[]> => {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 50) {
    throw new AppError(422, 'THESIS_CONTRIBUTORS_REQUIRED', 'Agrega un autor principal y sus coautores.')
  }

  const selectedPersonIds = new Set<number>()
  const resolved: Array<{ personId: number; name: string }> = []

  for (const input of inputs) {
    const hasPersonId = input.personId !== undefined
    const hasName = input.name !== undefined
    if (hasPersonId === hasName) {
      throw new AppError(422, 'INVALID_THESIS_CONTRIBUTOR', 'Selecciona una persona existente o escribe el nombre de una persona nueva.')
    }

    let person: { id: number; name: string } | null
    if (hasPersonId) {
      if (selectedPersonIds.has(input.personId!)) {
        throw new AppError(422, 'DUPLICATE_THESIS_AUTHOR', 'La misma persona no puede aparecer dos veces en una tesis.')
      }
      selectedPersonIds.add(input.personId!)
      person = await tx.authorPerson.findUnique({ where: { id: input.personId }, select: { id: true, name: true } })
      if (!person) throw new AppError(422, 'THESIS_AUTHOR_NOT_FOUND', 'No encontramos el registro del autor seleccionado.')
    } else {
      const name = input.name!.trim()
      if (!name || name.length > 300) {
        throw new AppError(422, 'INVALID_THESIS_CONTRIBUTOR', 'Escribe un nombre de autor de hasta 300 caracteres.')
      }
      person = await tx.authorPerson.create({ data: { name }, select: { id: true, name: true } })
    }

    resolved.push({ personId: person.id, name: person.name })
  }

  const principal = resolved[0]!
  const coauthors = resolved.slice(1).sort((a, b) =>
    authorNameCollator.compare(a.name, b.name) || a.personId - b.personId
  )
  return [principal, ...coauthors].map(({ personId, name }, index) => ({
    personId,
    name,
    role: index === 0 ? 'PRINCIPAL' : 'COAUTOR',
    authorOrder: index + 1
  }))
}
