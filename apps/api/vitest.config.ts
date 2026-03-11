import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Provide JWT_SECRET for tests (it's a secret in prod, but we supply it here)
          bindings: { JWT_SECRET: 'test-secret-for-vitest' },
        },
      },
    },
    setupFiles: ['./tests/helpers/setup.ts'],
  },
});
