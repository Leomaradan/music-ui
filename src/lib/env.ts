import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  SUBSONIC_URL: z.url({ protocol: /^https?$/ }),
  SUBSONIC_USER: z.string().min(1),
  SUBSONIC_PASSWORD: z.string().min(1),
  SUBSONIC_CLIENT_NAME: z.string().min(1).default('music-ui'),
  SUBSONIC_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(15),
  DATA_DIR: z.string().min(1).default('./data'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

/** Validates raw environment variables. Never includes secret values in the error. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings like missing values so `FOO=` falls back to defaults / "required".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Runtime configuration, parsed once from `process.env`. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
