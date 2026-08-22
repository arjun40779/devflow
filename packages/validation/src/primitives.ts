import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email();

/** Lowercase kebab-case slug (e.g. an org or project slug). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase kebab-case slug');
