import { ProjectRepository } from "../repositories/project.repository";
import { ProjectStatus } from "@prisma/client";

export class ProjectService {
	static async getAllProjects(){
		return await ProjectRepository.findAll();
	}

	static async getAprovedProjects(){
		return await ProjectRepository.findApprovedOnly();
	}

	static async getProjectById(id: number){
		const project = await ProjectRepository.findById(id);
		if (!project) throw new Error('PROYECTO_NO_ENCONTRADO');
		return project;
	}

	static async createProject(data: any, authorId: number) {
		const existingSlug = await ProjectRepository.findBySlug(data.slug);
		if (existingSlug) throw new Error('SLUG_DUPLICADO');

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
