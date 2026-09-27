import { ProjectRepository } from "../repositories/project.repository";
import { ProjectStatus, ProjectType } from "@prisma/client";
import { cleanText } from '../../../shared/utils/text'
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

	static async getAllProjects(){
		return await ProjectRepository.findAll();
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
		const existingSlug = await ProjectRepository.findBySlug(data.slug);
		if (existingSlug) throw new AppError(409, 'PROJECT_SLUG_EXISTS', 'Ya existe un proyecto con ese slug.')

		return await ProjectRepository.create(data, authorId);
	}

	static async updateProject(id: number, data: any) {
		await this.getProjectById(id);
		return await ProjectRepository.update(id, data);
	}

	static async reviewProject(id: number, status: ProjectStatus, reviewerId: number, rejectionReason?: string) {
		await this.getProjectById(id);
		return await ProjectRepository.updateStatus(id, status, reviewerId, rejectionReason);
	}

	static async deleteProject(id: number){
		await this.getProjectById(id);
		return await ProjectRepository.delete(id)
	}
}
