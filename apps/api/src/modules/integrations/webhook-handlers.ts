import type { WebhookHandler } from '@devflow/integrations-core';

/**
 * One entry per adapter, added as each is implemented (GitHub first, Wave 2
 * design doc build sequence step 4) — empty until then. Shared by the
 * generic webhook route and the webhook relay plugin so both agree on which
 * providers are live.
 */
export const webhookHandlers: Record<string, WebhookHandler> = {};

/**
 * The header `event_type` is extracted from at ingestion time, and the
 * header name the relay reconstructs when replaying a stored row through
 * the same `normalize()` contract (design doc §4.1).
 */
export const webhookEventTypeHeaders: Record<string, string> = {
  github: 'x-github-event',
  plane: 'x-plane-event',
};

export function getEventTypeHeader(provider: string): string {
  return webhookEventTypeHeaders[provider] ?? 'x-event-type';
}
