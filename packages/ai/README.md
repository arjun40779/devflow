# @devflow/ai

Provider-agnostic AI abstraction for the DevFlow platform (see
[`project.md`](../../project.md) §4, §8, §9). One `AiProvider` port; vendor
adapters (OpenAI, Anthropic, …) implement it — business logic never imports a
vendor SDK directly.

## Design

- **Platform-configured, not org-connected** (§8): unlike SourceControl/PM/Chat/Calendar, AI has no per-org OAuth, webhooks, or connection-health row. The provider (and its API key) is configured once at the platform level.
- **AI recommends, policy decides** (§3, §9): this package returns **severity-tagged findings**, never a merge/deploy decision. A separate, deterministic policy step (owned by the calling module, e.g. the AI Review Pipeline) maps findings → pass/fail. This package must never expose a "should this merge" boolean.
- **Structured output is always schema-validated.** Every provider call that returns structured data validates the response against a Zod schema before returning it to the caller — a malformed/hallucinated shape fails loudly, not silently.
- **Untrusted input boundary** (§9, §11): repository code, issue/PR descriptions, and comments are **untrusted context**. This package treats prompt inputs as data, never as instructions — it does not interpret model output as commands, and callers must not either.

## Folder structure

```text
packages/ai/
├── src/
│   ├── index.ts        # public exports
│   ├── provider.ts      # AiProvider port (interface all adapters implement)
│   ├── review.ts        # reviewCode() input/output contract + schema
│   ├── registry.ts       # resolve(providerKey) → configured AiProvider (composition edge only)
│   └── providers/
│       └── <vendor>/    # one adapter per vendor, e.g. openai/, anthropic/
├── package.json
├── tsconfig.json
└── README.md
```

## Public API (`AiProvider` port)

```ts
interface AiProvider {
  generateText(input: GenerateTextInput): Promise<string>;

  generateStructuredOutput<S extends z.ZodType>(
    input: GenerateStructuredInput<S>,
  ): Promise<z.infer<S>>; // validated against `input.schema` before returning

  reviewCode(input: ReviewCodeInput): Promise<CodeReviewResult>;

  // Phase 2 — repository intelligence; stubbed until then, not wired to a real embedding call
  generateEmbedding?(input: GenerateEmbeddingInput): Promise<number[]>;
}
```

Callers depend on `AiProvider` (the port), resolved once per process from
`registry.resolve(providerKey)` — the same "resolver, not service locator" rule
as the integration framework (§8): business modules take an `AiProvider`
instance, they don't call the registry themselves.

### `reviewCode` contract

```ts
interface ReviewCodeInput {
  repository: RepoRef;
  pullRequest: PullRequestRef;
  diff: string;
  projectRules?: string;
}

interface CodeReviewResult {
  summary: string;
  findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    file: string;
    line?: number;
    title: string;
    explanation: string;
    suggestion?: string;
  }>;
}
```

`CodeReviewResult` is the **entire** contract this package owns. Turning
`findings` into a GitHub Check conclusion is the AI Review Pipeline's job (§9)
— deliberately outside this package, so the policy (fail on `critical`/`high`,
by default) can change without touching the AI layer.

## MVP scope vs later (§13)

| Now (MVP)                                                | Later                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `generateText`, `generateStructuredOutput`, `reviewCode` | Repository-aware AI, embeddings, spec/plan generation, reviewer recommendation (Phase 2) |

`generateEmbedding` is declared in the port now (so the interface doesn't need
a breaking change later) but has no MVP caller.

## Non-goals

- No policy/gating logic (pass/fail decisions) — that's the caller's job (§9).
- No provider-specific prompt templates leaking into business modules — templates live inside each adapter.
- No direct execution of AI-suggested actions (merges, deploys, secret rotation, shell commands) — this package returns data, never performs side effects (§9, §11).

## Scripts

| Script      | Purpose                |
| ----------- | ---------------------- |
| `typecheck` | `tsc --noEmit`         |
| `test`      | Run Vitest             |
| `clean`     | Remove build artifacts |

> Not started yet — this document defines the contract; implementation (starting with one adapter, e.g. OpenAI or Anthropic) follows.
