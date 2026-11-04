// Content-agnostic structural checks over a built site (SMOKE_DIR, default dist). Never asserts content values.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { siTypescript } from 'simple-icons';
import { mdiDatabase } from '@mdi/js';
import { isInternalUrlOk } from './internalUrl';

const DIR = path.resolve(process.env.SMOKE_DIR ?? 'dist');
const IS_FIXTURE_BUILD = path.basename(DIR) === 'dist-test';
const ORIGIN = 'https://estheralmendros.github.io';

export const PUBLIC_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; manifest-src 'self'";
export const ADMIN_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; font-src 'self'; connect-src https://api.github.com; base-uri 'none'; form-action 'none'; object-src 'none'; manifest-src 'self'";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const read = (rel: string) => readFileSync(path.join(DIR, rel), 'utf8');
const decode = (v: string) => v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const head = (html: string) => /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
const firstHeadChild = (html: string) => /^\s*(<[^>]+>)/.exec(head(html))?.[1] ?? '';
const scripts = (html: string) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1] ?? '', body: m[2] ?? '' }));

/** The admin entry module(s) plus every chunk they import (static or dynamic), as file paths. */
function adminBundle(): string[] {
  const seen = new Set<string>();
  const queue = scripts(read('admin/index.html'))
    .map((s) => /\ssrc="([^"]+)"/.exec(s.attrs)?.[1] ?? '')
    .filter((src) => src.startsWith('/portfolio/_astro/'))
    .map((src) => path.join(DIR, src.replace(/^\/portfolio\//, '')));
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(/["'`](\.{1,2}\/[\w./-]+\.js)["'`]/g)) queue.push(path.resolve(path.dirname(file), m[1]!));
  }
  return [...seen];
}

function pageUrl(file: string): string {
  const rel = path.relative(DIR, file).split(path.sep).join('/');
  return `${ORIGIN}/portfolio/${rel.replace(/index\.html$/, '')}`;
}

describe(`smoke: ${path.relative(process.cwd(), DIR) || DIR}`, () => {
  it('build directory exists', () => expect(existsSync(DIR), `${DIR} missing; run the build first`).toBe(true));

  const htmlFiles = existsSync(DIR) ? walk(DIR).filter((f) => f.endsWith('.html')) : [];
  const detailPages = existsSync(path.join(DIR, 'projects'))
    ? readdirSync(path.join(DIR, 'projects')).map((d) => `projects/${d}/index.html`).filter((f) => existsSync(path.join(DIR, f)))
    : [];
  const publicPages = ['index.html', '404.html', ...detailPages];

  it('has index.html, 404.html and admin/index.html', () => {
    for (const f of ['index.html', '404.html', 'admin/index.html']) expect(existsSync(path.join(DIR, f)), f).toBe(true);
  });

  if (IS_FIXTURE_BUILD) {
    it('fixture build has at least one project detail page', () => expect(detailPages.length).toBeGreaterThan(0));
  }

  it('every internal href/src resolves under /portfolio/', () => {
    const failures: string[] = [];
    for (const file of htmlFiles) {
      const html = readFileSync(file, 'utf8');
      for (const m of html.matchAll(/\s(?:href|src)\s*=\s*"([^"]*)"/gi)) {
        const value = decode(m[1] ?? '');
        if (isInternalUrlOk(value, pageUrl(file)) === 'fail') failures.push(`${path.relative(DIR, file)}: ${value}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(publicPages)('%s: public CSP is the first head child; no inline scripts or style attributes', (rel) => {
    const html = read(rel);
    expect(firstHeadChild(html)).toBe(`<meta http-equiv="Content-Security-Policy" content="${PUBLIC_CSP}">`);
    for (const s of scripts(html)) expect(s.attrs, `inline script in ${rel}`).toMatch(/\ssrc=/);
    expect(html).not.toMatch(/\sstyle\s*=/i);
  });

  it.each(publicPages)('%s: no link to the admin', (rel) => {
    const hrefs = [...read(rel).matchAll(/\shref="([^"]*)"/g)].map((m) => decode(m[1] ?? ''));
    expect(hrefs.filter((h) => h === '/portfolio/admin' || h.startsWith('/portfolio/admin/'))).toEqual([]);
  });

  it('admin: CSP first, noindex, referrer, no inline scripts or style attributes', () => {
    const html = read('admin/index.html');
    expect(firstHeadChild(html)).toBe(`<meta http-equiv="Content-Security-Policy" content="${ADMIN_CSP}">`);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('<meta name="referrer" content="no-referrer">');
    expect(html).toContain('<div id="admin-root">');
    for (const s of scripts(html)) expect(s.attrs).toMatch(/\ssrc=/);
    expect(html).not.toMatch(/\sstyle\s*=/i);
  });

  it.each(['index.html', 'admin/index.html', ...detailPages.slice(0, 1)])('%s: theme-init is a blocking script before any stylesheet', (rel) => {
    const h = head(read(rel));
    const tag = /<script\b[^>]*src="\/portfolio\/theme-init\.js"[^>]*>/.exec(h);
    expect(tag).not.toBeNull();
    expect(tag![0]).toBe('<script src="/portfolio/theme-init.js">');
    const css = h.search(/<link[^>]+rel="stylesheet"/);
    expect(css === -1 || tag!.index < css).toBe(true);
  });

  it.each(['index.html', ...detailPages.slice(0, 1)])('%s: SEO tags with absolute og:image', (rel) => {
    const html = read(rel);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]+">/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/estheralmendros\.github\.io\/portfolio\/[^"]*">/);
    for (const p of ['og:title', 'og:description', 'og:url', 'og:type']) expect(html).toContain(`property="${p}"`);
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/[^"]+">/);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<html lang="en"');
    expect(html).not.toContain('<meta name="robots"');
  });

  it.each(publicPages)('%s: og:image and twitter:image carry a non-empty alt', (rel) => {
    const html = read(rel);
    expect(html).toMatch(/<meta property="og:image:alt" content="[^"]+">/);
    expect(html).toMatch(/<meta name="twitter:image:alt" content="[^"]+">/);
  });

  it('404.html: noindex instead of a canonical URL', () => {
    const html = read('404.html');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:url"');
  });

  it.each(publicPages)('%s: og:image is absolute, never a raw upload path; width/height come together', (rel) => {
    const html = read(rel);
    expect(html).not.toContain('src/assets/uploads');
    const og = /<meta property="og:image" content="([^"]+)">/.exec(html)?.[1];
    expect(og).toMatch(/^https:\/\//);
    expect(html.includes('property="og:image:width"')).toBe(html.includes('property="og:image:height"'));
  });

  it('index.html: the project filter (always in the fixture build) is hidden by default and wired by an external module', () => {
    const html = read('index.html');
    const filter = /<div\b[^>]*data-project-filter[^>]*>/.exec(html)?.[0];
    // Fixture projects have tags, so the filter must render there; real content may legitimately have none.
    if (IS_FIXTURE_BUILD) expect(filter, 'project filter missing from the fixture build').toBeDefined();
    if (!filter) return;
    expect(filter).toMatch(/\shidden(=""|\s|>)/);
    expect(filter).toContain('role="group"');
    expect(scripts(html).some((s) => /type="module"/.test(s.attrs) && /\ssrc="\/portfolio\/_astro\/[^"]+\.js"/.test(s.attrs))).toBe(true);
  });

  if (IS_FIXTURE_BUILD) {
    it('fixture build: an uploaded project image is an optimized WebP; its detail og:image is absolute with size', () => {
      expect(read('index.html')).toMatch(/<img [^>]*src="\/portfolio\/_astro\/[^"]+\.webp"/);
      const withUpload = detailPages.map(read).filter((h) => /property="og:image" content="https:\/\/estheralmendros\.github\.io\/portfolio\/_astro\/[^"]+\.webp"/.test(h));
      expect(withUpload.length).toBeGreaterThan(0);
      for (const h of withUpload) {
        expect(h).toMatch(/<meta property="og:image:width" content="\d+">/);
        expect(h).toMatch(/<meta property="og:image:height" content="\d+">/);
      }
    });
  }

  it('admin bundle has no simple-icons data and no upload-glob references (R15)', () => {
    const files = adminBundle();
    expect(files.length).toBeGreaterThan(0);
    const iconPath = siTypescript.path.slice(0, 40);
    for (const f of files) {
      const js = readFileSync(f, 'utf8');
      expect(js, path.relative(DIR, f)).not.toContain(iconPath);
      expect(js, path.relative(DIR, f)).not.toContain(mdiDatabase.slice(0, 40));
      expect(js, path.relative(DIR, f)).not.toMatch(/slug:\s*"typescript"|"slug":\s*"typescript"/);
      expect(js, path.relative(DIR, f)).not.toContain('/src/assets/uploads/');
      expect(js, path.relative(DIR, f)).not.toContain('fixture-000000');
    }
  });

  if (!IS_FIXTURE_BUILD) {
    it('real build ships no test-fixture upload images (they live in tests/fixtures/uploads)', () => {
      const leaked = walk(DIR).map((f) => path.relative(DIR, f)).filter((f) => /(^|\/)fixture-[0-9a-f]{6}\./.test(f));
      expect(leaked).toEqual([]);
    });
  }

  it('sitemap exists and excludes the admin', () => {
    expect(existsSync(path.join(DIR, 'sitemap-index.xml'))).toBe(true);
    const urls = walk(DIR)
      .filter((f) => /sitemap-\d+\.xml$/.test(f))
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => u.startsWith(`${ORIGIN}/portfolio/admin/`))).toEqual([]);
  });

  it('robots.txt disallows the admin and points to the sitemap', () => {
    const robots = read('robots.txt');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Disallow: /portfolio/admin/');
    expect(robots).toContain('Sitemap: https://estheralmendros.github.io/portfolio/sitemap-index.xml');
  });
});
