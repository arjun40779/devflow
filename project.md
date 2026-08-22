# Developer Workflow Platform — Architecture Documentation (v2)

**Status:** Draft — revised
**Document type:** Architecture & Technical Design
**Primary goal:** Provide developers with a single workflow surface from ticket creation through implementation, review, merge, and deployment.

**Changes from v1** are marked inline with `[REVISED]` or `[NEW]` so the diff is easy to review against the original.

---

## 1. Product Overview

The platform is a developer workflow orchestration application that coordinates project-management systems, GitHub, Slack, CI/CD, and AI-assisted engineering workflows.

The product is **not intended to replace Jira, Linear, GitHub, or Slack**. Instead, it sits above them and coordinates the development lifecycle.

### Core workflow

```text
Ticket / Idea
     │
     ▼
AI-assisted requirements
     │
     ▼
Start Work
     │
     ▼
Create Git branch
     │
     ▼
Developer implementation
     │
     ▼
Create Pull Request
     │
     ▼
AI code review
     │
     ▼
Human review
     │
     ▼
CI / checks
     │
     ▼
Merge
     │
     ▼
Deployment
     │
     ▼
Slack / team notification
     │
     ▼
Ticket completed
```

### Product principle

> A developer should be able to manage the development workflow without constantly switching between multiple tools.

---

# 2. Goals

## Primary goals

- Provide a unified developer workspace.
- Integrate with GitHub.
- Integrate with Slack.
- Integrate with project-management tools such as Jira or Linear.
- Generate and improve tickets using AI.
- Generate technical specifications and implementation plans.
- Create correctly named Git branches automatically.
- Create and manage GitHub pull requests.
- Perform AI-assisted PR/code reviews.
- Recommend reviewers.
- Track CI status.
- Notify teams through Slack.
- Track the complete lifecycle of a work item.
- Provide useful developer-focused daily workflow information.
- Support configurable workflow automation.

## Secondary goals

- Provide repository-aware AI.
- Provide release and deployment visibility.
- Provide engineering knowledge search.
- Provide team workflow analytics.
- Support feature flags and deployment workflows.
- Support incident-to-fix workflows.

## Non-goals for the initial version

- Replacing GitHub as a source-control platform.
- Replacing Jira/Linear as a full project-management platform.
- Building a complete Slack replacement.
- Building a complete CI/CD platform.
- Building a full IDE.
- Starting with microservices.
- Building a generalized workflow automation platform before the core workflow is proven.

---

# 3. Architectural Principles

### 3.1 Modular monolith first

Simple local development, transactional DB operations, lower operational overhead, clear module boundaries, and the ability to extract services later if required. Microservices only when there's a demonstrated scaling or isolation requirement.

### 3.2 Event-driven integration

External systems and asynchronous operations communicate through domain events and background jobs.

```text
PR_CREATED
    │
    ├──► AI_REVIEW_REQUESTED
    ├──► SLACK_NOTIFICATION_REQUESTED
    └──► WORK_ITEM_UPDATED
```

### 3.3 External systems remain authoritative

- GitHub owns repository and PR state.
- Jira/Linear owns project-management state when configured as the source of truth.
- Slack owns messages.
- The application maintains the relationships and workflow state needed to coordinate these systems.

**`[REVISED]`** "Authoritative" needs a concrete reconciliation mechanism, not just a principle — see §10.4a and §14a below. Treating an external system as authoritative but never re-syncing against it is how internal state silently drifts from reality.

### 3.4 Idempotent integrations

Webhook handlers and background jobs must be safe to retry. **`[REVISED]`** — see §21 for the concrete idempotency-key design (this was a stated principle in v1 with no schema behind it).

### 3.5 Least privilege

OAuth scopes, API permissions, internal roles, and integration permissions follow least-privilege principles. **`[REVISED]`** — see §25a for GitHub App vs. OAuth App, which materially changes what "least privilege" means for a multi-tenant integration.

### 3.6 AI is an assistant, not an authority

AI-generated content should be reviewable and should not silently make destructive or production-impacting decisions. High-risk actions require explicit user/team approval.

### 3.7 `[NEW]` App-layer gates must be enforced at the source system

Any rule the platform defines ("PR requires AI review before merge") is unenforceable if it lives only in the platform's database — a developer can merge directly on GitHub regardless of what your `work_items` row says. Wherever a workflow rule is meant to be a hard gate rather than a soft recommendation, it must be pushed into the source system's own enforcement (e.g., GitHub required status checks / branch protection), not just tracked internally. See §17a.

---

