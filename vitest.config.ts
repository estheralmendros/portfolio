import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

// `npm test`: unit (node) + component (jsdom) only. Smoke and e2e have their own runners.
export default defineConfig({
  resolve: {
    alias: {
      '@content': path.resolve(root, process.env.CONTENT_DIR ?? 'content'),
      'astro:assets': path.resolve(root, 'tests/mocks/astroAssets.ts'),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.tsx'],
          setupFiles: ['tests/component/setup.ts'],
        },
      },
    ],
    exclude: ['tests/e2e/**', 'tests/smoke/**', 'node_modules/**', 'dist/**', 'dist-test/**'],
  },
});
