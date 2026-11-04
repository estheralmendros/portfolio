import { describe, expect, it } from 'vitest';
import { SITE, SITE_URL, isSitemapPage } from '../../src/config/site';

describe('site config', () => {
  it('builds SITE_URL from origin + base', () => expect(SITE_URL).toBe('https://estheralmendros.github.io/portfolio'));
  it('targets the deploy workflow', () => expect(SITE.deployWorkflow).toBe('deploy.yml'));
});

describe('isSitemapPage', () => {
  it('drops the admin page', () => expect(isSitemapPage('https://estheralmendros.github.io/portfolio/admin/')).toBe(false));
  it('keeps a project slug starting with admin', () =>
    expect(isSitemapPage('https://estheralmendros.github.io/portfolio/projects/admin-dashboard/')).toBe(true));
  it('keeps the home page', () => expect(isSitemapPage('https://estheralmendros.github.io/portfolio/')).toBe(true));
});
