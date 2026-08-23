import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { schema } from '@devflow/database';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../../../app';
import { createUser } from '../../../../modules/identity/dal/users.dal';
import { createUserSession } from '../../../../modules/identity/service/session.service';
import { SESSION_COOKIE_NAME } from '../../../../plugins/auth';
import { createOrganization } from '../../../../modules/organizations/service/organizations.service';
import { connect } from '../../../../modules/integrations/service/connections.service';
import type { OrganizationId, UserId } from '@devflow/types';

async function makeAuthedUser(app: FastifyInstance, label: string) {
  const githubId = `route-integrations-test-${label}-${crypto.randomUUID()}`;
  const user = await createUser(app.db, { githubId, email: `${githubId}@example.test` });
  const { token } = await createUserSession(
    app.db,
    { ttlDays: 30, refreshThresholdDays: 7 },
    { userId: user.id as UserId },
  );
  return { userId: user.id as UserId, cookie: `${SESSION_COOKIE_NAME}=${app.signCookie(token)}` };
}

describe('integrations routes', () => {
  let app: FastifyInstance;
  const createdUserIds: UserId[] = [];
  const createdOrgIds: OrganizationId[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    for (const id of createdOrgIds.splice(0)) {
      await app.db.delete(schema.organizations).where(eq(schema.organizations.id, id));
    }
    for (const id of createdUserIds.splice(0)) {
      await app.db.delete(schema.users).where(eq(schema.users.id, id));
    }
    await app.close();
  });

  async function makeOrg(owner: { userId: UserId }, label: string): Promise<OrganizationId> {
    const org = await createOrganization(app.db, {
      name: `Integrations Route Org ${label}`,
      userId: owner.userId,
      correlationId: crypto.randomUUID(),
    });
    createdOrgIds.push(org.id as OrganizationId);
    return org.id as OrganizationId;
  }

  it('rejects unauthenticated and non-admin access', async () => {
    const owner = await makeAuthedUser(app, 'owner');
    createdUserIds.push(owner.userId);
    const organizationId = await makeOrg(owner, 'authz');

    const outsider = await makeAuthedUser(app, 'outsider');
    createdUserIds.push(outsider.userId);

    const unauthed = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/integrations`,
    });
    expect(unauthed.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/integrations`,
      headers: { cookie: outsider.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('lists connections without leaking credentials, then disconnects', async () => {
    const owner = await makeAuthedUser(app, 'owner-2');
    createdUserIds.push(owner.userId);
    const organizationId = await makeOrg(owner, 'lifecycle');

    await connect(
      app.db,
      { organizationId, userId: owner.userId, role: 'owner' },
      {
        category: 'source-control',
        provider: 'github',
        externalAccount: { login: 'acme-org' },
        encryptedCredentials: 'ciphertext',
        credentialsIv: 'iv',
      },
    );

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/integrations`,
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].provider).toBe('github');
    expect(body.connections[0].encryptedCredentials).toBeUndefined();
    expect(body.connections[0].credentialsIv).toBeUndefined();

    const disconnect = await app.inject({
      method: 'DELETE',
      url: `/api/v1/organizations/${organizationId}/integrations/source-control`,
      headers: { cookie: owner.cookie },
    });
    expect(disconnect.statusCode).toBe(204);

    const listAfter = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${organizationId}/integrations`,
      headers: { cookie: owner.cookie },
    });
    expect(listAfter.json().connections[0].status).toBe('revoked');
  });

  it('returns 404 disconnecting a category with no connection', async () => {
    const owner = await makeAuthedUser(app, 'owner-3');
    createdUserIds.push(owner.userId);
    const organizationId = await makeOrg(owner, 'missing');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/organizations/${organizationId}/integrations/chat`,
      headers: { cookie: owner.cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
