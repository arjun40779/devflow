import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import { relayOutboxOnce, type EventRoute } from '@devflow/events';
import { runWithCorrelationId } from '@devflow/observability';
import { createSystemPingJob } from '../modules/system/jobs/system-ping.job';
import { createSystemPingRoute } from '../modules/system/routing';

const RELAY_INTERVAL_MS = 2_000;

/**
 * Starts the outbox relay loop and the queue worker(s) that consume the jobs
 * it enqueues (§10). Wave 0 runs the worker in-process; it moves to a
 * dedicated `apps/worker` process once there's enough job volume to warrant it.
 */
export const outboxRelayPlugin = fp(async (app) => {
  const systemPingJob = createSystemPingJob(app.log);
  const routes: EventRoute[] = [createSystemPingRoute(systemPingJob)];

  const worker = systemPingJob.createWorker(app.redis, {
    runInContext: (correlationId, fn) => runWithCorrelationId(correlationId, fn),
  });

  const relayId = `api-${randomUUID()}`;
  const timer = setInterval(() => {
    relayOutboxOnce({ db: app.db, routes, relayId }).catch((error: unknown) => {
      app.log.error({ err: error }, 'outbox relay cycle failed');
    });
  }, RELAY_INTERVAL_MS);
  timer.unref();

  app.addHook('onClose', async () => {
    clearInterval(timer);
    await worker.close();
  });
});
