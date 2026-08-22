import { pgTable, uuid, text, jsonb, timestamp, integer, unique } from 'drizzle-orm/pg-core';

/**
 * Inbound webhook idempotency (§10). A duplicate delivery is a no-op at the
 * database layer via the (provider, provider_delivery_id) unique constraint.
 *
 * `organization_id` is nullable: the webhook route persists the raw event
 * before it can always resolve an organization (e.g. unknown installation,
 * revoked OAuth). It is attached once resolved, and NULL is retained for
 * debugging unrecognized deliveries rather than dropping the row.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(), // 'github' | 'slack' | 'plane' | ...
    providerDeliveryId: text('provider_delivery_id').notNull(),
    organizationId: uuid('organization_id'), // nullable — see note above
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),

    // processing state — processedAt IS NULL is ambiguous on its own
    // (not-yet-processed vs. failed); processingAttempts/lastError disambiguate.
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    processingAttempts: integer('processing_attempts').notNull().default(0),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [unique().on(table.provider, table.providerDeliveryId)],
);
