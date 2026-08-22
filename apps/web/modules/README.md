# Feature modules

Business logic and UI for a product area live here — not in generic `components/ui`.

Each module owns hooks, queries, forms, and feature-specific components. Routes in `app/` compose module exports.

| Module | Phase 1 scope (`phase-1.md` §8) |
| --- | --- |
| `dashboard/` | Developer dashboard — My Work (§32) |
| `work-items/` | List, detail, create, start work (§10.4, §15) |
| `projects/` | Projects and workflow config (§10.3) |
| `reviews/` | PR review experience (§33) |
| `integrations/` | Connect providers (§11a) |
| `activity/` | Activity timeline UI (§34) |
| `notifications/` | In-app notification surfaces |
