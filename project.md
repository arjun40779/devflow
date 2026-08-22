# DevFlow — Architecture Overview

**Status:** v3 · Architecture & Technical Design
**Scope:** The high-level architecture of the DevFlow platform. This is the **top of a layered documentation tree** (§14) — it stays high-level; detailed designs live in each app, package, and module.

---

## 1. Product

DevFlow is a workflow orchestration layer that sits **above** the tools developers already use — project management, source control, chat, and calendar — and drives one continuous flow:

> **Plan → Start → Code → Review → Merge → Ship**

It does not replace GitHub, Plane, or Slack. It coordinates them so a developer runs the whole lifecycle from a single surface.

**Core loop**

```text
Ticket → AI requirements → Start work → Branch → PR → AI review → Human review → CI → Merge → Notify → Done
```

**Principle:** a developer should manage the development workflow without constantly switching tools.

---

## 2. Goals & Scope

**Vision (end state)**

- One workspace across project management, source control, chat, and calendar.
- AI assistance for tickets, specs, code review, and reviewer suggestions.
- Automated branch/PR lifecycle with review gates enforced at the source system.
- Full work-item lifecycle tracking and team notifications.
- Configurable automation, release/deploy visibility, and analytics.

**Scope is phase-tagged** so vision and delivery never blur (full roadmap in §13):

| Phase   | Delivers                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| **MVP** | Connect Plane · GitHub · Slack · Calendar; ticket → branch → PR → AI review (gated) → merge → Slack → activity timeline |
| **P2**  | Repository-aware AI, technical specs/plans, smart reviewer recommendation                                               |
| **P3**  | Additional adapters (Jira, Linear, GitLab, Teams), workflow automation, release/deploy                                  |
| **P4**  | Incident management, engineering analytics                                                                              |

**Non-goals (initial):** replace any source tool; build a CI/CD platform, IDE, or generalized automation engine; start with microservices.

---

## 3. Principles

1. **Modular monolith first** — extract services only when metrics demand it.
2. **Provider-agnostic** — every external tool is a swappable adapter behind a port (§8).
3. **Source systems are authoritative** — we reconcile against them, never assume.
4. **Idempotent integrations** — every webhook and job is safe to retry.
5. **Least privilege** — GitHub App and narrowly scoped OAuth.
6. **AI assists, never authors** destructive or production-impacting actions.
7. **Gates enforced at the source** — a rule like "PR needs AI review" is a GitHub required check, not just a DB flag.

---

## 4. Tech Stack

| Layer    | Choices                                                                           |
| -------- | --------------------------------------------------------------------------------- |
| Frontend | Next.js, React, TypeScript, Tailwind, TanStack Query, Zod, React Hook Form        |
| Backend  | Node.js, TypeScript, Fastify, PostgreSQL, Drizzle, Redis, BullMQ, Zod, Pino, OTel |
| AI       | Provider-agnostic abstraction (`AiProvider` port)                                 |
| Infra    | Docker, Vercel (web), containers + managed services (api/workers), GitHub Actions |
| Testing  | Vitest (unit/integration), Playwright (E2E)                                       |

---

## 5. System Architecture

```text
        ┌──────────────┐
        │  Next.js Web │
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │ API (Fastify)│
        └──────┬───────┘
   ┌───────────┼───────────┐
   ▼           ▼           ▼
Core        Integrations   AI
Modules     (ports/adapters)
   └───────────┼───────────┘
               ▼
         Domain Events
               ▼
        BullMQ / Redis ──► Workers
               ▼
          PostgreSQL (authoritative)
```

---

## 6. Monorepo

```text
devflow/
├── apps/       web · api · worker
├── packages/   config · database · types · validation · events · queue ·
│               observability · ui · ai · integrations/*
└── tooling/    eslint · tsconfig
```

pnpm workspaces + Turborepo. Each app and package is independently documented (§14).

---

## 7. Backend Module Pattern

- **Routes are versioned and live outside modules:** `routes/v{n}/<module>/{router,schema}`.
- **Modules hold business + data:** `modules/<module>/{service,dal}`.
- Dependency direction is one-way: **route → service → dal**.
- Business logic depends on **ports**, never vendor SDKs.

---

## 8. Integration Provider Framework

The platform's core differentiator: any external tool can be swapped or added without touching business logic.

- **Ports** (one per category) + **adapters** (per vendor) + a **runtime registry** that resolves the right adapter from an org's config.
- **Categories:** SourceControl (GitHub) · ProjectManagement (Plane) · Chat (Slack) · Calendar (Google) · AI.
- **Rules:** import ports not SDKs; only normalized domain models cross a port; resolve via the registry; adapters declare capabilities; each adapter owns its webhook verify + normalize.
- **Adding a provider** = a new adapter package + config — no core changes.