# 4. Recommended Technology Stack

## Frontend

| Technology             | Purpose                        |
| ---------------------- | ------------------------------ |
| Next.js                | Web application framework      |
| React                  | UI                             |
| TypeScript             | Type safety                    |
| Tailwind CSS           | Styling                        |
| TanStack Query         | Server-state management        |
| Zod                    | Client-side/runtime validation |
| React Hook Form        | Complex forms                  |
| Framer Motion / Motion | UI transitions                 |
| Vitest                 | Unit/component tests           |
| Playwright             | E2E testing                    |

### Frontend architecture

Feature/module-oriented, not purely technical folders:

```text
apps/web/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── projects/
│   ├── work-items/
│   ├── reviews/
│   ├── integrations/
│   └── settings/
│
├── modules/
│   ├── work-items/
│   ├── projects/
│   ├── reviews/
│   ├── integrations/
│   ├── activity/
│   ├── notifications/
│   └── dashboard/
│
├── components/
│   ├── ui/
│   └── layout/
│
├── lib/
│   ├── api/
│   ├── auth/
│   ├── validation/
│   └── utils/
│
└── tests/
```

---

# 5. Backend Technology

| Technology                             | Purpose                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Node.js                                | Runtime                                                                |
| TypeScript                             | Type safety                                                            |
| Fastify                                | HTTP API                                                               |
| PostgreSQL                             | Primary relational database                                            |
| Drizzle ORM                            | Database access / migrations                                           |
| Redis                                  | Cache, distributed locks, short-lived state, pub/sub                   |
| BullMQ                                 | Background jobs (single-hop, retryable tasks)                          |
| **`[NEW]` Temporal or Inngest**        | **Durable execution for multi-step, long-running workflows (see §5a)** |
| OpenTelemetry                          | Observability                                                          |
| Pino                                   | Structured logging                                                     |
| Zod                                    | Request/event validation                                               |
| OAuth 2.0 + **`[REVISED]` GitHub App** | External integrations — see §25a                                       |
| Docker                                 | Local/deployment consistency                                           |

Fastify remains the right call: the backend is integration-heavy and benefits from a lightweight, strongly typed HTTP layer.

## 5a. `[NEW]` Durable workflow execution alongside BullMQ

BullMQ is good at "run this job, retry on failure." It is not naturally good at "coordinate a workflow that spans branch creation → PR creation → async AI review → human approval → merge → deploy," where steps happen minutes or hours apart, some steps wait on human/external action, and the whole chain needs to resume correctly after a crash without re-running completed steps.

v1 implicitly asks BullMQ to do this via chained event handlers (§3.2, §17), which works but pushes idempotency and "where are we in the workflow" bookkeeping entirely onto application code, and makes long-running audit/replay (§34) harder to get right.

**Recommendation:** keep BullMQ for discrete, short-lived integration jobs (post a GitHub comment, send a Slack message, fetch a diff). For the multi-step orchestration itself — the thing §11 calls the "Development Workflow Module" — evaluate a durable execution engine:

- **Temporal** — self-hosted or Temporal Cloud, strong guarantees, more operational weight.
- **Inngest** — lighter to adopt, good fit for a Node/TypeScript monolith, less infrastructure than Temporal.

