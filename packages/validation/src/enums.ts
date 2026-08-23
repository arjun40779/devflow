import { z } from 'zod';
import {
  ROLES,
  WORK_ITEM_STATUSES,
  PRIORITIES,
  INTEGRATION_CATEGORIES,
  INVITATION_STATUSES,
} from '@devflow/types';

/** Zod schemas built from the canonical enum arrays in `@devflow/types`. */

export const roleSchema = z.enum(ROLES);
export const workItemStatusSchema = z.enum(WORK_ITEM_STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const integrationCategorySchema = z.enum(INTEGRATION_CATEGORIES);
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);