Detailed contracts and per-provider notes live in `packages/integrations` docs.

---

## 9. Core Domains

| Domain               | Responsibility                                                        |
| -------------------- | --------------------------------------------------------------------- |
| Identity & Access    | Auth, sessions, users, RBAC                                           |
| Organizations        | Orgs, teams, members                                                  |
| Projects             | Projects, repo links, workflow/branch/PR/review config                |
| Work Items           | Core aggregate: state machine + reconciliation against source systems |
| Development Workflow | Orchestrates start-work → branch → PR through ports                   |
| Integrations         | Provider framework + adapters (§8)                                    |
| AI                   | Ticket generation, PR review, (later) repo intelligence               |
| Activity             | Correlated lifecycle timeline, including out-of-band reconciliations  |

Each domain carries its own low-level module doc (§14).

---

## 10. Data & Events

- **PostgreSQL is authoritative** for all business state; **Redis** is cache, locks, and pub/sub only.
- **Domain events** decouple modules and drive async work via **BullMQ**.
- **Idempotency:** inbound webhooks are de-duplicated in a `webhook_events` table (dedupe key is per-provider); outbound calls carry deterministic keys.

Concrete schemas and event contracts live in `packages/database` and `packages/events` docs.

---

## 11. Cross-Cutting Concerns

- **Security:** webhook signature verification, RBAC on every action, encrypted credentials, GitHub App least privilege, AI/untrusted-input handling.
- **Multi-tenancy:** org-scoping enforced structurally; webhooks resolve `installation → organization` before any data access.
- **Observability:** a correlation ID threads webhook → job → API call → event → notification.
- **Testing:** unit (domain/state) · integration (repos/queues/webhooks) · E2E (full flow).

---

## 12. Scalability

- Stateless **API + workers scale horizontally**; PostgreSQL with read replicas + connection pooling; Redis pub/sub for SSE fan-out across API instances.
- Extract independent services (AI, repository indexing, webhook ingestion) **only when metrics demand it** — each has a defined trigger in the scalability notes.

---

## 13. Roadmap

- **MVP:** auth · org · connect Plane/GitHub/Slack/Calendar via the provider framework · work items · AI ticket generation · start work · branch + PR · AI PR review enforced as a GitHub check · reconciliation of out-of-band changes · Slack notifications · activity timeline.
- **Phase 2:** repository-aware AI, specs/plans/test-plans, smart reviewer recommendation.
- **Phase 3:** Jira/Linear/GitLab/Teams adapters, workflow automation, release/deploy, feature flags.
- **Phase 4:** incident management, org-wide analytics.

---

## 14. Documentation Model

Documentation is **layered and lives next to the code**. Each level links up to its parent and down to its children.

```text
project.md                     ← high-level architecture & product (this document)
├── apps/<app>/README.md       ← app purpose, structure, how to run, conventions
│   └── modules/<m>/*          ← low-level module docs: responsibilities, domain, API, events, decisions
└── packages/<pkg>/README.md   ← package purpose, public API, usage, conventions
```

- **`project.md`** stays high-level — it never absorbs module detail.
- **Every app and package** carries its own README/docs.
- **Apps are divided into modules**, and **each module owns a low-level doc**.
- We work **top-down**: solidify this document first, then flesh out app/package docs, then module docs — reviewing at each level before moving down.

---

## 15. Key Architectural Decisions

| Decision              | Choice                              | Why                                                     |
| --------------------- | ----------------------------------- | ------------------------------------------------------- |
| Backend architecture  | Modular monolith                    | Speed + clear boundaries; avoid premature microservices |
| Language              | TypeScript everywhere               | Shared types across the stack                           |
| HTTP framework        | Fastify                             | Lightweight, typed, integration-friendly                |
| Database / ORM        | PostgreSQL + Drizzle                | Relational workflow data with end-to-end type inference |
| Cache / jobs          | Redis + BullMQ                      | Fast state + reliable async processing                  |
| Integration model     | Ports & adapters + runtime registry | Swap/add any tool without touching business logic       |
| Integration set (MVP) | Plane · GitHub · Slack · Calendar   | One adapter per category; more added later unchanged    |
| Source control auth   | GitHub App                          | Scoped per-org permissions + Checks API                 |
| AI                    | Provider abstraction                | Avoid AI vendor lock-in                                 |
| Realtime              | SSE + Redis pub/sub                 | Server-driven updates, correct across API instances     |
| API                   | REST, versioned (`/api/v{n}`)       | Simple, explicit, evolvable                             |