Either gives you: automatic resumption after failure, built-in step idempotency, human-in-the-loop waits (waiting for approval doesn't need a poller), and a queryable execution history that doubles as most of §34's activity timeline for free.

This is a **Phase 2 evaluation, not an MVP requirement** — BullMQ alone is sufficient to ship the MVP scope in §35. Flagging it now so the workflow module (§11) is built against an interface that could swap underlying engines later, rather than hard-coding BullMQ chaining assumptions into business logic.

---

# 6. AI Stack

Provider-agnostic, as in v1:

```text
AiProvider
├── generateText()
├── generateStructuredOutput()
├── generateEmbedding()
└── reviewCode()
```

### AI use cases

- Ticket generation, ticket improvement, acceptance criteria generation
- Technical specification generation, implementation planning, test-plan generation
- Repository understanding, PR summaries, code review, reviewer recommendations
- Release-note generation, incident summaries, engineering knowledge search

---

# 7. Infrastructure

```text
                 Internet
                    │
                    ▼
              CDN / Edge
                    │
              ┌─────┴─────┐
              ▼           ▼
          Next.js       API
              │           │
              └─────┬─────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   PostgreSQL     Redis       Queue
                                │
                         ┌──────┼──────┐
                         ▼      ▼      ▼
                      Worker  Worker  Worker
                      GitHub   AI     Slack
```

- Vercel for Next.js
- AWS ECS/Fargate for API/workers
- AWS RDS PostgreSQL
- ElastiCache Redis
- S3 for artifacts
- GitHub Actions for CI/CD
- OpenTelemetry + Grafana/Datadog for observability

---

# 8. Repository / Monorepo Structure

pnpm workspaces, Turborepo for task orchestration:

```text
devflow/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── config/
│   ├── database/
│   ├── auth/
│   ├── types/
│   ├── validation/
│   ├── ai/
│   ├── github/
│   ├── slack/
│   ├── project-management/
│   ├── events/
│   ├── queue/
│   ├── observability/
│   └── ui/
│
├── tooling/
│   ├── eslint/
│   ├── prettier/
│   └── typescript/
│
├── docker/
├── .github/workflows/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

# 9. Backend Module Pattern

Each domain module owns its routes, controllers/handlers, service/use cases, repository, schemas, domain types, events, and tests:

```text
modules/
└── work-items/
    ├── domain/
    ├── application/
    ├── infrastructure/
    ├── http/
    ├── events/
    └── __tests__/
```

---

# 10. Module Responsibilities

## 10.1 Identity & Access

Authentication, sessions, users, organizations, teams, roles, permissions, OAuth accounts.

```text
Organization Owner
Admin
Developer
Reviewer
Viewer
```

## 10.2 Organizations

```text
Organization
 ├── Teams
 ├── Projects
 ├── Repositories
 ├── Integrations
 └── Members
```

## 10.3 Projects

Projects, repositories, project configuration, workflow configuration, branch naming conventions, PR conventions, review policies.

```text
Project Configuration

Branch:
feature/{ticket-id}-{slug}

PR:
Require ticket ID
Require AI review

Review:
2 approvals

Merge:
CI + approvals + AI review
```

## 10.4 Work Items

The core domain: tickets, status, priority, assignment, dependencies, acceptance criteria, linked branch, linked PR, activity.

```text
BACKLOG → READY → IN_PROGRESS → IN_REVIEW → APPROVED → MERGED → DEPLOYED → DONE
```

The state machine validates allowed transitions.

## 10.4a `[NEW]` State reconciliation against GitHub

Because GitHub is authoritative for PR state (§3.3), the `WorkItem` state machine cannot only move forward through the happy path — it needs an explicit **reconciliation mode** for when GitHub's actual state disagrees with the platform's recorded state:

- A PR is merged directly from the GitHub UI, skipping the platform's "AI review" or "start work" steps entirely.
- A PR is closed without merging.
- A PR is reopened after being closed.
- A branch is force-pushed or deleted outside the platform.

Design:

- Every GitHub webhook event that touches PR/branch state (`pull_request.closed`, `pull_request.reopened`, `push`, etc.) triggers a **reconciliation check**, not a blind forward transition: compare the incoming GitHub state to the current `WorkItem.status`.
- Define an explicit table of allowed reconciliation jumps (e.g., `IN_PROGRESS → MERGED` is valid and skips intermediate states; `MERGED → IN_PROGRESS` is invalid and should raise a conflict rather than silently rewrite history).
- Anything that doesn't match an allowed transition or reconciliation jump is logged to `work_item_activity` as an anomaly and surfaced in the UI ("This PR was merged outside the platform") rather than silently dropped or silently forced into alignment.

---

# 11. Development Workflow Module

```text
Start Work → Create branch → Link branch → Create PR → Run AI review → Request human review → Merge
```

Coordinates other modules rather than directly implementing GitHub/Slack logic. **`[REVISED]`** — the multi-step chain here is the primary candidate for the durable-execution evaluation in §5a; keep the module's public interface (`startWork()`, `createBranch()`, etc.) stable regardless of which execution engine sits behind it.

---

# 12. GitHub Integration Module

```ts
interface GitHubProvider {
  createBranch(input: CreateBranchInput): Promise<Branch>;
  createPullRequest(input: CreatePullRequestInput): Promise<PullRequest>;
  getPullRequest(id: string): Promise<PullRequest>;
  addPullRequestComment(input: CommentInput): Promise<void>;
  getPullRequestDiff(id: string): Promise<Diff>;
  // [NEW] required for §17a gating
  upsertCheckRun(input: CheckRunInput): Promise<CheckRun>;
}
```

**`[NEW]`** `upsertCheckRun` is required if AI review is meant to be an actual merge gate (§17a) rather than an app-layer suggestion — it lets the platform report a pending/success/failure GitHub Check that branch protection can require.

Business logic depends on this interface, not the GitHub SDK directly.

---

# 13. Slack Integration Module

Unchanged from v1: OAuth, workspace connection, channel mapping, notifications, interactive commands, Slack events, message formatting.

```text
PR_CREATED
PR_REVIEW_COMPLETED
PR_MERGED
DEPLOYMENT_FAILED
WORK_ITEM_BLOCKED
```

---

# 14. Project Management Integration Module

```ts
interface ProjectManagementProvider {
  createIssue(input: CreateIssueInput): Promise<Issue>;
  updateIssue(id: string, input: UpdateIssueInput): Promise<Issue>;
  getIssue(id: string): Promise<Issue>;
  addComment(id: string, comment: string): Promise<void>;
}
```

## 14a. `[NEW]` Sync model and conflict resolution

v1 defined the adapter interface but not how sync actually happens. This is the single hardest problem in the module — two systems (Jira/Linear and the platform) both letting users edit the same fields — and needs a decision before Phase 3, not after:

**Direction:** hybrid, not pure pull or pure push.

- **Inbound (Jira/Linear → platform):** webhook-driven where the provider supports it (Jira has webhooks; Linear has webhooks), falling back to periodic polling per-project for providers/plans that don't. Inbound updates are applied to the `WorkItem` immediately.
- **Outbound (platform → Jira/Linear):** platform-initiated changes (status transitions driven by PR events, e.g. `IN_REVIEW → MERGED`) are pushed out via the adapter's `updateIssue` call, not left to eventual sync.

**Conflict resolution:** define field-level ownership rather than whole-record ownership:

- Fields the external tool owns by default (title, description, custom fields, assignee) — external edits always win; the platform never overwrites them without explicit user action.
- Fields the platform derives from the dev workflow (status transitions triggered by PR/branch events, linked branch, linked PR) — platform-driven changes are pushed outbound and treated as authoritative for that field going forward.
- A genuine collision (status changed in both systems within the same short window) is resolved last-write-wins **with the conflict recorded** in `work_item_activity` and visibly flagged in the UI — never resolved silently. Silent last-write-wins is the failure mode that erodes trust in this kind of tool fastest.

This model should be documented per-provider in `packages/project-management`, since Jira and Linear differ in webhook granularity and rate limits.

---

# 15. AI Module

```text
AI
├── ticket-generator
├── ticket-improver
├── technical-spec-generator
├── implementation-planner
├── test-plan-generator
├── pr-summary
├── code-review
├── reviewer-recommendation
├── release-notes
└── incident-analysis
```

```ts
reviewPullRequest({
  repository,
  pullRequest,
  diff,
  projectRules,
});
```

```ts
{
  summary: string;
  findings: [
    {
      severity: "critical" | "high" | "medium" | "low";
      file: string;
      line?: number;
      title: string;
      explanation: string;
      suggestion?: string;
    }
  ];
}
```

**`[REVISED]`** v1 listed `reviewer-recommendation` in both §15 (implying MVP-era availability) and Phase 2 (§36 lists it again). Clarifying: reviewer recommendation is **Phase 2**. The AI module's interface can include it from day one, but it should be treated as a stub/no-op until repository-aware AI (§16) exists — recommending reviewers well requires repository ownership/history data that isn't available pre-Phase-2.

---

# 16. Repository Intelligence

```text
GitHub Repository → Repository indexing → File parsing → Chunking → Embeddings → Vector search → Repository context → AI
```

**`[REVISED]`** Storage plan with an explicit migration trigger (v1 said "pgvector initially... OpenSearch/vector database later if required" with no threshold):

- **Start:** PostgreSQL + pgvector. Sufficient for single-digit-millions of chunks per organization at the recall/latency the MVP needs.
- **Migrate when:** p95 vector search latency exceeds target (e.g., >300ms) under real load, or a single organization's index exceeds roughly 5–10M chunks, or cross-organization query isolation on a shared pgvector instance becomes an operational burden. Whichever comes first is the trigger — don't wait for all three.
- Track index size and query latency as an explicit metric from day one (§29) so the migration decision is data-driven rather than reactive.

---

# 17. AI Review Pipeline

```text
PR_CREATED → Queue AI review job → Fetch PR metadata → Fetch diff → Load repository context →
Load project engineering rules → AI analysis → Persist findings → Post GitHub review/comments →
Publish AI_REVIEW_COMPLETED → Slack notification / Update Work Item
```

## 17a. `[NEW]` Enforcing AI review as an actual merge gate

Per §3.7: if a project's configuration says "require AI review" (§10.3), that must be enforced by GitHub, not just recorded in the platform's database — otherwise a developer merging directly from GitHub's UI bypasses it entirely, and the platform's `work_items` state silently disagrees with reality (see §10.4a).

Design:

1. On `PR_CREATED`, immediately call `upsertCheckRun` (§12) to post a **pending** GitHub Check named e.g. `devflow/ai-review`.
2. When the AI review job completes, update that Check to **success** or **failure** (failure only for `critical`-severity findings, per project configuration — don't block merges on `low`/`medium` findings by default).
3. Projects that enable "require AI review" configure GitHub branch protection to require the `devflow/ai-review` check before merge is allowed. The platform should offer to set this up automatically via the GitHub API when the setting is toggled on, rather than asking the user to configure branch protection manually.
4. This closes the race condition in v1 where a human could approve and merge before the async AI review job finished — GitHub itself now blocks the merge button until the Check resolves.

---

# 18. Workflow Automation Module

```text
Trigger → Conditions → Actions
```

```text
WHEN PR_MERGED
IF priority = HIGH
THEN
  update ticket
  notify Slack
  create release note
```

Initial implementation supports a small fixed set of triggers/actions. Do not build a generalized workflow language too early.

---

# 19. Event Architecture

```text
WORK_ITEM_CREATED
WORK_STARTED
BRANCH_CREATED
PR_CREATED
AI_REVIEW_REQUESTED
AI_REVIEW_COMPLETED
REVIEW_REQUESTED
PR_APPROVED
PR_CHANGES_REQUESTED
PR_MERGED
DEPLOYMENT_STARTED
DEPLOYMENT_SUCCEEDED
DEPLOYMENT_FAILED
WORK_ITEM_BLOCKED
WORK_ITEM_COMPLETED
```

```ts
interface DomainEvent<T> {
  id: string;
  type: string;
  organizationId: string;
  aggregateId: string;
  occurredAt: Date;
  payload: T;
  version: number;
}
```

---

# 20. Queue Architecture

```text
queues/
├── github
├── slack
├── ai
├── notifications
├── deployments
└── automation
```

Every job defines a retry policy, backoff, timeout, idempotency key, and failure handling.

```text
GitHub API failure → Retry → Exponential backoff → Retry limit → Dead-letter / failed job → Alert
```

---

# 21. Webhook Architecture

```text
GitHub → POST /webhooks/github → Verify signature → Persist event → Return 2xx quickly → Queue processing
```

The webhook endpoint does not perform expensive operations synchronously. Same model for Slack and project-management providers.

## 21a. `[NEW]` Concrete idempotency design

v1 stated the principle without a schema. Concrete design:

```sql
webhook_events (
  id              uuid primary key,
  provider        text not null,          -- 'github' | 'slack' | 'jira' | 'linear'
  provider_delivery_id text not null,     -- GitHub's X-GitHub-Delivery header, etc.
  organization_id uuid not null,
  event_type      text not null,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  unique (provider, provider_delivery_id)
)
```

- The webhook handler `INSERT ... ON CONFLICT (provider, provider_delivery_id) DO NOTHING` before queueing a job. A duplicate delivery (GitHub retries on any non-2xx, and can double-deliver regardless) is a no-op at the database level, not something each job handler has to reason about independently.
- Downstream jobs use `webhook_events.id` as their BullMQ job ID (or Temporal/Inngest workflow ID per §5a) so re-queueing the same event is also naturally deduplicated at the queue layer, not just the database layer.
- For **outbound** idempotency (platform → GitHub/Jira/Slack — e.g., "create this PR comment exactly once even if the job retries"), each outbound call carries a deterministic idempotency key derived from `(aggregateId, action, version)` so a retried job produces the same key and the provider (or an internal dedupe table, where the provider doesn't support idempotency keys itself) can reject/ignore the duplicate.

---

# 22. Database Model

```text
organizations, users, organization_members, teams, projects
repositories, repository_integrations
work_items, work_item_dependencies, work_item_activity
branches, pull_requests, pull_request_reviews, ai_reviews, ai_findings
integrations, oauth_accounts
slack_workspaces, slack_channels
workflow_definitions, workflow_runs
deployments, feature_flags
notifications, audit_logs
webhook_events
jobs
```

```text
Organization
   │
   ├── Project
   │     │
   │     ├── Repository
   │     └── Work Item
   │            │
   │            ├── Branch
   │            ├── Pull Request
   │            │       └── AI Review
   │            └── Activity
   │
   └── Members
```

---

# 23. Work Item as the Core Aggregate

```text
WorkItem
├── externalIssueId
├── projectId
├── title
├── description
├── status
├── priority
├── assignee
├── dependencies
├── branch
├── pullRequest
├── reviews
├── deployment
└── activity
```

---

# 24. API Design

REST for external/public APIs, internal event-driven communication for asynchronous workflows.

```text
GET/POST /api/work-items ...
POST /api/work-items/:id/start
POST /api/work-items/:id/create-branch
POST /api/work-items/:id/create-pr
POST /api/work-items/:id/ai-review

GET /api/pull-requests ...
GET /api/projects/:id/activity
GET/POST /api/integrations ...
POST /api/webhooks/github
POST /api/webhooks/slack
```

---

# 25. Authentication & Authorization

OAuth/OIDC for login, secure HTTP-only sessions, OAuth connections for GitHub/Slack/Jira/Linear, organization-level RBAC, project-level permissions where required. Never expose external OAuth access tokens to the browser. Store sensitive credentials encrypted at rest.

## 25a. `[NEW]` GitHub App, not just OAuth App

v1's "least privilege" principle (§3.5) is undercut if GitHub access is a per-user OAuth App: OAuth Apps authenticate as the connecting user and inherit that user's full repo permissions, which is both broader than the platform needs and creates a dependency on that specific user's continued access (if they leave the org or lose repo access, the integration silently breaks).

**Use a GitHub App instead:**

- Installed per-organization, with explicit, narrowly scoped repository permissions (contents, pull requests, checks, issues) rather than a user's full OAuth scope.
- Authenticates as the installation, not as any individual user — survives personnel changes.
- Each installation gets its own webhook secret, which directly enables the multi-tenant webhook isolation described below.
- Required to use the Checks API (`upsertCheckRun`, §12/§17a) properly — OAuth Apps have weaker Checks API access than GitHub Apps.

## 25b. `[NEW]` Multi-tenant webhook isolation

With multiple organizations each connecting their own GitHub App installation, a webhook-handling bug is a potential **cross-tenant data leak**, not just a bug. Explicit requirements:

- Verify the webhook signature using the specific installation's secret, not a single shared platform-wide secret.
- Resolve `installation_id` (from the webhook payload) to exactly one `organization_id` **before** any data is read or written, and reject the request if that mapping doesn't exist or is ambiguous.
- Every downstream repository/service call triggered by a webhook must be explicitly scoped to the resolved `organization_id` — this should be enforced structurally (e.g., a scoped repository client that can't be constructed without an org ID) rather than left to each handler to remember.

---

# 26. Security

- OAuth state validation, PKCE where applicable
- Webhook signature verification (per-installation, §25b)
- CSRF protection, rate limiting, input validation
- Authorization on every protected action
- Encrypted integration credentials, audit logging, secret rotation
- Least-privilege OAuth scopes via GitHub App (§25a)
- Secure redirect URI validation
- Prompt-injection defenses for repository content
- AI output validation

AI-generated instructions from repository files, issues, comments, or PRs must be treated as untrusted input.

---

# 27. AI Security

```text
Repository content → UNTRUSTED CONTEXT → Sanitize / isolate → AI context →
Structured output validation → Human approval for high-impact actions
```

The AI must not independently merge production code, delete repositories, rotate secrets, change permissions, deploy production, or execute arbitrary shell commands without an explicit authorization boundary.

---

# 28. Caching Strategy

Redis for short-lived API cache, GitHub/Slack metadata caching, rate-limit state, distributed locks, idempotency keys, session-related state, and **`[NEW]`** pub/sub fan-out for realtime (§40a). PostgreSQL remains authoritative for application state — Redis is never the source of truth for business entities.

---

# 29. Observability

Every request and background job has a correlation ID that threads through the whole workflow (webhook → job → external API call → domain event → notification).

Important metrics:

```text
GitHub API latency / errors
Webhook processing latency
AI review duration / failures
Queue depth, job retry count
PR creation failures
Slack delivery failures
[NEW] Vector search p95 latency and index size (§16 migration trigger)
[NEW] Reconciliation anomalies (§10.4a) — count of work items whose status disagreed with GitHub state
[NEW] PM sync conflicts (§14a) — count of collisions requiring flagged resolution
```

---

# 30. Testing Strategy

Unit tests for domain logic, state transitions (**including reconciliation jumps, §10.4a**), branch naming, permissions, workflow conditions, AI output validation.

Integration tests for PostgreSQL repositories, Redis, queues, webhook processing (**including duplicate-delivery idempotency, §21a**), GitHub/Slack adapters.

E2E tests (Playwright) for the full login → connect GitHub → create ticket → start work → branch → PR → AI review → review → merge → ticket complete flow, using sandbox/test repositories.

---

# 31. Frontend Application Modules

```text
modules/
├── dashboard/ work-items/ projects/ repositories/ pull-requests/
├── reviews/ activity/ notifications/ integrations/ automation/
├── deployments/ knowledge/ settings/
```

Avoid putting business logic into generic UI components.

---

# 32. Developer Dashboard

```text
MY WORK

Action Required
├── 2 PR reviews
├── 1 failed CI
└── 1 requested change

In Progress
├── PROJ-142
└── PROJ-151

Waiting
└── PROJ-155 — waiting for review

Recently Shipped
└── PROJ-139
```

Prioritizes actions rather than merely displaying statistics.

---

# 33. PR Review Experience

**`[REVISED]`** aligned to the "2 approvals" default from §10.3 (v1's example showed only one approval, inconsistent with its own project-config example):

```text
PR #381
──────────────
Ticket        PROJ-142
Changes       +423 / -81
CI            ✓ All checks passed
AI Review     ✓ No critical issues · ⚠ 2 suggestions
Human Review  ✓ Sourabh   ⏳ Smit   (2 required)
Risk          MEDIUM

[View GitHub PR]  [Request Review]  [Merge]
```

---

# 34. Activity Timeline

```text
10:02  Ticket created
10:05  AI specification generated
10:17  Work started
10:17  Branch created
12:42  PR opened
12:43  AI review started
12:45  AI review completed
13:10  Sourabh approved
13:18  PR merged
13:20  Deployment started
13:23  Deployment successful
```

**`[NEW]`** Reconciliation anomalies (§10.4a) and PM sync conflicts (§14a) also appear in this timeline — e.g., "PR merged outside platform, work item status corrected" — so unexpected state changes are visible, not silent.

---

# 35. MVP Scope

```text
✓ Authentication
✓ Organization
✓ GitHub connection (via GitHub App, §25a)
✓ Slack connection
✓ Work items
✓ Ticket creation
✓ AI ticket generation
✓ Start work
✓ Automatic branch creation
✓ PR creation
✓ PR status synchronization (with reconciliation, §10.4a)
✓ AI PR review (enforced via GitHub Check, §17a)
✓ Slack notifications
✓ Activity timeline
```

### Do not build initially

```text
✗ Full Jira replacement
✗ Full CI/CD platform
✗ Complex workflow builder
✗ Feature flags
✗ Production rollback
✗ Advanced analytics
✗ Multi-provider AI routing
✗ Full repository RAG
✗ Incident management
✗ Durable-execution migration (§5a) — evaluate, don't build, in MVP
```

---

# 36. Phase 2

- Repository-aware AI, technical specification generation, implementation plans, test-plan generation, PR summaries
- Smart reviewer recommendation (moved fully here, per §15 clarification)
- PR risk score, review queue, dependencies
- "What should I work on next?", standup generation, catch-up summary
- Durable-execution evaluation (§5a) — Temporal or Inngest for the workflow module

---

# 37. Phase 3

- Jira/Linear adapters with the sync model in §14a
- Workflow automation, release management, deployment integration, feature flags
- Engineering knowledge base, ADRs, Git history intelligence

---

# 38. Phase 4

- Production monitoring, incident management, deployment health checks, rollback workflows
- Advanced analytics, organization-wide engineering intelligence

---

# 39. Scalability Strategy

```text
                 Load Balancer
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        API 1       API 2       API 3
          │           │           │
          └───────────┼───────────┘
                      │
                 PostgreSQL
                      │
                    Redis
                      │
                    Queue
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Worker       Worker       Worker
```

## 40a. `[NEW]` Realtime (SSE) across multiple API instances

v1 chose SSE for realtime workflow updates but the scaling diagram (above) shows multiple API replicas without addressing how an event published by, say, the AI worker reaches a client whose SSE connection happens to be held open by API-2, not API-1.

**Fix:** SSE connections stay instance-local (no sticky-session requirement needed), but every domain event that should trigger a UI update is published to a **Redis pub/sub channel scoped by organization** (`org:{id}:events`). Each API instance subscribes to the channels for the organizations it currently has open SSE connections for, and forwards matching events to its own locally-held connections. This keeps SSE simple while making it correctly horizontal — no instance affinity needed at the load balancer.

Only extract independent services when there is a concrete reason. Likely candidates later: AI processing, webhook processing, notification processing, repository indexing, deployment orchestration.

---

# 40. Key Architectural Decisions

| Decision                           | Choice                                    | Reason                                                                                                                         |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Backend                            | Modular monolith                          | Faster development and clear boundaries                                                                                        |
| Frontend                           | Next.js + React                           | Strong developer experience                                                                                                    |
| Language                           | TypeScript                                | Shared types and ecosystem                                                                                                     |
| Database                           | PostgreSQL                                | Relational workflow data                                                                                                       |
| ORM                                | Drizzle                                   | Type-safe and lightweight                                                                                                      |
| Cache                              | Redis                                     | Fast temporary state + pub/sub fan-out                                                                                         |
| Jobs                               | BullMQ                                    | Reliable async processing for discrete tasks                                                                                   |
| **`[NEW]` Workflow orchestration** | **Temporal or Inngest (Phase 2 eval)**    | **Durable, resumable multi-step workflows; BullMQ chaining alone doesn't give resumption or human-in-the-loop waits for free** |
| GitHub integration                 | **`[REVISED]` GitHub App**, not OAuth App | Narrow per-org scopes, installation-based auth, Checks API access                                                              |
| Integration model                  | Adapters                                  | Avoid vendor lock-in                                                                                                           |
| Events                             | Domain events                             | Loose coupling                                                                                                                 |
| AI                                 | Provider abstraction                      | Avoid AI vendor lock-in                                                                                                        |
| API                                | REST                                      | Simple and explicit                                                                                                            |
| Realtime                           | SSE + Redis pub/sub fan-out               | Server-driven updates that stay correct across multiple API instances                                                          |
| Testing                            | Vitest + Playwright                       | Unit + E2E coverage                                                                                                            |
| Deployment                         | Containers + managed services             | Portable and scalable                                                                                                          |
| Architecture                       | Modular monolith                          | Avoid premature microservices                                                                                                  |

---

# 41. Example End-to-End Flow

Unchanged narrative from v1, now implicitly covered by the reconciliation (§10.4a) and check-gating (§17a) mechanisms:

1. **Create ticket** — AI generates PROJ-142 with acceptance criteria.
2. **Start work** — `feature/PROJ-142-remove-circle-members` branch created via GitHub App.
3. **Implement** — platform tracks branch activity and ticket state.
4. **Create PR** — AI generates title + structured description; a pending `devflow/ai-review` Check is posted immediately (§17a).
5. **AI review** — detects `HIGH: Authorization check missing`; Check updated to failure; finding posted to GitHub.
6. **Human review** — reviewers recommended based on repository ownership/history (Phase 2, §15).
7. **Merge** — blocked by GitHub branch protection until CI, AI review Check, and required approvals all pass — enforced by GitHub itself, not just the app.
8. **Notifications** — Slack receives the merge notification.
9. **Deployment** — if enabled, deployment starts and health-checks.
10. **Completion** — work item reaches `DEPLOYED`; full timeline, including any reconciliation anomalies, is preserved.

---

# 42. Final Architecture

```text
                         ┌───────────────────────┐
                         │      Next.js Web      │
                         └───────────┬───────────┘
                                     ▼
                         ┌───────────────────────┐
                         │   API Layer (Fastify) │
                         └───────────┬───────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌───────────────┐          ┌────────────────┐          ┌────────────────┐
│ Core Modules  │          │ Integration    │          │ AI Module      │
│ Work Items    │          │ GitHub (App)   │          │ Ticket AI      │
│ Projects      │          │ Slack          │          │ Code Review    │
│ Identity      │          │ Jira / Linear  │          │ Repo AI        │
│ Workflow      │          │ CI/CD          │          │ Test Planning  │
│ Deployments   │          │                │          │ Summaries      │
└───────┬───────┘          └───────┬────────┘          └───────┬────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    ▼
                         ┌───────────────────────┐
                         │    Domain Events      │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                                  ▼
           BullMQ / Redis                  Temporal/Inngest (Phase 2)
        (discrete integration jobs)        (multi-step orchestration)
                    │                                  │
                    └────────────────┬─────────────────┘
                                     ▼
                              PostgreSQL
                                     │
                                     ▼
                              Audit / Activity
```

---

# 43. Product Definition

> **A developer workflow orchestration platform that connects project management, GitHub, AI, Slack, CI/CD, and deployment into one continuous development workflow.**

**Plan → Start → Code → Review → Merge → Ship**

Everything else should make those six steps faster, safer, and easier.
