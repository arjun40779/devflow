/**
 * Deterministic, namespace-scoped job id for enqueue-level deduplication.
 * Stable across retries; must not include transient data (timestamps/random).
 */
export function jobId(namespace: string, id: string): string {
  return `${namespace}:${id}`;
}
