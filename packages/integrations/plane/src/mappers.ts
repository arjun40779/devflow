import type { Issue, Comment } from '@devflow/integrations-core';

export interface PlaneWorkItem {
  id: string;
  name: string;
  description?: string | null;
  description_html?: string | null;
  priority?: string | null;
  state_id?: string | null;
  assignee_ids?: string[];
  project_id: string;
  sequence_id?: number;
  created_at: string;
  updated_at: string;
}

export interface PlaneComment {
  id: string;
  comment_stripped?: string | null;
  comment_html?: string | null;
  actor_id?: string;
  created_by_id?: string;
  issue_id: string;
  created_at?: string;
  edited_at?: string | null;
}

/**
 * `state_id` is used as-is for `status` (a UUID, not a human-readable name) --
 * resolving the state's display name needs a separate workspace-states call,
 * deferred as an MVP simplification (design doc keeps normalized models
 * provider-agnostic, not necessarily human-readable this wave).
 */
export function toIssue(item: PlaneWorkItem, workspaceSlug: string): Issue {
  return {
    externalId: item.id,
    title: item.name,
    description: item.description ?? item.description_html ?? null,
    status: item.state_id ?? 'unknown',
    // Plane supports multiple assignees; the normalized model has one -- first wins (known simplification).
    assigneeExternalId: item.assignee_ids?.[0] ?? null,
    url: `https://app.plane.so/${workspaceSlug}/projects/${item.project_id}/issues/${item.sequence_id ?? item.id}`,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export function toComment(
  comment: PlaneComment,
  workspaceSlug: string,
  projectId: string,
): Comment {
  return {
    externalId: comment.id,
    body: comment.comment_stripped ?? comment.comment_html ?? '',
    authorExternalId: comment.actor_id ?? comment.created_by_id ?? 'unknown',
    url: `https://app.plane.so/${workspaceSlug}/projects/${projectId}/issues/${comment.issue_id}`,
    createdAt: comment.created_at ?? comment.edited_at ?? new Date().toISOString(),
  };
}
