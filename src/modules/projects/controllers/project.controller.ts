import {Elysia, t} from 'elysia';
import { ProjectService } from '../services/project.service';
import { CreateProjectDTO, UpdateProjectDTO, ReviewProjectDTO } from '../dtos/project.dto';
import { ProjectStatus } from '@prisma/client';

export const projectController =  new Elysia({prefix: '/projects'})

	.get('/', async () => {
		return await ProjectService.getAllProjects();
	})

	.get('/aproved', async () => {
		return await ProjectService.getAprovedProjects();
	})

	.get('/:id', async ({ params: { id }, set }) => {
		try {
			return await ProjectService.getProjectById(Number(id));
		} catch (err: any) {
			if (err.message === 'PROYECTO_NO_ENCONTRADO') {
				set.status = 404;
				return {message: 'El proyecto no existe'};
			}

			set.status = 500;
			return {message: 'Error interno del servidor'};
		}
	}, {
		params: t.Object({id: t.Numeric()})
	})

	.post('/', async ({body, set}) => {
		const authorIdMock = 1; //Cambiar luego por el JWT
		const newProject = await ProjectService.createProject(body, authorIdMock);
		set.status = 201;
		return newProject;
	}, {
		body: CreateProjectDTO
	})

	.put('/:id', async ({params: { id }, body, set}) => {
		try {
			return await ProjectService.updateProject(Number(id), body);
		} catch (err: any) {
			if (err.message === 'PROYECTO_NO_ENCONTRADO') {
				set.status = 404;
				return {message: 'El proyecto no existe'}
			}
			set.status = 500;
			return {message: 'Error interno del servidor'}
		}
	}, {
		params: t.Object({id: t.Numeric()}),
		body: UpdateProjectDTO
	})

  .patch('/:id/review', async ({ params: { id }, body, set }) => {
    try {
      return await ProjectService.reviewProject(
        Number(id),
        body.status as ProjectStatus,
        body.reviewerId,
        body.rejectionReason
      );
    } catch (err: any) {
      if (err.message === 'PROYECTO_NO_ENCONTRADO') {
        set.status = 404;
        return { message: 'El proyecto no existe' };
      }
      
      set.status = 400;
      return { message: err.message || 'Error al procesar la solicitud' };
    }
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: ReviewProjectDTO
  })

  .delete('/:id', async ({ params: { id }, set }) => {
    try {
      await ProjectService.deleteProject(Number(id));
      return { message: 'Proyecto eliminado correctamente' };
    } catch (err: any) {
      if (err.message === 'PROYECTO_NO_ENCONTRADO') {
        set.status = 404;
        return { message: 'El proyecto no existe' };
      }

      set.status = 500;
      return { message: 'Error interno al eliminar el proyecto' };
    }
  }, {
    params: t.Object({ id: t.Numeric() })
  });
