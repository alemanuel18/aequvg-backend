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

export const projectDocumentMetadata = t.Nullable(t.Object({
	id: t.Integer(),
	originalName: t.String(),
	mimeType: t.String(),
	sizeBytes: t.Integer({ minimum: 1 }),
}))

export const projectFileUploadResponse = t.Object({
	id: t.Integer(),
	uploadedById: t.Integer(),
	originalName: t.String(),
	mimeType: t.String(),
	sizeBytes: t.Integer({ minimum: 1 }),
	sha256: t.String({ minLength: 64, maxLength: 64 }),
	createdAt: t.Date(),
})

export const CreateProjectDTO = t.Object({
	title: t.String({minLength: 3, maxLength: 220}),
	slug: t.String({minLength: 3, maxLength: 220}),
	description: t.String({minLength: 10}),
	type: ProjectTypeEnum,
	repositoryUrl: t.Optional(t.String({ format: 'uri', maxLength: 2048 })),
	liveUrl: t.Optional(t.String({ format: 'uri', maxLength: 2048 })),
	coverImageId: t.Optional(t.Integer({ minimum: 1 })),
	documentFileId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
})

export const UpdateProjectDTO = t.Partial(CreateProjectDTO);

export const AdminCreateProjectDTO = CreateProjectDTO;

export const ReviewProjectDTO = t.Object({
	status: ProjectStatusEnum,
	rejectionReason: t.Optional(t.String()),
})

export const projectListQuery = t.Object({
	search: t.Optional(t.String({ maxLength: 160, description: 'Texto parcial a buscar en el título o nombre del autor.' })),
	year: t.Optional(t.Numeric({ minimum: 1970, maximum: 9999, description: 'Año UTC de creación del proyecto.' })),
	type: t.Optional(t.Union([t.Literal('TESIS', { description: 'Trabajo de tesis.' }), t.Literal('PROYECTO', { description: 'Proyecto académico o de investigación.' })], { description: 'Categoría del proyecto.' })),
	sortBy: t.Optional(t.Union([t.Literal('createdAt'), t.Literal('title'), t.Literal('author')], { description: 'Campo de ordenamiento.' })),
	sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')], { description: 'Dirección del ordenamiento.' })),
	page: t.Optional(t.Numeric({ minimum: 1, description: 'Página solicitada; el valor predeterminado es 1.' })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, description: 'Elementos por página; el valor predeterminado es 12.' })),
})

export const projectAdminListQuery = t.Object({
	q: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
	status: t.Optional(ProjectStatusEnum),
	type: t.Optional(ProjectTypeEnum),
	page: t.Optional(t.Integer({ minimum: 1 })),
	pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
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
	documentFile: projectDocumentMetadata,
	})

	export const projectListResponse = t.Object({
		items: t.Array(publicProjectResponse),
	pagination: t.Object({ page: t.Integer({ description: 'Página actual.' }), pageSize: t.Integer({ description: 'Elementos solicitados por página.' }), total: t.Integer({ description: 'Total de resultados encontrados.' }), totalPages: t.Integer({ description: 'Total de páginas disponibles.' }) })
		})

	export const adminProjectResponse = t.Object({
		id: t.Integer(),
		authorId: t.Integer(), 
		reviewerId: t.Nullable(t.Integer()), 
	coverImageId: t.Nullable(t.Integer()),
	documentFileId: t.Nullable(t.Integer()),
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
	author: t.Object({ id: t.Integer(), name: t.String(), email: t.String() }),
	reviewer: t.Nullable(t.Object({ id: t.Integer(), name: t.String() })),
	documentFile: t.Nullable(t.Object({ id: t.Integer(), originalName: t.String(), mimeType: t.String(), sizeBytes: t.Integer() })),
})

export const projectAdminListResponse = t.Object({ items: t.Array(adminProjectResponse), pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer() }) })
	export const projectMessageResponse = t.Object({ message: t.String() })
