import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OrganizationId, UserId, Role } from '@devflow/types';
import { findMembership } from './dal/organization-members.dal';

export interface OrgContext {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    orgContext?: OrgContext;
  }
}

// developer/reviewer are peers (design doc §3.3) — same rank, above viewer, below admin.
const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  reviewer: 1,
  developer: 1,
  admin: 2,
  owner: 3,
};

function meetsMinRole(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Route-level authZ gate for org-scoped resources. Reads `:organizationId` from
 * the (already-validated) route params, loads the caller's membership, and
 * builds `OrgContext` — the only way to construct one (design doc §3.4).
 * Requires the auth plugin to have run first (`request.user`).
 */
export function requireOrgRole(minRole: Role) {
  return async function orgRoleGate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) return reply.unauthorized();

    const { organizationId } = request.params as { organizationId: string };
    const membership = await findMembership(
      request.server.db,
      organizationId as OrganizationId,
      request.user.id,
    );

    if (!membership || !meetsMinRole(membership.role, minRole)) {
      return reply.forbidden();
    }

    request.orgContext = {
      organizationId: organizationId as OrganizationId,
      userId: request.user.id,
      role: membership.role,
    };
  };
}
