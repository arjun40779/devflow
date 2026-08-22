import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils/cn';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', false, 'b')).toBe('a b');
  });
});
