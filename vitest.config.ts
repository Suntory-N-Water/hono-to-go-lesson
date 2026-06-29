import path from 'node:path';
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // wrangler の migrations_dir と一致させる
  const migrationsPath = path.join(__dirname, 'drizzle/migrations');
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ['./tests/setup.ts'],
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // TEST_MIGRATIONS としてバインドし setup から参照する
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
  };
});
