import 'dotenv/config';
import { z, createEnv, sharedEnv } from '@devflow/config';

const DEFAULT_PORT = 4000;
const DEFAULT_HOST = 'localhost';
const DEFAULT_HOMEPAGE_URL = `http://localhost:3000`;
const DEFAULT_CALLBACK_URL = `${DEFAULT_HOMEPAGE_URL}/api/v1/auth/github/callback`;

const envSchema = z.object({
  NODE_ENV: sharedEnv.nodeEnv(),
  HOST: sharedEnv.host(DEFAULT_HOST),
  PORT: sharedEnv.port(DEFAULT_PORT),
  LOG_LEVEL: sharedEnv.logLevel(),
  DATABASE_URL: sharedEnv.requiredString(),
  REDIS_URL: sharedEnv.requiredString(),
  GITHUB_OAUTH_CLIENT_ID: sharedEnv.requiredString(),
  GITHUB_OAUTH_CLIENT_SECRET: sharedEnv.requiredString(),
  GITHUB_OAUTH_CALLBACK_URL: sharedEnv.url().default(DEFAULT_CALLBACK_URL),
  WEB_APP_URL: sharedEnv.url().default(DEFAULT_HOMEPAGE_URL),
  SESSION_COOKIE_SECRET: z.string().min(32),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_REFRESH_THRESHOLD_DAYS: z.coerce.number().int().positive().default(7),
  OAUTH_STATE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  // Base64-encoded 32-byte key; decoded/length-validated by parseCredentialsKey() at use (@devflow/integrations-core).
  INTEGRATION_CREDENTIALS_KEY: sharedEnv.requiredString(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = createEnv(envSchema);
