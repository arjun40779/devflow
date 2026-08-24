import { type FastifyInstance } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireOrgRole } from '../../../modules/access/org-context';
import {
  listConnections,
  disconnect,
  ConnectionNotFoundError,
  type ConnectionRow,
} from '../../../modules/integrations/service/connections.service';
import { integrationCategoryParamsSchema, connectionsListResponseSchema } from './schema';
import { organizationParamsSchema } from '../organizations/schema';

/** Never spreads the row — `encryptedCredentials`/`credentialsIv` must never leave the service layer. */
function toConnectionResponse(row: ConnectionRow) {
  return {
    id: row.id,
    category: row.category,
    provider: row.provider,
    status: row.status,
    externalAccount: row.externalAccount,
    tokenExpiresAt: row.tokenExpiresAt,
    lastSyncedAt: row.lastSyncedAt,
    lastFailureAt: row.lastFailureAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function integrationsRouter(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/organizations/:organizationId/integrations',
    {
      preHandler: requireOrgRole('admin'),
      schema: {
        tags: ['Integrations'],
        summary: 'List integration connections',
        description: 'Lists connections and their health for the organization. Admin/owner only.',
        params: organizationParamsSchema,
        response: { 200: connectionsListResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.orgContext) return reply.forbidden();
      const connections = await listConnections(app.db, request.orgContext);
      return { connections: connections.map(toConnectionResponse) };
    },
  );

  typed.delete(
    '/organizations/:organizationId/integrations/:category',
    {
      preHandler: requireOrgRole('admin'),
      schema: {
        tags: ['Integrations'],
        summary: 'Disconnect an integration',
        description: 'Marks the connection revoked and wipes stored credentials. Admin/owner only.',
        params: integrationCategoryParamsSchema,
      },
    },
    async (request, reply) => {
      if (!request.orgContext) return reply.forbidden();

      try {
        await disconnect(app.db, request.orgContext, request.params.category);
      } catch (error) {
        if (error instanceof ConnectionNotFoundError) return reply.notFound(error.message);
        throw error;
      }

      return reply.code(204).send();
    },
  );
}
