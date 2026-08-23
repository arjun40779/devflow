import { type FastifyInstance } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ProjectId } from '@devflow/types';
import { requireOrgRole } from '../../../modules/access/org-context';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  ProjectNotFoundError,
  updateProject,
} from '../../../modules/projects/service/projects.service';
import {
  createProjectBodySchema,
  updateProjectBodySchema,
  projectParamsSchema,
  projectResponseSchema,
  projectsListResponseSchema,
} from './schema';
import { organizationParamsSchema } from '../organizations/schema';

export async function projectsRouter(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/organizations/:organizationId/projects',
    {
      preHandler: requireOrgRole('admin'),
      schema: {
        tags: ['Organizations'],
        summary: 'Create a project',
        description: 'Admin/owner only. Applies workflow-config defaults for any omitted fields.',
        params: organizationParamsSchema,
        body: createProjectBodySchema,
        response: { 201: projectResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.orgContext) return reply.forbidden();

      const project = await createProject(app.db, request.orgContext, {
        ...request.body,
        correlationId: request.correlationId,
      });

      reply.code(201);
      return project;
    },
  );

  typed.get(
    '/organizations/:organizationId/projects',
    {
      preHandler: requireOrgRole('viewer'),
      schema: {
        tags: ['Organizations'],
        summary: 'List projects',
        description: 'Any member can read.',
        params: organizationParamsSchema,
        response: { 200: projectsListResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.orgContext) return reply.forbidden();
      const projects = await listProjects(app.db, request.orgContext);
      return { projects };
    },
  );

  typed.get(
    '/organizations/:organizationId/projects/:projectId',
    {
      preHandler: requireOrgRole('viewer'),
      schema: {
        tags: ['Organizations'],
        summary: 'Get a project',
        description: 'Any member can read.',
        params: projectParamsSchema,
        response: { 200: projectResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.orgContext) return reply.forbidden();

      try {
        return await getProject(app.db, request.orgContext, request.params.projectId as ProjectId);
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return reply.notFound(error.message);
        throw error;
      }
    },
  );

  typed.patch(
    '/organizations/:organizationId/projects/:projectId',
    {
      preHandler: requireOrgRole('admin'),
      schema: {
        tags: ['Organizations'],
        summary: 'Update a project',
        description:
          'Admin/owner only. A supplied slug is used as-is (must already be canonical); ' +
          'workflowConfig is a partial patch merged into the existing config.',
        params: projectParamsSchema,
        body: updateProjectBodySchema,
        response: { 200: projectResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.orgContext) return reply.forbidden();

      try {
        return await updateProject(
          app.db,
          request.orgContext,
          request.params.projectId as ProjectId,
          {
            ...request.body,
            correlationId: request.correlationId,
          },
        );
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return reply.notFound(error.message);
        throw error;
      }
    },
  );

  typed.delete(
    '/organizations/:organizationId/projects/:projectId',
    {
      preHandler: requireOrgRole('admin'),
      schema: {
        tags: ['Organizations'],
        summary: 'Delete a project',
        description: 'Admin/owner only.',
        params: projectParamsSchema,
      },
    },
    async (request, reply) => {
      if (!request.orgContext) return reply.forbidden();

      try {
        await deleteProject(app.db, request.orgContext, request.params.projectId as ProjectId);
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return reply.notFound(error.message);
        throw error;
      }

      return reply.code(204).send();
    },
  );
}
