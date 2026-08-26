import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import type {
  SourceControlPort,
  CreateBranchInput,
  CreatePullRequestInput,
  CreateCommentInput,
  UpsertCheckRunInput,
  Branch,
  PullRequest,
  Comment,
  CheckRun,
  Repository,
} from '@devflow/integrations-core';
import { toPullRequest, toComment, toCheckRun, toRepository, splitRepo } from './mappers';

export interface GithubAdapterOptions {
  appId: string;
  privateKey: string;
  installationId: string;
  /** Injected for tests (matches the codebase's fetchImpl DI convention); defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
}

/** One instance per resolved connection (built by the registry's createAdapter callback) — already installation-scoped. */
export function createGithubSourceControlAdapter(options: GithubAdapterOptions): SourceControlPort {
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: options.appId,
      privateKey: options.privateKey,
      installationId: options.installationId,
    },
    ...(options.fetch ? { request: { fetch: options.fetch } } : {}),
  });

  return {
    async listRepositories(): Promise<Repository[]> {
      const { data } = await octokit.apps.listReposAccessibleToInstallation();
      return (data.repositories ?? []).map(toRepository);
    },

    async createBranch(_ctx, input: CreateBranchInput): Promise<Branch> {
      const { owner, name: repoName } = splitRepo(input.repo);
      const { data: ref } = await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${input.fromRef}`,
      });
      const sha = ref.object.sha;
      await octokit.git.createRef({
        owner,
        repo: repoName,
        ref: `refs/heads/${input.name}`,
        sha,
      });
      return {
        name: input.name,
        repo: input.repo,
        sha,
        url: `https://github.com/${input.repo}/tree/${input.name}`,
      };
    },

    async createPullRequest(_ctx, input: CreatePullRequestInput): Promise<PullRequest> {
      const { owner, name: repoName } = splitRepo(input.repo);
      const { data } = await octokit.pulls.create({
        owner,
        repo: repoName,
        title: input.title,
        head: input.headRef,
        base: input.baseRef,
        body: input.body,
      });
      return toPullRequest(data, input.repo);
    },

    async getPullRequest(_ctx, input: { repo: string; number: number }): Promise<PullRequest> {
      const { owner, name: repoName } = splitRepo(input.repo);
      const { data } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: input.number,
      });
      return toPullRequest(data, input.repo);
    },

    async createComment(_ctx, input: CreateCommentInput): Promise<Comment> {
      const { owner, name: repoName } = splitRepo(input.repo);
      const { data } = await octokit.issues.createComment({
        owner,
        repo: repoName,
        issue_number: Number(input.targetExternalId),
        body: input.body,
      });
      return toComment(data);
    },

    async getDiff(_ctx, input: { repo: string; number: number }): Promise<string> {
      const { owner, name: repoName } = splitRepo(input.repo);
      const { data } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: input.number,
        mediaType: { format: 'diff' },
      });
      return data as unknown as string;
    },

    async upsertCheckRun(_ctx, input: UpsertCheckRunInput): Promise<CheckRun> {
      const { owner, name: repoName } = splitRepo(input.repo);

      // Tier 2 idempotency (design doc §3.7): reconcile against an existing
      // check run for this name + head sha instead of creating a duplicate.
      const { data: existing } = await octokit.checks.listForRef({
        owner,
        repo: repoName,
        ref: input.headSha,
        check_name: input.name,
      });
      const match = existing.check_runs[0];

      const data = match
        ? (
            await octokit.checks.update({
              owner,
              repo: repoName,
              check_run_id: match.id,
              status: input.status,
              conclusion: input.conclusion ?? undefined,
              details_url: input.detailsUrl,
            })
          ).data
        : (
            await octokit.checks.create({
              owner,
              repo: repoName,
              name: input.name,
              head_sha: input.headSha,
              status: input.status,
              conclusion: input.conclusion ?? undefined,
              details_url: input.detailsUrl,
            })
          ).data;

      return toCheckRun(data);
    },
  };
}
