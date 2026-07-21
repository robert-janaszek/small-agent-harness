import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.system.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
