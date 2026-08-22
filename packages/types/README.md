# @devflow/types

Shared, framework-free **domain types** for the DevFlow monorepo (see
[`project.md`](../../project.md) §6). Zero runtime dependencies.

## Contents

| Module   | Exports                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------- |
| `ids`    | `Brand<T,B>` helper + branded ids (`OrganizationId`, `UserId`, …)                                         |
| `enums`  | Canonical enum arrays + derived union types (`Role`, `WorkItemStatus`, `Priority`, `IntegrationCategory`) |
| `events` | `DomainEvent<Type, Payload>` envelope                                                                     |

## Source of truth

Enum values are declared once here as `as const` arrays. `@devflow/validation`
builds its Zod schemas from these arrays, so runtime validation and compile-time
types never drift.

```ts
import { ROLES, type Role } from '@devflow/types';
// ROLES  → readonly ['owner','admin','developer','reviewer','viewer']
// Role   → 'owner' | 'admin' | 'developer' | 'reviewer' | 'viewer'
```

## Package relationships

|                 |                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Depends on**  | _(none)_ — zero runtime dependencies, zero internal `@devflow/*` dependencies                                                                                                                |
| **Consumed by** | `@devflow/validation` (builds Zod schemas from these enum arrays). Not yet imported by an app directly — domain modules (Wave 1+) will use branded ids and enums for request/response types. |
