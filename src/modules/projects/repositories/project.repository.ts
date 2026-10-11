import { Prisma, ProjectStatus, ProjectType } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export type PublicProjectListOptions = {
	search?: string
	year?: number
	type?: ProjectType
	sortBy: 'createdAt' | 'title' | 'author'
	sortOrder: Prisma.SortOrder
	skip: number
	take: number
}

export type AdminProjectFilters = { q?: string; status?: ProjectStatus; type?: ProjectType; page: number; pageSize: number }
const adminWhere = ({ q, status, type }: AdminProjectFilters): Prisma.ProjectWhereInput => ({
  ...(status ? { status } : {}), ...(type ? { type } : {}),
  ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { author: { name: { contains: q, mode: 'insensitive' } } }] } : {})
})
const adminSelect = {
  id: true, authorId: true, reviewerId: true, coverImageId: true, documentFileId: true,
  title: true, slug: true, description: true, repositoryUrl: true, liveUrl: true, type: true, status: true,
  rejectionReason: true, reviewedAt: true, createdAt: true, updatedAt: true,
  author: { select: { id: true, name: true, email: true } }, reviewer: { select: { id: true, name: true } },
  documentFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } }
} satisfies Prisma.ProjectSelect

export class ProjectRepository {
	static async findPublicPage(options: PublicProjectListOptions) {
		const where: Prisma.ProjectWhereInput = { status: ProjectStatus.APROBADO }

		if (options.year) {
			where.createdAt = {
				gte: new Date(Date.UTC(options.year, 0, 1)),
				lt: new Date(Date.UTC(options.year + 1, 0, 1)),
			}
		}

		if (options.type) where.type = options.type

		if (options.search) {
			where.OR = [
				{ title: { contains: options.search, mode: 'insensitive' } },
				{ author: { name: { contains: options.search, mode: 'insensitive' } } },
			]
		}

		const orderBy: Prisma.ProjectOrderByWithRelationInput[] = options.sortBy === 'author'
			? [{ author: { name: options.sortOrder } }, { id: 'desc' }]
			: [{ [options.sortBy]: options.sortOrder }, { id: 'desc' }]

		return Promise.all([
			prisma.project.findMany({
				where,
				skip: options.skip,
				take: options.take,
				orderBy,
				select: {
					id: true,
					title: true,
					slug: true,
					description: true,
					repositoryUrl: true,
					liveUrl: true,
					type: true,
					status: true,
					createdAt: true,
					author: { select: { id: true, name: true } },
					coverImage: { select: { id: true, originalName: true, storageKey: true } },
				},
			}),
			prisma.project.count({ where }),
		])
	}

	static async findAll() {
		return prisma.project.findMany({ select: adminSelect, orderBy: {createdAt: 'desc' } });
	}

	static async findAdminPage(filters: AdminProjectFilters) {
		const where = adminWhere(filters)
		const [items, total] = await Promise.all([
			prisma.project.findMany({ where, select: adminSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
			prisma.project.count({ where })
		])
		return { items: items.map(item => ({ ...item, documentFile: item.documentFile ? { ...item.documentFile, sizeBytes: Number(item.documentFile.sizeBytes) } : null })), total }
	}

	static async findPublicById(id: number) {
		return prisma.project.findFirst({
			where: { id, status: ProjectStatus.APROBADO },
			select: {
				id: true, title: true, slug: true, description: true,
				repositoryUrl: true, liveUrl: true, type: true, status: true, createdAt: true,
				author: { select: { id: true, name: true } },
				coverImage: { select: { id: true, originalName: true, storageKey: true } },
			},
		})
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
		const project = await prisma.project.findUnique({ where: { id }, select: adminSelect })
		return project ? { ...project, documentFile: project.documentFile ? { ...project.documentFile, sizeBytes: Number(project.documentFile.sizeBytes) } : null } : null
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
