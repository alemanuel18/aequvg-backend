import { AppError } from '../../../shared/errors/app-error'

export const normalizeThesisRepositoryUrl = (value: string) => {
	let parsed: URL
	try { parsed = new URL(value.trim()) } catch { throw new AppError(422, 'INVALID_THESIS_URL', 'Ingresa la URL del repositorio con https://.') }
	if (parsed.protocol !== 'https:' || !parsed.hostname) {
		throw new AppError(422, 'INVALID_THESIS_URL', 'Ingresa la URL del repositorio con https://.')
	}
	return parsed.toString()
}

export const validateThesisRequiredFields = (values: {
	title?: string | null
	author?: string | null
	publicationYear?: number | null
	summary?: string | null
}) => {
	if (values.title !== undefined && (!values.title || values.title.trim().length < 3)) {
		throw new AppError(422, 'THESIS_TITLE_REQUIRED', 'Escribe un título de al menos 3 caracteres.')
	}
	if (values.author !== undefined && (!values.author || !values.author.trim())) {
		throw new AppError(422, 'THESIS_AUTHOR_REQUIRED', 'Escribe el autor de la tesis.')
	}
	if (values.publicationYear !== undefined && (values.publicationYear === null || !Number.isInteger(values.publicationYear) || values.publicationYear < 1900 || values.publicationYear > 9999)) {
		throw new AppError(422, 'THESIS_PUBLICATION_YEAR_REQUIRED', 'Ingresa un año de publicación válido.')
	}
	if (values.summary !== undefined && (!values.summary || !values.summary.trim())) {
		throw new AppError(422, 'THESIS_SUMMARY_REQUIRED', 'Escribe el resumen de la tesis.')
	}
}
