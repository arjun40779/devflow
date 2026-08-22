import { type FastifyInstance } from 'fastify';
import { healthRouter } from './health/router';
import { systemRouter } from './system/router';

/**
 * Registers all v1 routers. The parent mounts this under /api/v1
 * (see routes/index.ts). Add new modules' v1 routers here.
 */
export async function v1Routes(app: FastifyInstance): Promise<void> {
  await app.register(healthRouter);
  await app.register(systemRouter);
}
