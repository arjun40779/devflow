import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { teams } from './teams';
import { users } from './users';

/** Org-scoped indirectly via the team — callers must verify the team's org, never trust a bare teamId. */
export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);
