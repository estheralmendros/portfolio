export const SITE = {
  owner: 'estheralmendros',
  repo: 'portfolio',
  branch: 'main',
  origin: 'https://estheralmendros.github.io',
  base: '/portfolio',
  deployWorkflow: 'deploy.yml',
  defaultOgImage: '/og-image.png',
} as const;

export const SITE_URL = `${SITE.origin}${SITE.base}`;

/** Sitemap filter: prefix match, so project slugs that start with "admin" are kept. */
export const isSitemapPage = (url: string): boolean => !url.startsWith(`${SITE_URL}/admin/`);
