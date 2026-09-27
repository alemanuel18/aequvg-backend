import {t} from 'elysia';

export const ProjectStatusEnum = t.Union([
	t.Literal('EN_REVISION'),
	t.Literal('APROBADO'),
	t.Literal('NO_APROBADO'),
]);

export const ProjectTypeEnum = t.Union([
	t.Literal('TESIS'),
	t.Literal('PROYECTO'),
]);

export const CreateProjectDTO = t.Object({
	title: t.String({minLength: 3, maxLength: 220}),
	slug: t.String({minLength: 3, maxLength: 220}),
	description: t.String({minLength: 10}),
	type: ProjectTypeEnum,
	repositoryUrl: t.Optional(t.String({format:'uri'})),
	liveUrl: t.Optional(t.String({format: 'uri'})),
	coverImageId: t.Optional(t.Numeric()),
})

export const UpdateProjectDTO = t.Partial(CreateProjectDTO);

export const AdminCreateProjectDTO = t.Intersect([CreateProjectDTO, t.Object({
	authorId: t.Integer({ minimum: 1 }),
})]);

export const ReviewProjectDTO = t.Object({
	status: ProjectStatusEnum,
	rejectionReason: t.Optional(t.String()),
	reviewerId: t.Numeric(),
})

export const projectListQuery = t.Object({
	search: t.Optional(t.String({ maxLength: 160 })),
	year: t.Optional(t.Numeric({ minimum: 1970, maximum: 9999 })),
	type: t.Optional(ProjectTypeEnum),
	sortBy: t.Optional(t.Union([t.Literal('createdAt'), t.Literal('title'), t.Literal('author')])),
	sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
	page: t.Optional(t.Numeric({ minimum: 1 })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
})

export const projectIdParams = t.Object({ id: t.Integer({ minimum: 1 }) })

export const projectErrorResponse = t.Object({ 
	error: t.Object({
		code: t.String(),
		message: t.String(),
		details: t.Optional(t.Record(t.String(), t.String())) }) 
	})

export const publicProjectResponse = t.Object({
	id: t.Integer(),
	title: t.String(),
	slug: t.String(),
	description: t.String(),
	repositoryUrl: t.Nullable(t.String()),
	liveUrl: t.Nullable(t.String()), 
	type: ProjectTypeEnum, 
	status: ProjectStatusEnum, 
	createdAt: t.Date(),
	author: t.Object({ id: t.Integer(), name: t.String() }),
	coverImage: t.Nullable(t.Object({ id: t.Integer(), originalName: t.String(), storageKey: t.String() })),
	})

	export const projectListResponse = t.Object({
		items: t.Array(publicProjectResponse),
		pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer(), totalPages: t.Integer() })
		})

	export const adminProjectResponse = t.Object({
		id: t.Integer(),
		authorId: t.Integer(), 
		reviewerId: t.Nullable(t.Integer()), 
		coverImageId: t.Nullable(t.Integer()), 
		title: t.String(), slug: t.String(), 
		description: t.String(), 
		repositoryUrl: t.Nullable(t.String()), 
		liveUrl: t.Nullable(t.String()), 
		type: ProjectTypeEnum, 
		status: ProjectStatusEnum, 
		rejectionReason: t.Nullable(t.String()), 
		reviewedAt: t.Nullable(t.Date()), 
		createdAt: t.Date(), 
		updatedAt: t.Date(),
})
	export const projectMessageResponse = t.Object({ message: t.String() })
