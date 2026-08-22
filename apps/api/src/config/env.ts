import 'dotenv/config';
import { z, createEnv, sharedEnv } from '@devflow/config';

const envSchema = z.object({
  NODE_ENV: sharedEnv.nodeEnv(),
  HOST: sharedEnv.host(),
  PORT: sharedEnv.port(4000),
  LOG_LEVEL: sharedEnv.logLevel(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = createEnv(envSchema);
