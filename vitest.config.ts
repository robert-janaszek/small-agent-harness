import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**', '**/*.system.test.ts'],
    setupFiles: ['./src/loadEnv.ts'],
  },
});
