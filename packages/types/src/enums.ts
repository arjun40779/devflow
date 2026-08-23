/**
 * Canonical enum values for the domain. These `as const` arrays are the single
 * source of truth; `@devflow/validation` builds Zod schemas from them and the
 * union types below are derived from the same arrays.
 */

export const ROLES = ['owner', 'admin', 'developer', 'reviewer', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const CONNECTION_STATUSES = ['connected', 'error', 'revoked'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const WORK_ITEM_STATUSES = [
  'backlog',
  'ready',
  'in_progress',
  'in_review',
  'approved',
  'merged',
  'deployed',
  'done',
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INTEGRATION_CATEGORIES = [
  'source-control',
  'project-management',
  'chat',
  'calendar',
] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];
