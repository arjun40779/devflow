import { describe, expect, it } from 'vitest';
import { roleSchema, prioritySchema, slugSchema, uuidSchema } from '../index';

describe('validation schemas', () => {
  it('accepts a valid role and rejects an unknown one', () => {
    expect(roleSchema.parse('admin')).toBe('admin');
    expect(roleSchema.safeParse('superadmin').success).toBe(false);
  });

  it('accepts a valid priority', () => {
    expect(prioritySchema.parse('urgent')).toBe('urgent');
  });

  it('validates slugs', () => {
    expect(slugSchema.safeParse('devflow-core').success).toBe(true);
    expect(slugSchema.safeParse('Not A Slug').success).toBe(false);
  });

  it('validates uuids', () => {
    expect(uuidSchema.safeParse('3f333df6-90a4-4fda-8dd3-9485d27cee36').success).toBe(true);
    expect(uuidSchema.safeParse('nope').success).toBe(false);
  });
});
