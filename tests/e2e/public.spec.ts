import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isInternalUrlOk } from '../smoke/internalUrl';

// All assertions use tests/fixtures/content values (the site under test is dist-test/).
const ORIGIN = 'https://estheralmendros.github.io';

test.describe('home page', () => {
  test('renders every section from fixture content in order', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Person' })).toBeVisible();
    const ids = await page.locator('main > section[id]').evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(['about', 'projects', 'stack', 'certifications', 'journey', 'contact']);
    const nav = page.getByRole('navigation', { name: 'Sections', exact: true });
    await expect(nav.getByRole('link')).toHaveText(['About', 'Projects', 'Stack', 'Certifications', 'Journey', 'Contact']);
    await expect(page.getByText('Available for freelance')).toBeVisible();
    // The year is baked in at build time: accept the previous UTC year too (build:test may predate a New Year).
    const year = new Date().getUTCFullYear();
    await expect(page.getByText(new RegExp(`^© (${year}|${year - 1}) Fixture Person`))).toBeVisible();
  });

  test('featured projects first, then more projects', async ({ page }) => {
    await page.goto('./');
    const featured = page.getByRole('region', { name: 'Featured' });
    await expect(featured.getByRole('heading', { level: 4 })).toHaveText(['Fixture Alpha', 'Fixture Admin Dashboard']);
    await expect(page.getByRole('region', { name: 'More projects' }).getByRole('heading', { level: 4 })).toHaveText(['Fixture Gamma']);
    await expect(page.getByRole('link', { name: /Read more/ })).toHaveCount(2);
  });

  test('stack, certifications and journey details', async ({ page }) => {
    await page.goto('./');
    const stack = page.locator('#stack');
    await expect(stack.getByRole('heading', { level: 3 })).toHaveText(['Languages', 'Frameworks', 'Tools']);
    await expect(stack.getByText('Fi', { exact: true })).toBeAttached(); // unknown icon -> initials
    await expect(page.locator('#certifications').getByText('Expired', { exact: true })).toHaveCount(1);
    await expect(page.locator('#journey').getByText('Jan 2022 – Present')).toBeVisible();
  });

  test('no public page links to the admin', async ({ page }) => {
    await page.goto('./');
    const hrefs = await page.locator('[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
    expect(hrefs.filter((h) => h === '/portfolio/admin' || h.startsWith('/portfolio/admin/'))).toEqual([]);
  });

  test('the header link for the section in the URL hash is marked current with an accent ring', async ({ page }) => {
    await page.goto('./#about');
    const nav = page.getByRole('navigation', { name: 'Sections', exact: true });
    const about = nav.getByRole('link', { name: 'About' });
    const projects = nav.getByRole('link', { name: 'Projects' });
    await expect(about).toHaveAttribute('aria-current', 'location');
    await expect(nav.locator('[aria-current]')).toHaveCount(1);
    const ring = (l: typeof about) => l.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(await ring(about)).not.toBe('none');
    expect(await ring(projects)).toBe('none');
    await projects.click();
    await expect(page).toHaveURL(/#projects$/);
    await expect(projects).toHaveAttribute('aria-current', 'location');
    await expect(about).not.toHaveAttribute('aria-current', /.*/);
    await page.goto('./');
    await expect(nav.locator('[aria-current]')).toHaveCount(0);
  });

  test('mobile: nav collapses to a Menu disclosure', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('./');
    await expect(page.getByRole('navigation', { name: 'Sections', exact: true })).toBeHidden();
    await page.getByText('Menu', { exact: true }).click();
    await page.getByRole('navigation', { name: 'Sections (mobile)' }).getByRole('link', { name: 'Journey' }).click();
    await expect(page).toHaveURL(/#journey$/);
  });
});

test.describe('project technology filter', () => {
  const cards = (page: Page) => page.locator('#projects [data-project-card]');
  const filter = (page: Page) => page.getByRole('group', { name: 'Filter projects by technology' });

  test('chips sit after the Projects heading and before the first group, sorted, All first', async ({ page }) => {
    await page.goto('./');
    await expect(filter(page)).toBeVisible();
    await expect(filter(page).getByRole('button')).toHaveText(['All', 'Astro', 'C|D', 'React', 'Testing']);
    const order = await page.locator('#projects > *').evaluateAll((els) =>
      els.map((e) => (e.tagName === 'H2' ? 'h2' : e.hasAttribute('data-project-filter') ? 'filter' : e.getAttribute('data-project-group') ?? e.tagName)),
    );
    expect(order.slice(0, 2)).toEqual(['h2', 'filter']);
    expect(order.indexOf('filter')).toBeLessThan(order.indexOf('featured'));
  });

  test('selecting a tag filters cards, updates aria-pressed, live region and group headings; re-click and All reset', async ({ page }) => {
    await page.goto('./');
    const status = page.locator('[data-project-filter-status]');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(cards(page)).toHaveCount(3);

    await filter(page).getByRole('button', { name: 'react' }).click();
    await expect(filter(page).getByRole('button', { name: 'React' })).toHaveAttribute('aria-pressed', 'true');
    await expect(filter(page).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('heading', { level: 4, name: 'Fixture Admin Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'Fixture Alpha' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 3, name: 'More projects' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 3, name: 'Featured' })).toBeVisible();
    await expect(status).toHaveText('Showing 1 of 3 projects');

    await filter(page).getByRole('button', { name: 'React' }).click(); // re-click resets
    await expect(cards(page).filter({ visible: true })).toHaveCount(3);
    await expect(filter(page).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await expect(status).toHaveText('Showing 3 of 3 projects');

    await filter(page).getByRole('button', { name: 'Testing' }).click();
    await expect(cards(page).filter({ visible: true })).toHaveCount(1);
    await filter(page).getByRole('button', { name: 'All' }).click();
    await expect(cards(page).filter({ visible: true })).toHaveCount(3);
    await expect(page.getByRole('heading', { level: 3, name: 'More projects' })).toBeVisible();
  });

  test('a tag containing | filters correctly (data-tags is a JSON array)', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('[data-project-card]', { hasText: 'Fixture Admin Dashboard' })).toHaveAttribute('data-tags', '["react","c|d"]');
    await filter(page).getByRole('button', { name: 'C|D' }).click();
    await expect(cards(page).filter({ visible: true })).toHaveCount(1);
    await expect(cards(page).filter({ visible: true })).toContainText('Fixture Admin Dashboard');
    await expect(page.locator('[data-project-filter-status]')).toHaveText('Showing 1 of 3 projects');
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('all project cards are visible and no chips are shown', async ({ page }) => {
      await page.goto('./');
      await expect(cards(page)).toHaveCount(3);
      for (const card of await cards(page).all()) await expect(card).toBeVisible();
      await expect(page.locator('[data-project-filter]')).toBeHidden();
      await expect(page.getByRole('button', { name: 'All' })).toHaveCount(0);
    });
  });
});

test.describe('uploaded images', () => {
  test('an uploaded project image is served as an optimized WebP under /portfolio/_astro/', async ({ page, request }) => {
    await page.goto('./');
    const img = page.getByRole('img', { name: 'Fixture admin dashboard screenshot' });
    await expect(img).toHaveAttribute('src', /^\/portfolio\/_astro\/[^/]+\.webp$/);
    const res = await request.get((await img.getAttribute('src'))!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/webp');
  });

  test('detail og:image for an upload is the absolute 1200px WebP with its size', async ({ page }) => {
    await page.goto('projects/admin-dashboard/');
    const og = page.locator('meta[property="og:image"]');
    await expect(og).toHaveAttribute('content', /^https:\/\/estheralmendros\.github\.io\/portfolio\/_astro\/[^/]+\.webp$/);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', /^\d+$/);
    expect(await page.content()).not.toContain('src/assets/uploads');
    await expect(page.getByRole('img', { name: 'Fixture admin dashboard screenshot' })).toHaveAttribute('src', /^\/portfolio\/_astro\/[^/]+\.webp$/);
  });

  test('/path images keep the MVP og:image (no size)', async ({ page }) => {
    await page.goto('projects/fixture-alpha/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${ORIGIN}/portfolio/og-image.png`);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveCount(0);
  });
});

test('Download CV link is based and has the download attribute', async ({ page }) => {
  await page.goto('./');
  const cv = page.getByRole('link', { name: 'Download CV' });
  await expect(cv).toHaveAttribute('href', '/portfolio/docs/fixture-cv.pdf');
  await expect(cv).toHaveAttribute('download', '');
});

test.describe('project detail', () => {
  test('renders Markdown safely with base-path URLs', async ({ page }) => {
    await page.goto('projects/fixture-alpha/');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Alpha' })).toBeVisible();
    await expect(page.getByRole('link', { name: '← All projects' })).toHaveAttribute('href', '/portfolio/#projects');
    const prose = page.locator('.prose');
    await expect(prose.getByRole('link', { name: 'a', exact: true })).toHaveAttribute('href', '/portfolio/abs');
    await expect(prose.getByRole('link', { name: 'b', exact: true })).toHaveAttribute('href', '#frag');
    await expect(prose.getByRole('link', { name: 'c', exact: true })).toHaveAttribute('href', './rel');
    await expect(prose.locator('img')).toHaveAttribute('src', '/portfolio/og-image.png');
    await expect(prose).toContainText("<script>alert('x')</script>");
    expect(await prose.locator('script').count()).toBe(0);
    await expect(prose.getByText('bad', { exact: true })).toBeVisible();
    expect(await prose.locator('a', { hasText: 'bad' }).count()).toBe(0);
    await expect(page.getByRole('link', { name: /View repository/ })).toHaveAttribute('target', '_blank');
  });

  test('projects without a description have no detail page', async ({ page }) => {
    const res = await page.goto('projects/fixture-gamma/');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});

async function rawUrls(page: Page): Promise<string[]> {
  // getAttribute (raw values), never the resolved href/src properties.
  return page.locator('[href], [src]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? e.getAttribute('src') ?? ''));
}

test('every href/src on home and detail pages stays under /portfolio/', async ({ page }) => {
  await page.goto('./');
  const detailLinks = await page.locator('a[href*="/projects/"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href')!))]);
  expect(detailLinks.length).toBeGreaterThan(0);
  const failures: string[] = [];
  for (const target of ['/portfolio/', ...detailLinks]) {
    await page.goto(target);
    const pageUrl = `${ORIGIN}${new URL(page.url()).pathname}`;
    for (const v of await rawUrls(page)) if (isInternalUrlOk(v, pageUrl) === 'fail') failures.push(`${target}: ${v}`);
  }
  expect(failures).toEqual([]);
});

test.describe('theme', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${scheme} OS preference`, () => {
      test.use({ colorScheme: scheme });
      test('first paint matches prefers-color-scheme and is set before the body renders', async ({ page }) => {
        await page.addInitScript(() => {
          const w = window as unknown as { __themeAtBody?: string | null; __themeAtDCL?: string | null };
          new MutationObserver((_, obs) => {
            if (document.body) {
              w.__themeAtBody = document.documentElement.getAttribute('data-theme');
              obs.disconnect();
            }
          }).observe(document, { childList: true, subtree: true });
          document.addEventListener('DOMContentLoaded', () => {
            w.__themeAtDCL = document.documentElement.getAttribute('data-theme');
          });
        });
        await page.goto('./');
        const seen = await page.evaluate(() => {
          const w = window as unknown as { __themeAtBody?: string | null; __themeAtDCL?: string | null };
          return [w.__themeAtBody, w.__themeAtDCL];
        });
        expect(seen).toEqual([scheme, scheme]);
      });
    });
  }

  test('toggle persists across reload under portfolio.theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('./');
    const toggle = page.getByRole('button', { name: 'Switch to dark theme' });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('portfolio.theme'))).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  });

  test('follows OS changes live without a stored preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const path of ['./', 'projects/fixture-alpha/', 'admin/']) {
      test(`axe: ${path} in ${scheme} theme has no serious/critical violations`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        if (path === 'admin/') await page.getByLabel('GitHub fine-grained token').waitFor();
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }
  }

  test('keyboard: interactive elements are reachable with a visible focus ring', async ({ page }) => {
    await page.goto('./');
    const seen = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return { key: `${el.tagName}:${el.getAttribute('href') ?? el.textContent?.trim()}`, outline: style.outlineStyle, width: style.outlineWidth, tag: el.tagName };
      });
      if (!info) continue;
      expect(['A', 'BUTTON', 'SUMMARY', 'INPUT']).toContain(info.tag);
      expect(info.outline, info.key).toBe('solid');
      expect(info.width).toBe('2px');
      seen.add(info.key);
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});

test.describe('SEO and crawl files', () => {
  test('home and detail pages carry SEO tags', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveTitle('Fixture Person — Fixture Engineer');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGIN}/portfolio/`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${ORIGIN}/portfolio/og-image.png`);
    await page.goto('projects/fixture-alpha/');
    await expect(page).toHaveTitle('Fixture Alpha — Fixture Person');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Featured fixture project with a Markdown description.');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${ORIGIN}/portfolio/projects/fixture-alpha/`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${ORIGIN}/portfolio/og-image.png`);
  });

  test('sitemap keeps admin-dashboard and drops the admin page; robots.txt', async ({ request }) => {
    const index = await (await request.get('sitemap-index.xml')).text();
    expect(index).toContain(`${ORIGIN}/portfolio/sitemap-0.xml`);
    const sitemap = await (await request.get('sitemap-0.xml')).text();
    expect(sitemap).toContain(`${ORIGIN}/portfolio/projects/admin-dashboard/`);
    expect(sitemap).not.toContain(`${ORIGIN}/portfolio/admin/`);
    const robots = await (await request.get('robots.txt')).text();
    expect(robots).toContain('Disallow: /portfolio/admin/');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/portfolio/sitemap-index.xml`);
  });

  test('admin markup has CSP and noindex', async ({ page }) => {
    await page.goto('admin/');
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src https:\/\/api\.github\.com/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  });
});

test('no CSP violations or console errors on public and admin pages', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  for (const p of ['./', 'projects/fixture-alpha/', 'admin/']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
  }
  await expect(page.getByLabel('GitHub fine-grained token')).toBeVisible();
  expect(problems).toEqual([]);
});
