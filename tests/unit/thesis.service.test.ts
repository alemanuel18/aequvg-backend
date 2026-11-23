import { describe, expect, it } from 'vitest'
import { normalizeThesisRepositoryUrl, validateThesisRequiredFields } from '../../src/modules/theses/services/thesis.service'

describe('reglas de campos obligatorios de tesis (S6-04)', () => {
	it('recorta espacios y normaliza esquema y host, conservando mayúsculas de ruta', () => {
		expect(normalizeThesisRepositoryUrl('  HTTPS://REPOSITORIO.UVG.EDU.GT/Handle/CaseSensitive  '))
			.toBe('https://repositorio.uvg.edu.gt/Handle/CaseSensitive')
	})

	it('acepta solo HTTPS', () => {
		expect(() => normalizeThesisRepositoryUrl('http://repositorio.uvg.edu.gt/tesis'))
			.toThrow(expect.objectContaining({ status: 422, code: 'INVALID_THESIS_URL' }))
		expect(() => normalizeThesisRepositoryUrl('ftp://repositorio.uvg.edu.gt/tesis'))
			.toThrow(expect.objectContaining({ status: 422, code: 'INVALID_THESIS_URL' }))
		expect(() => normalizeThesisRepositoryUrl('   '))
			.toThrow(expect.objectContaining({ status: 422, code: 'INVALID_THESIS_URL' }))
	})

	it('exige título, autor, año y resumen', () => {
		expect(() => validateThesisRequiredFields({ title: '  ' }))
			.toThrow(expect.objectContaining({ status: 422, code: 'THESIS_TITLE_REQUIRED' }))
		expect(() => validateThesisRequiredFields({ author: '   ' }))
			.toThrow(expect.objectContaining({ status: 422, code: 'THESIS_AUTHOR_REQUIRED' }))
		expect(() => validateThesisRequiredFields({ publicationYear: null }))
			.toThrow(expect.objectContaining({ status: 422, code: 'THESIS_PUBLICATION_YEAR_REQUIRED' }))
		expect(() => validateThesisRequiredFields({ summary: '   ' }))
			.toThrow(expect.objectContaining({ status: 422, code: 'THESIS_SUMMARY_REQUIRED' }))
		expect(() => validateThesisRequiredFields({ title: 'Tesis aprobada', author: 'Ana López', publicationYear: 2026, summary: 'Resumen de tesis.' })).not.toThrow()
	})
})
