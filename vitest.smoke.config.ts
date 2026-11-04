import { defineConfig } from 'vitest/config';

// `npm run test:smoke`: structural checks over a built site. Reads process.env.SMOKE_DIR ?? 'dist'.
export default defineConfig({ test: { environment: 'node', include: ['tests/smoke/**/*.test.ts'] } });
