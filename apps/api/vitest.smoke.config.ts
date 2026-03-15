import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/smoke.test.ts'],
    pool: 'forks',
    testTimeout: 30000,
  },
});
