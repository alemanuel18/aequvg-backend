import {t} from 'elysia';

export const ProjectStatusEnum = t.Union([
	t.Literal('EN_REVISION'),
	t.Literal('APROBADO'),
	t.Literal('NO_APROBADO'),
]);

export const CreateProjectDTO = t.Object({
	title: t.String({minLength: 3, maxLength: 220}),
	slug: t.String({minLength: 3, maxLength: 220}),
	description: t.String({minLength: 10}),
	repositoryUrl: t.Optional(t.String({format:'uri'})),
	liveUrl: t.Optional(t.String({format: 'uri'})),
	coverImageId: t.Optional(t.Numeric()),
})

export const UpdateProjectDTO = t.Partial(CreateProjectDTO);

export const ReviewProjectDTO = t.Object({
	status: ProjectStatusEnum,
	rejectionReason: t.Optional(t.String()),
	reviewerId: t.Numeric(),
})

export const projectListQuery = t.Object({
	search: t.Optional(t.String({ maxLength: 160 })),
	year: t.Optional(t.Numeric({ minimum: 1970, maximum: 9999 })),
	type: t.Optional(ProjectStatusEnum),
	sortBy: t.Optional(t.Union([t.Literal('createdAt'), t.Literal('title'), t.Literal('author')])),
	sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
	page: t.Optional(t.Numeric({ minimum: 1 })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
})
