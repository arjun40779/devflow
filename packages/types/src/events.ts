/** Envelope for every domain event published across modules (project.md §10). */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  id: string;
  type: TType;
  organizationId: string;
  aggregateId: string;
  occurredAt: string; // ISO 8601
  version: number;
  payload: TPayload;
}
