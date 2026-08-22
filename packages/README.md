# Shared packages live here

Internal libraries consumed by apps are added in later phases (see `phase-1.md`):

- Foundation (Wave 0): `config`, `database`, `types`, `validation`, `events`, `queue`, `observability`, `ui`
- Integrations (Wave 2): `integrations/*` (provider framework + adapters, see `project.md` §11a)
- AI (Wave 4): `ai`

Each package is its own pnpm workspace package under `packages/*`.
