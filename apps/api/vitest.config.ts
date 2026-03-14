import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        // Provide JWT_SECRET for tests (it's a secret in prod, but we supply it here)
        bindings: { JWT_SECRET: 'test-secret-for-vitest' },
      },
    }),
  ],
  test: {
    setupFiles: ['./tests/helpers/setup.ts'],
  },
});
