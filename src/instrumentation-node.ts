// Node.js-only startup checks: fail fast on invalid configuration (PLAN.md §9).
import { EnvError, getEnv } from '@/lib/env';

try {
  getEnv();
} catch (error) {
  if (error instanceof EnvError) {
    console.error(`${error.message}\nSee .env.example for the expected variables.`);
    process.exit(1);
  }
  throw error;
}
