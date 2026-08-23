import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { schema } from '@devflow/database';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../../../app';
import { createUser } from '../../../../modules/identity/dal/users.dal';
import { createUserSession } from '../../../../modules/identity/service/session.service';
import { createOrganization } from '../../../../modules/organizations/service/organizations.service';
import { inviteMember } from '../../../../modules/organizations/service/invitations.service';
import { SESSION_COOKIE_NAME } from '../../../../plugins/auth';
import type { OrganizationId, UserId } from '@devflow/types';

async function makeAuthedUser(app: FastifyInstance, label: string) {
  const githubId = `route-project-test-${label}-${crypto.randomUUID()}`;
  const user = await createUser(app.db, { githubId, email: `${githubId}@example.test` });
  const { token } = await createUserSession(
    app.db,
    { ttlDays: 30, refreshThresholdDays: 7 },
    { userId: user.id as UserId },
  );
  return {
    userId: user.id as UserId,
    email: user.email,
    cookie: `${SESSION_COOKIE_NAME}=${app.signCookie(token)}`,
  };
}

describe('projects routes', () => {
  let app: FastifyInstance;
  const createdUserIds: UserId[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    for (const id of createdUserIds.splice(0)) {
      await app.db.delete(schema.users).where(eq(schema.users.id, id));
    }
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${crypto.randomUUID()}/projects`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('drives the full project lifecycle with role-gated access', async () => {
    const owner = await makeAuthedUser(app, 'owner');
    createdUserIds.push(owner.userId);
    const viewer = await makeAuthedUser(app, 'viewer');
    createdUserIds.push(viewer.userId);

    const org = await createOrganization(app.db, {
      name: 'Project Route Org',
      userId: owner.userId,
      correlationId: crypto.randomUUID(),
    });
    const organizationId = org.id as string;

    const { token } = await inviteMember(
      app.db,
      { organizationId: org.id as OrganizationId, userId: owner.userId, role: 'owner' },
      { email: viewer.email, role: 'viewer', correlationId: crypto.randomUUID() },
    );
    await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { cookie: viewer.cookie },
    });

    // Viewer cannot create.
    const viewerCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/projects`,
      headers: { cookie: viewer.cookie },
      payload: { name: 'Should Fail' },
    });
    expect(viewerCreate.statusCode).toBe(403);

    // Owner creates.
    const create = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/projects`,
      headers: { cookie: owner.cookie },
      payload: { name: 'DevFlow Core', key: 'CORE' },
    });
    expect(create.statusCode).toBe(201);
    const project = create.json();
    expect(project.slug).toBe('devflow-core');
    expect(project.workflowConfig.version).toBe(1);
    const projectId = project.id as string;

    // Viewer can read.
    const viewerGet = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      headers: { cookie: viewer.cookie },
    });
    expect(viewerGet.statusCode).toBe(200);

    // List includes it.
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/projects`,
      headers: { cookie: owner.cookie },
    });
    expect(list.json().projects).toHaveLength(1);

    // Unknown project id -> 404.
    const notFound = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/projects/${crypto.randomUUID()}`,
      headers: { cookie: owner.cookie },
    });
    expect(notFound.statusCode).toBe(404);

    // Invalid key format -> 400.
    const badKey = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${organizationId}/projects`,
      headers: { cookie: owner.cookie },
      payload: { name: 'Bad Key', key: 'lowercase' },
    });
    expect(badKey.statusCode).toBe(400);

    // Viewer cannot update.
    const viewerUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      headers: { cookie: viewer.cookie },
      payload: { name: 'Hijacked' },
    });
    expect(viewerUpdate.statusCode).toBe(403);

    // Owner updates: partial workflow-config patch merges over defaults.
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      headers: { cookie: owner.cookie },
      payload: { workflowConfig: { reviewPolicy: { requiredApprovals: 2 } } },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().workflowConfig.reviewPolicy).toEqual({
      requiredApprovals: 2,
      requireAiReview: true,
    });
    expect(update.json().slug).toBe('devflow-core');

    // Viewer cannot delete.
    const viewerDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      headers: { cookie: viewer.cookie },
    });
    expect(viewerDelete.statusCode).toBe(403);

    // Owner deletes.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      headers: { cookie: owner.cookie },
    });
    expect(del.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/projects/${projectId}`,
      headers: { cookie: owner.cookie },
    });
    expect(afterDelete.statusCode).toBe(404);

    await app.db.delete(schema.organizations).where(eq(schema.organizations.id, org.id));
  });
});
