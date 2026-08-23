import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { schema } from '@devflow/database';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../../../app';
import { createUser } from '../../../identity/dal/users.dal';
import {
  createOrganization,
  deleteOrganizationById,
} from '../../../organizations/dal/organizations.dal';
import {
  createProject,
  deleteProject,
  findProjectById,
  listProjects,
  updateProject,
} from '../projects.dal';
import type { OrganizationId, UserId, WorkflowConfig } from '@devflow/types';

const workflowConfig: WorkflowConfig = {
  version: 1,
  branchNamingPattern: '{type}/{ticketKey}-{slug}',
  prTitleTemplate: '[{ticketKey}] {title}',
  reviewPolicy: { requiredApprovals: 1, requireAiReview: true },
};

describe('projects dal', () => {
  let app: FastifyInstance;
  let organizationId: OrganizationId;
  let otherOrganizationId: OrganizationId;
  let userId: UserId;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const githubId = `projects-dal-test-${crypto.randomUUID()}`;
    const user = await createUser(app.db, { githubId, email: `${githubId}@example.test` });
    userId = user.id as UserId;

    const org = await app.db.transaction((tx) =>
      createOrganization(tx, {
        name: 'Projects DAL Org',
        slug: `projects-dal-${crypto.randomUUID()}`,
      }),
    );
    organizationId = org.id as OrganizationId;

    const otherOrg = await app.db.transaction((tx) =>
      createOrganization(tx, {
        name: 'Other Org',
        slug: `projects-dal-other-${crypto.randomUUID()}`,
      }),
    );
    otherOrganizationId = otherOrg.id as OrganizationId;
  });

  afterAll(async () => {
    await deleteOrganizationById(app.db, organizationId);
    await deleteOrganizationById(app.db, otherOrganizationId);
    await app.db.delete(schema.users).where(eq(schema.users.id, userId));
    await app.close();
  });

  it('creates a project and finds it by (org, id)', async () => {
    const project = await app.db.transaction((tx) =>
      createProject(tx, {
        organizationId,
        name: 'API Gateway',
        slug: 'api-gateway',
        workflowConfig,
      }),
    );

    const found = await findProjectById(app.db, organizationId, project.id);
    expect(found?.name).toBe('API Gateway');

    const projects = await listProjects(app.db, organizationId);
    expect(projects.some((p) => p.id === project.id)).toBe(true);
  });

  it('does not find a project scoped to a different org', async () => {
    const project = await app.db.transaction((tx) =>
      createProject(tx, { organizationId, name: 'Cross Org', slug: 'cross-org', workflowConfig }),
    );

    const found = await findProjectById(app.db, otherOrganizationId, project.id);
    expect(found).toBeUndefined();
  });

  it('updates a project', async () => {
    const project = await app.db.transaction((tx) =>
      createProject(tx, { organizationId, name: 'Before', slug: 'before-proj', workflowConfig }),
    );

    const updated = await app.db.transaction((tx) =>
      updateProject(tx, organizationId, project.id, { name: 'After' }),
    );
    expect(updated.name).toBe('After');
    expect(updated.slug).toBe('before-proj');
  });

  it('deletes a project', async () => {
    const project = await app.db.transaction((tx) =>
      createProject(tx, {
        organizationId,
        name: 'Delete Me',
        slug: 'delete-me-proj',
        workflowConfig,
      }),
    );

    await app.db.transaction((tx) => deleteProject(tx, organizationId, project.id));

    const found = await findProjectById(app.db, organizationId, project.id);
    expect(found).toBeUndefined();
  });
});
