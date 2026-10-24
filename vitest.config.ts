import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

process.env.XDG_CONFIG_HOME ??= `${process.cwd()}/.wrangler`;
process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
          BETTER_AUTH_SECRET: 'isolated-worker-test-secret-at-least-32-characters',
        },
      },
    }),
  ],
  test: {
    include: ['tests/worker/**/*.test.ts'],
    setupFiles: ['./tests/worker/setup.ts'],
    testTimeout: 15000,
  },
}));
