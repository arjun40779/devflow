import { schema, type Database, type DatabaseTransaction } from '@devflow/database';
import { and, eq } from 'drizzle-orm';
import type { OrganizationId, WorkflowConfig } from '@devflow/types';

export type ProjectRow = typeof schema.projects.$inferSelect;

export interface CreateProjectInput {
  organizationId: OrganizationId;
  name: string;
  slug: string;
  key?: string | null;
  workflowConfig: WorkflowConfig;
}

export async function createProject(
  tx: DatabaseTransaction,
  input: CreateProjectInput,
): Promise<ProjectRow> {
  const [project] = await tx.insert(schema.projects).values(input).returning();
  if (!project) throw new Error('createProject: insert returned no row');
  return project;
}

export function listProjects(db: Database, organizationId: OrganizationId) {
  return db.query.projects.findMany({ where: eq(schema.projects.organizationId, organizationId) });
}

/** Compound where — a project id from another org is simply not found (design doc §3.4). */
export function findProjectById(db: Database, organizationId: OrganizationId, id: string) {
  return db.query.projects.findFirst({
    where: and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId)),
  });
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  key?: string | null;
  workflowConfig?: WorkflowConfig;
}

export async function updateProject(
  tx: DatabaseTransaction,
  organizationId: OrganizationId,
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectRow> {
  const [project] = await tx
    .update(schema.projects)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId)))
    .returning();
  if (!project) throw new Error('updateProject: update returned no row');
  return project;
}

export async function deleteProject(
  tx: DatabaseTransaction,
  organizationId: OrganizationId,
  id: string,
): Promise<void> {
  await tx
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId)));
}
