import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './config/env';
import { openapiPlugin } from './plugins/openapi';
import { registerRoutes } from './routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Use Zod as the validation + serialization engine for all routes.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Core plugins.
  await app.register(sensible);
  // CSP disabled so the Scalar docs UI can load its assets.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // API docs (OpenAPI + Scalar).
  await app.register(openapiPlugin);

  // Versioned feature routes (/api/v1, ...).
  await app.register(registerRoutes);

  return app;
}
