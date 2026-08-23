import { z } from 'zod';
import { slugSchema } from '@devflow/validation';
import { organizationParamsSchema } from '../organizations/schema';

export const projectParamsSchema = organizationParamsSchema.extend({
  projectId: z.string().uuid().describe('Project id.'),
});

const keySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Must be an uppercase code, e.g. ENG')
  .describe('Reserved for future ticket numbering; unused in Wave 1.');

const workflowConfigInputSchema = z
  .object({
    branchNamingPattern: z.string().min(1).optional(),
    prTitleTemplate: z.string().min(1).optional(),
    reviewPolicy: z
      .object({
        requiredApprovals: z.number().int().min(0).optional(),
        requireAiReview: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

export const createProjectBodySchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema
    .optional()
    .describe('Canonical form required if supplied; derived from name otherwise.'),
  key: keySchema.optional(),
  workflowConfig: workflowConfigInputSchema,
});

export const updateProjectBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  key: keySchema.nullable().optional(),
  workflowConfig: workflowConfigInputSchema,
});

export const workflowConfigResponseSchema = z.object({
  version: z.literal(1),
  branchNamingPattern: z.string(),
  prTitleTemplate: z.string(),
  reviewPolicy: z.object({
    requiredApprovals: z.number(),
    requireAiReview: z.boolean(),
  }),
});

export const projectResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  key: z.string().nullable(),
  workflowConfig: workflowConfigResponseSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const projectsListResponseSchema = z.object({
  projects: z.array(projectResponseSchema),
});
