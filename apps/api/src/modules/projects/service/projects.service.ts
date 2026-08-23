import type { Database } from '@devflow/database';
import { publishOutbox } from '@devflow/events';
import { normalizeSlug, workflowConfigSchema } from '@devflow/validation';
import type { ProjectId, WorkflowConfig } from '@devflow/types';
import type { OrgContext } from '../../access/org-context';
import {
  createProject as createProjectRow,
  deleteProject as deleteProjectRow,
  findProjectById,
  listProjects as listProjectsRows,
  updateProject as updateProjectRow,
  type ProjectRow,
} from '../dal/projects.dal';
import { ProjectCreated, ProjectWorkflowConfigUpdated } from '../events';

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found in this organization');
  }
}

/** Deep-partial input — `Partial<WorkflowConfig>` alone wouldn't allow a partial `reviewPolicy`. */
export interface WorkflowConfigInput {
  branchNamingPattern?: string;
  prTitleTemplate?: string;
  reviewPolicy?: Partial<WorkflowConfig['reviewPolicy']>;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  key?: string | null;
  workflowConfig?: WorkflowConfigInput;
  correlationId: string;
}

/** Client-supplied slugs are used as-is (already validated canonical); an omitted slug is derived from the name (design doc §5). */
export async function createProject(
  db: Database,
  ctx: OrgContext,
  input: CreateProjectInput,
): Promise<ProjectRow> {
  const slug = input.slug ?? normalizeSlug(input.name);
  const workflowConfig = workflowConfigSchema.parse(input.workflowConfig ?? {});

  return db.transaction(async (tx) => {
    const project = await createProjectRow(tx, {
      organizationId: ctx.organizationId,
      name: input.name,
      slug,
      key: input.key,
      workflowConfig,
    });

    const event = ProjectCreated.create({
      organizationId: ctx.organizationId,
      aggregateId: project.id,
      correlationId: input.correlationId,
      payload: { name: project.name, slug: project.slug },
    });
    await publishOutbox(tx, event);

    return project;
  });
}

export function listProjects(db: Database, ctx: OrgContext) {
  return listProjectsRows(db, ctx.organizationId);
}

async function requireProject(
  db: Database,
  ctx: OrgContext,
  projectId: ProjectId,
): Promise<ProjectRow> {
  const project = await findProjectById(db, ctx.organizationId, projectId);
  if (!project) throw new ProjectNotFoundError();
  return project;
}

export function getProject(
  db: Database,
  ctx: OrgContext,
  projectId: ProjectId,
): Promise<ProjectRow> {
  return requireProject(db, ctx, projectId);
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  key?: string | null;
  workflowConfig?: WorkflowConfigInput;
  correlationId: string;
}

/**
 * A supplied slug is used as-is, never re-derived — only `createProject` derives from the
 * name (design doc §5). Publishes `project.workflow_config_updated` only when
 * `workflowConfig` is part of this update.
 */
export async function updateProject(
  db: Database,
  ctx: OrgContext,
  projectId: ProjectId,
  input: UpdateProjectInput,
): Promise<ProjectRow> {
  const existing = await requireProject(db, ctx, projectId);
  const workflowConfig =
    input.workflowConfig !== undefined
      ? workflowConfigSchema.parse({ ...existing.workflowConfig, ...input.workflowConfig })
      : undefined;

  return db.transaction(async (tx) => {
    const project = await updateProjectRow(tx, ctx.organizationId, projectId, {
      name: input.name,
      slug: input.slug,
      key: input.key,
      workflowConfig,
    });

    if (workflowConfig) {
      const event = ProjectWorkflowConfigUpdated.create({
        organizationId: ctx.organizationId,
        aggregateId: projectId,
        correlationId: input.correlationId,
        payload: { version: workflowConfig.version },
      });
      await publishOutbox(tx, event);
    }

    return project;
  });
}

export async function deleteProject(
  db: Database,
  ctx: OrgContext,
  projectId: ProjectId,
): Promise<void> {
  await requireProject(db, ctx, projectId);
  await db.transaction((tx) => deleteProjectRow(tx, ctx.organizationId, projectId));
}
