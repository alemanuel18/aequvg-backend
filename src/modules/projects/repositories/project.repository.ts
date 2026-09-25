import { PrismaClient, ProjectStatus } from "@prisma/client";

const prisma = new PrismaClient()

export class ProjectRepository {
	static async findAll() {
		return await prisma.project.findMany({
			include: {
				author: {select: {id: true, name: true, email: true}},
				reviewer: {select: {id: true, name: true}},
				coverImage: {select: {id: true, originalName: true, storageKey: true}},
			},
			orderBy: {createdAt: 'desc' },
		});
	}

	static async findApprovedOnly(){
		return await prisma.project.findMany({
			where: {status: ProjectStatus.APROBADO},
			include: {
				author: { select: {name: true}},
				coverImage:{ select : {storageKey: true}},
			},
			orderBy: {createdAt: 'desc'},
		});
	}

	static async findById(id: number) {
		return await prisma.project.findUnique({
			where: {id},
			include: {
				author: {select: {id: true, name: true, email: true}},
				reviewer: {select: {id: true, name: true}},
				coverImage: true,
			},
	
		});
	}

	static async findBySlug(slug: string){
		return await prisma.project.findUnique({where: {slug}})
	}

	static async create(data: any, authorId: number){
		return await prisma.project.create({
		data: {
			...data,
			authorId,
			status: ProjectStatus.EN_REVISION
		}
		})
	}

	static async update(id: number, data: any) {
		return await prisma.project.update({
			where: {id},
			data,
		});
	}
	
	static async updateStatus(id: number, status: ProjectStatus, reviewerId: number, rejectionReason?: string) {
		return await prisma.project.update({
			where: { id },
			data: {
			status,
        		reviewerId,
        		rejectionReason: status === ProjectStatus.NO_APROBADO ? rejectionReason : null,
        		reviewedAt: new Date(),
      		},
    		});
  	}

	static async delete(id: number) {
		return await prisma.project.delete({where: {id}});
	}
}
