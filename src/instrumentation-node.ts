// Node.js-only startup: fail fast on invalid configuration (PLAN.md §9), then start the
// catalog sync scheduler (PLAN.md §5).
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

const { startCatalogScheduler } = await import('@/lib/catalog');
startCatalogScheduler();
