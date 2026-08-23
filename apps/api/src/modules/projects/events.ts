import { z } from 'zod';
import { defineEvent } from '@devflow/events';

export const ProjectCreated = defineEvent({
  type: 'project.created',
  schemaVersion: 1,
  schema: z.object({ name: z.string(), slug: z.string() }),
});

export const ProjectWorkflowConfigUpdated = defineEvent({
  type: 'project.workflow_config_updated',
  schemaVersion: 1,
  schema: z.object({ version: z.literal(1) }),
});
