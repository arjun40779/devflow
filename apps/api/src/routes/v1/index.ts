import { type FastifyInstance } from 'fastify';
import { healthRouter } from './health/router';
import { systemRouter } from './system/router';
import { authRouter } from './auth/router';
import { organizationsRouter } from './organizations/router';
import { invitationsRouter } from './invitations/router';

/**
 * Registers all v1 routers. The parent mounts this under /api/v1
 * (see routes/index.ts). Add new modules' v1 routers here.
 */
export async function v1Routes(app: FastifyInstance): Promise<void> {
  await app.register(healthRouter);
  await app.register(systemRouter);
  await app.register(authRouter);
  await app.register(organizationsRouter);
  await app.register(invitationsRouter);
}
