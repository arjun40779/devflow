import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { schema } from '@devflow/database';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../../../app';
import { createUser } from '../../../identity/dal/users.dal';
import { createOrganization } from '../../../organizations/service/organizations.service';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  ProjectNotFoundError,
  updateProject,
} from '../projects.service';
import type { OrgContext } from '../../../access/org-context';
import type { OrganizationId, ProjectId, UserId } from '@devflow/types';

async function makeUser(app: FastifyInstance, label: string): Promise<UserId> {
  const githubId = `${label}-${crypto.randomUUID()}`;
  const user = await createUser(app.db, { githubId, email: `${githubId}@example.test` });
  return user.id as UserId;
}

describe('projects service', () => {
  let app: FastifyInstance;
  const createdUserIds: UserId[] = [];
  const createdOrgIds: OrganizationId[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    for (const id of createdOrgIds.splice(0)) {
      await app.db.delete(schema.organizations).where(eq(schema.organizations.id, id));
    }
  });

  afterAll(async () => {
    for (const id of createdUserIds.splice(0)) {
      await app.db.delete(schema.users).where(eq(schema.users.id, id));
    }
    await app.close();
  });

  async function makeOrgCtx(label: string): Promise<OrgContext> {
    const userId = await makeUser(app, label);
    createdUserIds.push(userId);
    const org = await createOrganization(app.db, {
      name: `${label} Org`,
      userId,
      correlationId: crypto.randomUUID(),
    });
    createdOrgIds.push(org.id as OrganizationId);
    return { organizationId: org.id as OrganizationId, userId, role: 'owner' };
  }

  it('creates a project, deriving the slug and applying workflow-config defaults', async () => {
    const ctx = await makeOrgCtx('create-project');

    const project = await createProject(app.db, ctx, {
      name: 'Payments Service',
      correlationId: crypto.randomUUID(),
    });

    expect(project.slug).toBe('payments-service');
    expect(project.workflowConfig).toEqual({
      version: 1,
      branchNamingPattern: '{type}/{ticketKey}-{slug}',
      prTitleTemplate: '[{ticketKey}] {title}',
      reviewPolicy: { requiredApprovals: 1, requireAiReview: true },
    });

    const projects = await listProjects(app.db, ctx);
    expect(projects.some((p) => p.id === project.id)).toBe(true);
  });

  it('uses a client-supplied slug as-is', async () => {
    const ctx = await makeOrgCtx('create-project-slug');
    const project = await createProject(app.db, ctx, {
      name: 'Custom',
      slug: 'my-custom-slug',
      correlationId: crypto.randomUUID(),
    });
    expect(project.slug).toBe('my-custom-slug');
  });

  it('applies a partial workflow-config override on top of defaults', async () => {
    const ctx = await makeOrgCtx('create-project-partial-config');
    const project = await createProject(app.db, ctx, {
      name: 'Partial Config',
      workflowConfig: { reviewPolicy: { requiredApprovals: 2 } },
      correlationId: crypto.randomUUID(),
    });

    expect(project.workflowConfig.reviewPolicy).toEqual({
      requiredApprovals: 2,
      requireAiReview: true,
    });
    expect(project.workflowConfig.branchNamingPattern).toBe('{type}/{ticketKey}-{slug}');
  });

  it('gets a project and rejects an unknown id', async () => {
    const ctx = await makeOrgCtx('get-project');
    const project = await createProject(app.db, ctx, {
      name: 'Findable',
      correlationId: crypto.randomUUID(),
    });

    const found = await getProject(app.db, ctx, project.id as ProjectId);
    expect(found.name).toBe('Findable');

    await expect(getProject(app.db, ctx, crypto.randomUUID() as ProjectId)).rejects.toThrow(
      ProjectNotFoundError,
    );
  });

  it('updates a project without re-deriving the slug and merges a partial workflow-config patch', async () => {
    const ctx = await makeOrgCtx('update-project');
    const project = await createProject(app.db, ctx, {
      name: 'Old Name',
      workflowConfig: { reviewPolicy: { requiredApprovals: 1 } },
      correlationId: crypto.randomUUID(),
    });

    const updated = await updateProject(app.db, ctx, project.id as ProjectId, {
      name: 'New Name',
      workflowConfig: { reviewPolicy: { requiredApprovals: 3 } },
      correlationId: crypto.randomUUID(),
    });

    expect(updated.name).toBe('New Name');
    expect(updated.slug).toBe(project.slug);
    expect(updated.workflowConfig.reviewPolicy.requiredApprovals).toBe(3);
    expect(updated.workflowConfig.reviewPolicy.requireAiReview).toBe(true);
  });

  it('rejects updating or deleting a project that belongs to a different organization', async () => {
    const ctxA = await makeOrgCtx('cross-org-a');
    const ctxB = await makeOrgCtx('cross-org-b');
    const project = await createProject(app.db, ctxA, {
      name: 'Org A Project',
      correlationId: crypto.randomUUID(),
    });

    await expect(
      updateProject(app.db, ctxB, project.id as ProjectId, {
        name: 'Hijacked',
        correlationId: crypto.randomUUID(),
      }),
    ).rejects.toThrow(ProjectNotFoundError);
    await expect(deleteProject(app.db, ctxB, project.id as ProjectId)).rejects.toThrow(
      ProjectNotFoundError,
    );
  });

  it('deletes a project', async () => {
    const ctx = await makeOrgCtx('delete-project');
    const project = await createProject(app.db, ctx, {
      name: 'To Delete',
      correlationId: crypto.randomUUID(),
    });

    await deleteProject(app.db, ctx, project.id as ProjectId);

    await expect(getProject(app.db, ctx, project.id as ProjectId)).rejects.toThrow(
      ProjectNotFoundError,
    );
  });
});
