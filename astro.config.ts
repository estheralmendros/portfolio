import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SITE, isSitemapPage } from './src/config/site';

const contentDir = process.env.CONTENT_DIR ?? 'content';
const root = fileURLToPath(new URL('.', import.meta.url));
// Upload images that only the fixture content references live in tests/fixtures/uploads and are globbed
// (src/lib/images.ts) only for CONTENT_DIR builds; real builds point the alias back at the real uploads.
const extraUploadsDir = process.env.CONTENT_DIR ? 'tests/fixtures/uploads' : 'src/assets/uploads';

export default defineConfig({
  site: SITE.origin,
  base: SITE.base,
  output: 'static',
  outDir: process.env.CONTENT_DIR ? './dist-test' : './dist',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'never' },
  integrations: [react(), sitemap({ filter: isSitemapPage })],
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
    resolve: {
      alias: {
        '@content': path.resolve(root, contentDir),
        '@extra-uploads': path.resolve(root, extraUploadsDir),
      },
    },
  },
});
