# @devflow/api

The DevFlow backend HTTP API — a **Fastify + TypeScript modular monolith** (see [`project.md`](../../project.md) §5, §9).

## Tech

| Concern     | Choice                                             |
| ----------- | -------------------------------------------------- |
| Runtime     | Node.js ≥ 20 (ESM)                                 |
| HTTP        | Fastify 5                                          |
| Validation  | Zod via `fastify-type-provider-zod`                |
| API docs    | OpenAPI (`@fastify/swagger`) + **Scalar** UI       |
| Database    | Drizzle ORM (lives in `packages/database`, Wave 0) |
| Logging     | Pino (built into Fastify)                          |
| Build / dev | `tsup` (bundle) / `tsx` (watch)                    |
| Tests       | Vitest                                             |

### Why Drizzle over Knex

Drizzle infers types end-to-end (schema → query → result), matching the shared-TypeScript-types goal (§40). Knex is an untyped query builder that would require hand-maintained types. Database access is **not** implemented in this app — it belongs in `packages/database` and is consumed here.

## Folder structure (module-oriented, §9)

Routes live **outside** the modules, grouped by API version: `routes/v<n>/<module>/{router,schema}`. Modules hold only the **service** and **dal** layers.

```text
apps/api/
├── src/
│   ├── config/            # env loading & validation (Zod)
│   ├── plugins/           # cross-cutting Fastify plugins (openapi, ...)
│   ├── routes/            # HTTP layer, versioned
│   │   ├── index.ts       # registerRoutes(): mounts each version behind its prefix
│   │   └── v1/
│   │       ├── index.ts   # v1Routes(): registers each module's router under /api/v1
│   │       └── health/
│   │           ├── router.ts   # HTTP route (calls the module service)
│   │           └── schema.ts   # Zod request/response schemas (versioned)
│   ├── modules/           # feature modules — business + data only
│   │   └── health/
│   │       ├── service/
│   │       │   └── health.service.ts  # business logic (uses dal)
│   │       ├── dal/
│   │       │   └── health.dal.ts      # data access layer
│   │       └── __tests__/
│   ├── app.ts             # buildApp(): assembles plugins + routes
│   └── server.ts          # entrypoint: listen + graceful shutdown
├── tsup.config.ts
├── vitest.config.ts
└── tsconfig.json
```

### Layering rules

- **route** (`routes/v<n>/<module>/router.ts` + `schema.ts`) — HTTP concerns only: schema, status codes, calls a service. Versioned, lives outside modules.
- **service** (`modules/<module>/service/*.service.ts`) — business logic; orchestrates the dal and ports. Framework-free; never depends on the route layer.
- **dal** (`modules/<module>/dal/*.dal.ts`) — data access; the only layer that talks to the database (Drizzle) or external stores.

Dependency direction is one-way: **route → service → dal**. Adding a new API version means adding `routes/v2/<module>/` plus a `routes/v2/index.ts` aggregator — existing versions and module services are untouched.

### Canonical domain module layout

`health` is intentionally lightweight. Real domain modules (e.g. `work-items`) follow the fuller layered pattern from `project.md` §9:

```text
modules/work-items/
├── domain/            # entities, value objects, state machine — no framework
├── application/       # use cases / services (orchestrate domain + ports)
├── infrastructure/    # repositories, external adapters (Drizzle, ports impls)
├── http/              # routes, controllers, request/response schemas
├── events/            # domain event publishers/handlers
└── __tests__/
```

Business logic depends on **ports**, never vendor SDKs (§3.8, §11a).

## Getting started

```bash
pnpm install                       # from repo root
cp apps/api/.env.example apps/api/.env
pnpm --filter @devflow/api dev
```

- API: `http://localhost:4000`
- Health: `GET http://localhost:4000/api/v1/health`
- **API docs (Scalar):** `http://localhost:4000/doc`
- OpenAPI JSON: `http://localhost:4000/openapi.json`

## Scripts

| Script      | Purpose                      |
| ----------- | ---------------------------- |
| `dev`       | Watch mode (`tsx`)           |
| `build`     | Bundle to `dist/` (`tsup`)   |
| `start`     | Run built server             |
| `typecheck` | `tsc --noEmit`               |
| `test`      | Run Vitest                   |
| `clean`     | Remove `dist/` and `.turbo/` |

## Environment

| Var         | Default     | Notes                             |
| ----------- | ----------- | --------------------------------- |
| `NODE_ENV`  | development | `development` enables pretty logs |
| `HOST`      | 0.0.0.0     |                                   |
| `PORT`      | 4000        |                                   |
| `LOG_LEVEL` | info        | pino levels                       |

## Adding a module

1. Create the business layers under `src/modules/<name>/`: `service/<name>.service.ts` and `dal/<name>.dal.ts`.
2. Create the HTTP layer under `src/routes/v1/<name>/`: `router.ts` and `schema.ts`.
3. Register the router in `src/routes/v1/index.ts`.
4. Add tests under the module's `__tests__/`.

See [`docs/api-docs-and-testing.md`](docs/api-docs-and-testing.md) for the API
documentation and testing conventions (required route fields, tags, and the
minimal/critical test checklist).
