import { ProjectRepository } from "../repositories/project.repository";
import { ProjectStatus, ProjectType } from "@prisma/client";
import { cleanText } from '../../../shared/utils/text'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'

export type ProjectListInput = {
	search?: string
	year?: number
	type?: ProjectType
	sortBy?: 'createdAt' | 'title' | 'author'
	sortOrder?: 'asc' | 'desc'
	page?: number
	pageSize?: number
}

export type AdminProjectListInput = { q?: string; status?: ProjectStatus; type?: ProjectType; page?: number; pageSize?: number }

export const normalizeProjectListQuery = (input: ProjectListInput) => ({
	search: input.search ? cleanText(input.search) || undefined : undefined,
	year: input.year,
	type: input.type,
	sortBy: input.sortBy ?? 'createdAt',
	sortOrder: input.sortOrder ?? 'desc',
	page: input.page ?? 1,
	pageSize: input.pageSize ?? 12,
})

export class ProjectService {
	static async verifyDocument(fileId: number | null | undefined) {
		if (fileId == null) return
		const file = await prisma.file.findUnique({ where: { id: fileId }, select: { mimeType: true } })
		if (!file || file.mimeType !== 'application/pdf') throw new AppError(422, 'INVALID_PROJECT_DOCUMENT', 'El documento debe ser un PDF existente.')
	}
	static async getFilteredProjects(input: ProjectListInput) {
		const query = normalizeProjectListQuery(input)
		const [items, total] = await ProjectRepository.findPublicPage({
			search: query.search,
			year: query.year,
			type: query.type,
			sortBy: query.sortBy,
			sortOrder: query.sortOrder,
			skip: (query.page - 1) * query.pageSize,
			take: query.pageSize,
		})

		return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } }
	}

	static async getPublicProjectById(id: number) {
		const project = await ProjectRepository.findPublicById(id)
		if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'El proyecto no existe.')
		return project
	}

	static async getAllProjects(){
		return await ProjectRepository.findAll();
	}

	static async getAdminProjects(input: AdminProjectListInput) {
		const page = input.page ?? 1, pageSize = input.pageSize ?? 20
		const result = await ProjectRepository.findAdminPage({ q: input.q ? cleanText(input.q) : undefined, status: input.status, type: input.type, page, pageSize })
		return { items: result.items, pagination: { page, pageSize, total: result.total } }
	}

	static async getAprovedProjects(){
		return await ProjectRepository.findApprovedOnly();
	}

	static async getProjectById(id: number){
		const project = await ProjectRepository.findById(id);
		if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'El proyecto no existe.')
		return project;
	}

	static async createProject(data: any, authorId: number) {
		await this.verifyDocument(data.documentFileId)
		const existingSlug = await ProjectRepository.findBySlug(data.slug);
		if (existingSlug) throw new AppError(409, 'PROJECT_SLUG_EXISTS', 'Ya existe un proyecto con ese slug.')

		const created = await ProjectRepository.create(data, authorId);
		return this.getProjectById(created.id)
	}

	static async updateProject(id: number, data: any) {
		await this.getProjectById(id);
		await this.verifyDocument(data.documentFileId)
		await ProjectRepository.update(id, data);
		return this.getProjectById(id)
	}

	static async reviewProject(id: number, status: ProjectStatus, reviewerId: number, rejectionReason?: string) {
		await this.getProjectById(id);
		await ProjectRepository.updateStatus(id, status, reviewerId, rejectionReason);
		return this.getProjectById(id)
	}

	static async deleteProject(id: number){
		await this.getProjectById(id);
		return await ProjectRepository.delete(id)
	}
}
