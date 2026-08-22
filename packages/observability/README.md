# @devflow/observability

Structured logging, correlation IDs, and tracing primitives for the DevFlow
monorepo (see [`project.md`](../../project.md) §11). Shared by `api` and `worker`
so one correlation id threads a request from webhook → job → API call → event.

## Contents

| Module    | Exports                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| `logger`  | `createLogger(options)` — Pino logger that auto-attaches the correlation id                   |
| `context` | `runWithCorrelationId`, `getCorrelationId`, `generateCorrelationId` (via `AsyncLocalStorage`) |
| `tracing` | `getTracer(name)`, `withSpan(tracer, name, fn)` (OpenTelemetry API)                           |

## Design

- **Library, not config:** `createLogger` takes options (name, level, pretty) — the app passes `env.LOG_LEVEL`; this package never reads `process.env`.
- **Correlation everywhere:** wrap a unit of work in `runWithCorrelationId(id, fn)` and every log line inside it carries `correlationId` automatically.
- **Tracing is API-only here:** exporter/SDK (OTLP, sampler) wiring lives in the host app; this package exposes the tracing primitives so business code stays vendor-neutral.

## Usage

```ts
import { createLogger, runWithCorrelationId, generateCorrelationId } from '@devflow/observability';

const logger = createLogger({ name: 'api', level: 'info', pretty: true });

runWithCorrelationId(generateCorrelationId(), () => {
  logger.info('handling request'); // includes correlationId
});
```

> Pretty output requires the host app to provide `pino-pretty`.

## Scripts

| Script      | Purpose                |
| ----------- | ---------------------- |
| `typecheck` | `tsc --noEmit`         |
| `test`      | Run Vitest             |
| `clean`     | Remove build artifacts |
