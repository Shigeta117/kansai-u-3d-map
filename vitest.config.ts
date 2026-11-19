import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@kansai-u-3d/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/core/src/**/*.test.ts',
      'apps/guide/src/**/*.test.ts',
      'apps/lite/src/**/*.test.ts',
    ],
  },
});

