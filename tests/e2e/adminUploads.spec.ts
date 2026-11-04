// prd2 Features 3, 4 and the multi-file save path end to end, with the real browser codec (canvas in Chromium).
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { Certification, Profile, Project } from '../../src/content/schema';
import { CONTENTS_DEFAULT_MAX_BYTES, type FakeGitHub } from './fixtures/fakeGitHub';
import { REPO_PATH, chooseFile, headJson, image, loggedIn, openTab, putJson, readImage, seededGitHub, trackExternalRequests, treePaths } from './fixtures/admin';

const UPLOAD_RE = /^src\/assets\/uploads\/(projects|profile|certifications)\/[a-z0-9-]+-[0-9a-f]{6}\.(jpg|png|webp)$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const NEW_IMAGE = 'New image selected — saved with this entry';
const SAVED_WITH_IMAGE = 'Saved. The new image appears on the site after the next deploy (a few minutes).';
const SAVE_FAILED = "Couldn't save. Check your connection and try again.";
const CONFLICT = 'Content changed elsewhere — reload to get the latest version.';
const IMAGE_NOT_UPLOADED = '(Your selected image was not uploaded.)';
const SVG_UNREADABLE = "Couldn't read this SVG. Use a PNG instead.";

let gh: FakeGitHub;
let external: string[];
/** Requests to the attacker host referenced by the malicious SVG fixtures. */
let evilRequests: string[];

test.beforeEach(async ({ page }) => {
  gh = seededGitHub();
  await gh.install(page);
  external = trackExternalRequests(page, ['evil.example']);
  evilRequests = [];
  await page.route('https://evil.example/**', (route) => {
    evilRequests.push(route.request().url());
    return route.abort();
  });
});

test.afterEach(() => {
  expect(external).toEqual([]);
  expect(gh.requests.every((r) => r.path.startsWith('/'))).toBe(true);
  // No .svg is ever written under src/assets/uploads (prd2 Feature 3.2a).
  expect(treePaths(gh).filter((p) => p.endsWith('.svg'))).toEqual([]);
  expect([...gh.files.keys()].filter((p) => p.startsWith('src/assets/uploads/') && p.endsWith('.svg'))).toEqual([]);
});

/** The inert preview container (inside the "Preview" tab panel). */
const previewPane = (page: Page) => page.locator('[inert][aria-label="Preview"]');

async function newProject(page: Page) {
  await loggedIn(page);
  await page.getByRole('button', { name: '+ New project' }).click();
  await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
}

async function fillProject(page: Page, title = 'My App') {
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^Summary/).fill('An app with a screenshot');
  await page.getByLabel(/^Image alt text/).fill('My App screenshot');
  await page.getByLabel(/^Date/).fill('2026-09');
}

/** Bytes and decoded metadata of a file committed at the fake's head. */
async function committedImage(path: string) {
  const file = gh.files.get(path);
  if (!file) throw new Error(`${path} is not on main`);
  return { bytes: file.bytes, meta: await sharp(file.bytes).metadata() };
}

test.describe('image upload (projects)', () => {
  test('JPEG: one commit with the JSON and the resized image (≤ 2 MB)', async ({ page }) => {
    await newProject(page);
    await fillProject(page);
    await chooseFile(page, 'image', image('photo.jpg'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    await expect(page.getByText(/^Resized to 1600×1200 \(\d+ KB\) — appears on the site after deploy$/)).toBeVisible();
    const loadedSha = gh.files.get('content/projects.json')!.sha;
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();

    expect(gh.writes()).toHaveLength(0);
    expect(gh.refUpdates()).toHaveLength(1);
    expect(gh.treeLog).toHaveLength(1);
    const entries = gh.treeLog[0]!.tree;
    expect(entries.map((e) => e.path)).toEqual(['content/projects.json', expect.stringMatching(/^src\/assets\/uploads\/projects\/my-app-[0-9a-f]{6}\.jpg$/)]);
    const uploadPath = entries[1]!.path;
    expect(uploadPath).toMatch(UPLOAD_RE);
    expect(gh.commitLog.map((c) => c.message)).toEqual(['content(projects): add "My App" (+image)']);

    const projects = headJson<Project[]>(gh, 'content/projects.json');
    expect(projects[0]).toMatchObject({ id: 'my-app', image: uploadPath, imageAlt: 'My App screenshot' });
    // The JSON blob was checked against the loaded SHA (step 2) before the tree was built.
    expect(gh.requests.some((r) => r.method === 'GET' && r.path === `${REPO_PATH}/contents/content/projects.json` && r.query['ref'])).toBe(true);
    expect(loadedSha).not.toBe(gh.files.get('content/projects.json')!.sha);

    const { bytes, meta } = await committedImage(uploadPath);
    expect(bytes.length).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([1600, 1200]);
  });

  test('after saving, the thumbnail of the uploaded path loads from the raw URL at the last commit', async ({ page }) => {
    await newProject(page);
    await fillProject(page);
    await chooseFile(page, 'image', image('photo.jpg'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();
    const commit = gh.headSha;
    const uploadPath = gh.treeLog[0]!.tree[1]!.path;
    await page.getByRole('button', { name: 'Edit My App' }).click();
    const thumb = page.getByRole('img', { name: 'My App screenshot' }).first();
    await expect(thumb).toHaveAttribute('src', `https://raw.githubusercontent.com/estheralmendros/portfolio/${commit}/${uploadPath}`);
    await expect.poll(() => thumb.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1600);
    expect(gh.rawRequests).toContain(`${commit}/${uploadPath}`);
  });

  test('upload before the title: no path until Save; empty title blocks the save and keeps the pending image', async ({ page }) => {
    await newProject(page);
    await chooseFile(page, 'image', image('photo.jpg'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    await page.getByText('or use a URL / path').click();
    await expect(page.getByLabel('Image', { exact: true })).toHaveValue('');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel(/^Title/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    expect(gh.writes()).toHaveLength(0);
    expect(gh.requests.filter((r) => r.method !== 'GET')).toHaveLength(1); // only the login blob probe

    await fillProject(page, 'My App');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();
    const uploadPath = gh.treeLog[0]!.tree[1]!.path;
    expect(uploadPath).toMatch(/^src\/assets\/uploads\/projects\/my-app-[0-9a-f]{6}\.jpg$/);
    expect(headJson<Project[]>(gh, 'content/projects.json')[0]!.image).toBe(uploadPath);
  });

  test('the preview shows the typed title and the selected image as a blob: URL', async ({ page }) => {
    await newProject(page);
    const preview = previewPane(page);
    await expect(preview).toBeVisible();
    await page.getByLabel(/^Title/).fill('Preview Title');
    await expect(preview.getByRole('heading', { name: 'Preview Title' })).toBeVisible();
    await expect(page.getByText('Fix errors to save')).toBeVisible();
    await chooseFile(page, 'image', image('wide.png'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    await page.getByLabel(/^Image alt text/).fill('Wide shot');
    const img = preview.getByRole('img', { name: 'Wide shot' });
    await expect(img).toHaveAttribute('src', /^blob:/);
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1600);
    // Links inside the inert preview are not focusable.
    await page.getByLabel(/^Demo URL/).fill('https://example.com/demo');
    await expect(preview.getByRole('link').first()).toBeAttached();
    await preview.getByRole('link').first().focus();
    expect(await page.evaluate(() => document.activeElement?.closest('[inert]') ?? null)).toBeNull();
  });

  test('below 1024 px the form shows Edit / Preview tabs', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await newProject(page);
    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel(/^Title/).fill('Narrow Title');
    await expect(previewPane(page)).toBeHidden();
    await tabs.getByRole('tab', { name: 'Preview' }).click();
    await expect(previewPane(page).getByRole('heading', { name: 'Narrow Title' })).toBeVisible();
    await expect(page.getByLabel(/^Title/)).toBeHidden();
  });

  test('wrong type, > 20 MB input and > 2 MB output each show their message and leave the field unchanged', async ({ page }) => {
    await newProject(page);
    const alert = page.locator('p[role="alert"]');

    await chooseFile(page, 'image', { name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(alert).toHaveText(/Use a JPG, PNG or WebP image/);
    // SVG is only accepted for badges.
    await chooseFile(page, 'image', image('badge.svg'));
    await expect(alert).toHaveText(/Use a JPG, PNG or WebP image/);

    await chooseFile(page, 'image', { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await expect(alert).toHaveText(/Image is too large to process/);

    // Random noise does not compress: a 1500×1500 PNG stays far above 2 MB after re-encoding.
    const noise = await sharp(randomBytes(1500 * 1500 * 3), { raw: { width: 1500, height: 1500, channels: 3 } }).png().toBuffer();
    expect(noise.length).toBeGreaterThan(MAX_IMAGE_BYTES);
    expect(noise.length).toBeLessThan(20 * 1024 * 1024);
    await chooseFile(page, 'image', { name: 'noise.png', mimeType: 'image/png', buffer: noise });
    await expect(alert).toHaveText(/Image is still larger than 2 MB after resizing\. Use a smaller image\./, { timeout: 15_000 });

    await expect(page.getByText(NEW_IMAGE)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload image' })).toBeVisible();
    await page.getByText('or use a URL / path').click();
    await expect(page.getByLabel('Image', { exact: true })).toHaveValue('');
    expect(gh.requests.filter((r) => r.method !== 'GET')).toHaveLength(1);
  });

  test('a typed upload path is blocked; an existing upload path kept as loaded saves normally', async ({ page }) => {
    await loggedIn(page);
    await page.getByRole('button', { name: 'Edit Fixture Gamma' }).click();
    await page.getByText('or use a URL / path').click();
    await page.getByLabel('Image', { exact: true }).fill('src/assets/uploads/projects/nope-a1b2c3.webp');
    await page.getByLabel(/^Image alt text/).fill('Nope');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText("Upload paths can't be typed; use Upload image")).toBeVisible();
    expect(gh.requests.filter((r) => r.method !== 'GET')).toHaveLength(1);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Edit Fixture Admin Dashboard' }).click();
    await page.getByLabel(/^Summary/).fill('Kept upload path');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. The site will update after the next deploy (a few minutes).')).toBeVisible();
    const put = putJson<Project[]>(gh);
    expect(put.data.find((p) => p.id === 'admin-dashboard')!.image).toBe('src/assets/uploads/projects/fixture-000000.jpg');
    expect(gh.refUpdates()).toHaveLength(0);
  });

  test('Remove clears the pending upload, the value and the alt text', async ({ page }) => {
    await loggedIn(page);
    await page.getByRole('button', { name: 'Edit Fixture Alpha' }).click();
    await chooseFile(page, 'image', image('photo.jpg'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText(NEW_IMAGE)).toHaveCount(0);
    await expect(page.getByLabel(/^Image alt text/)).toHaveValue('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. The site will update after the next deploy (a few minutes).')).toBeVisible();
    const alpha = putJson<Project[]>(gh).data.find((p) => p.id === 'fixture-alpha')!;
    expect(alpha.image).toBeUndefined();
    expect(alpha.imageAlt).toBeUndefined();
  });
});

test.describe('multi-file save', () => {
  async function saveWithImage(page: Page) {
    await newProject(page);
    await fillProject(page);
    await chooseFile(page, 'image', image('photo.jpg'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
  }

  test('content changed elsewhere (JSON SHA at head differs) → conflict, nothing published', async ({ page }) => {
    await saveWithImage(page);
    gh.changeElsewhere('content/projects.json');
    const head = gh.headSha;
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText(CONFLICT);
    await expect(page.getByRole('alert')).toContainText(IMAGE_NOT_UPLOADED);
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(gh.refUpdates()).toHaveLength(0);
    expect(gh.headSha).toBe(head);
  });

  test('head moved by an unrelated commit before GET ref → succeeds on top of the new head', async ({ page }) => {
    await saveWithImage(page);
    let externalHead = '';
    gh.before('GET', `${REPO_PATH}/git/ref/`, () => {
      externalHead = gh.pushCommit({ 'README.md': 'unrelated change\n' });
    });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();
    expect(gh.commitLog).toHaveLength(1);
    expect(gh.commitLog[0]!.parents).toEqual([externalHead]);
    expect(gh.files.get('README.md')!.content).toBe('unrelated change\n');
  });

  test('unrelated head move before PATCH ref → 422 not a fast forward, restart, success', async ({ page }) => {
    await saveWithImage(page);
    gh.moveHeadBefore({ 'README.md': 'concurrent\n' });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();
    expect(gh.refUpdates()).toHaveLength(2);
    expect(gh.commitLog).toHaveLength(2);
    expect(gh.headSha).toBe(gh.commitLog[1]!.sha);
    expect(gh.files.get('README.md')!.content).toBe('concurrent\n');
    expect(headJson<Project[]>(gh, 'content/projects.json')[0]!.id).toBe('my-app');
  });

  test('related head move before PATCH ref (projects.json changed) → conflict', async ({ page }) => {
    await saveWithImage(page);
    const changed = `${gh.files.get('content/projects.json')!.content}\n`;
    gh.moveHeadBefore({ 'content/projects.json': changed });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText(CONFLICT);
    expect(gh.refUpdates()).toHaveLength(1);
    expect(gh.files.get('content/projects.json')!.content).toBe(changed);
  });

  test('lost PATCH response that was applied → re-read ref → success', async ({ page }) => {
    await saveWithImage(page);
    gh.losePatchResponse(true);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();
    expect(gh.refUpdates()).toHaveLength(1);
    expect(gh.headSha).toBe(gh.commitLog[0]!.sha);
    const last = gh.requests.filter((r) => r.method === 'GET' && r.path === `${REPO_PATH}/git/ref/heads/main`);
    expect(last.length).toBeGreaterThanOrEqual(2);
  });

  test('lost PATCH response that was not applied → "Couldn\'t save…", nothing published, form kept', async ({ page }) => {
    await saveWithImage(page);
    const head = gh.headSha;
    gh.losePatchResponse(false);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText(SAVE_FAILED);
    expect(gh.headSha).toBe(head);
    await expect(page.getByLabel(/^Title/)).toHaveValue('My App');
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
  });

  test('another 422 on trees → GitHubApiError copy, never a conflict', async ({ page }) => {
    await saveWithImage(page);
    gh.fail('POST', `${REPO_PATH}/git/trees`, 422, { message: 'Invalid tree info' });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('GitHub rejected the save (HTTP 422). Nothing was published.');
    await expect(page.getByRole('alert')).not.toContainText('Content changed elsewhere');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(gh.refUpdates()).toHaveLength(0);
  });
});

test.describe('badge SVG (certifications)', () => {
  async function newCertification(page: Page) {
    await loggedIn(page);
    await openTab(page, 'Certifications');
    await page.getByRole('button', { name: '+ New certification' }).click();
    await page.getByLabel(/^Name/).fill('Badge Cert');
    await page.getByLabel(/^Issuer/).fill('Fixture Issuer');
    await page.getByLabel(/^Issued/).fill('2025-01');
  }

  test('an SVG badge is rasterized to a 320 px PNG; only the .png is committed', async ({ page }) => {
    await newCertification(page);
    await chooseFile(page, 'badge', image('badge.svg'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    await expect(page.getByText(/^Resized to 320×160 /)).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();
    const paths = treePaths(gh);
    expect(paths).toEqual(['content/certifications.json', expect.stringMatching(/^src\/assets\/uploads\/certifications\/badge-cert-[0-9a-f]{6}\.png$/)]);
    expect(gh.commitLog[0]!.message).toBe('content(certifications): add "Badge Cert" (+image)');
    expect(headJson<Certification[]>(gh, 'content/certifications.json')[0]!.badge).toBe(paths[1]);
    const { meta } = await committedImage(paths[1]!);
    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([320, 160]);
    expect(meta.hasAlpha).toBe(true);
  });

  test('a non-image badge shows the badge type message', async ({ page }) => {
    await newCertification(page);
    await chooseFile(page, 'badge', { name: 'badge.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.locator('p[role="alert"]')).toHaveText(/Use a JPG, PNG, WebP or SVG image/);
  });

  test('the malicious SVG payload is live when opened as a document (control for the trap)', async ({ page }) => {
    await page.route('**/__e2e/malicious.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: readImage('malicious.svg') }));
    await page.goto('__e2e/malicious.svg');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned)).toBeDefined();
  });

  for (const fixture of ['malicious.svg', 'foreign-object.svg']) {
    test(`${fixture}: nothing executes; rasterized to PNG or rejected with the SVG message`, async ({ page }) => {
      await newCertification(page);
      await page.evaluate(() => {
        (window as unknown as { __pwned?: unknown }).__pwned = undefined;
      });
      await chooseFile(page, 'badge', image(fixture));
      const accepted = page.getByText(NEW_IMAGE);
      const rejected = page.locator('p[role="alert"]', { hasText: SVG_UNREADABLE });
      await expect(accepted.or(rejected)).toBeVisible();
      // Give any deferred handler (onload/onerror) a chance to fire before checking the trap.
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned)).toBeUndefined();
      expect(await page.evaluate(() => 'pwned' in document.documentElement.dataset)).toBe(false);

      const rasterized = await accepted.isVisible();
      test.info().annotations.push({ type: 'svg-outcome', description: rasterized ? 'rasterized' : 'rejected' });
      if (rasterized) {
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByText(SAVED_WITH_IMAGE)).toBeVisible();
        const uploads = treePaths(gh).filter((p) => p.startsWith('src/assets/uploads/'));
        expect(uploads).toEqual([expect.stringMatching(/^src\/assets\/uploads\/certifications\/badge-cert-[0-9a-f]{6}\.png$/)]);
        expect((await committedImage(uploads[0]!)).meta.format).toBe('png');
      } else {
        expect(gh.refUpdates()).toHaveLength(0);
      }
      expect(await page.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned)).toBeUndefined();
      expect(evilRequests).toEqual([]);
    });
  }
});

test.describe('profile photo and CV', () => {
  const pdf = (size = 1200) => {
    const buffer = Buffer.alloc(size, 0x20);
    buffer.write('%PDF-1.4\n', 0, 'latin1');
    return buffer;
  };

  test('photo PNG + CV PDF: one commit with three files and the (+image, +cv) message', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Profile');
    await chooseFile(page, 'photo', image('wide.png'));
    await expect(page.getByText(NEW_IMAGE)).toBeVisible();
    const cv = pdf();
    await chooseFile(page, 'cvUrl', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: cv });
    await expect(page.getByText(/^✓ cv\.pdf \(\d+ KB\) — new, saved with this profile$/)).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. The new image and CV appear on the site after the next deploy (a few minutes).')).toBeVisible();

    expect(gh.writes()).toHaveLength(0);
    expect(gh.refUpdates()).toHaveLength(1);
    expect(gh.commitLog.map((c) => c.message)).toEqual(['content(profile): update profile (+image, +cv)']);
    const paths = treePaths(gh);
    expect(paths).toEqual(['content/profile.json', expect.stringMatching(/^src\/assets\/uploads\/profile\/profile-[0-9a-f]{6}\.png$/), 'public/uploads/cv.pdf']);
    expect(gh.files.get('public/uploads/cv.pdf')!.bytes.equals(cv)).toBe(true);
    const profile = headJson<Profile>(gh, 'content/profile.json');
    expect(profile.photo).toBe(paths[1]);
    expect(profile.cvUrl).toMatch(/^\/uploads\/cv\.pdf\?v=[0-9a-f]{6}$/);
    const { meta } = await committedImage(paths[1]!);
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1600, 400]);
  });

  test('CV: a non-PDF and a PDF over 5 MB are rejected', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Profile');
    const alert = page.locator('p[role="alert"]');
    await chooseFile(page, 'cvUrl', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not really a pdf') });
    await expect(alert).toHaveText(/CV must be a PDF of 5 MB or less/);
    await chooseFile(page, 'cvUrl', { name: 'cv.docx', mimeType: 'application/msword', buffer: pdf() });
    await expect(alert).toHaveText(/CV must be a PDF of 5 MB or less/);
    await chooseFile(page, 'cvUrl', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: pdf(5 * 1024 * 1024 + 1) });
    await expect(alert).toHaveText(/CV must be a PDF of 5 MB or less/);
    await expect(page.getByText(/new, saved with this profile/)).toHaveCount(0);
    await expect(page.getByLabel('CV', { exact: true })).toHaveValue('/docs/fixture-cv.pdf');
  });

  test('Remove CV (uploaded 3 MB file): Undo restores; Save deletes the file in one commit (-cv)', async ({ page }) => {
    const profile = { ...headJson<Profile>(gh, 'content/profile.json'), cvUrl: '/uploads/cv.pdf?v=a1b2c3' };
    gh.setFile('content/profile.json', `${JSON.stringify(profile, null, 2)}\n`);
    gh.setFile('public/uploads/cv.pdf', pdf(3 * 1024 * 1024));
    expect(gh.files.get('public/uploads/cv.pdf')!.bytes.length).toBeGreaterThan(CONTENTS_DEFAULT_MAX_BYTES);
    await loggedIn(page);
    await openTab(page, 'Profile');

    await page.getByRole('button', { name: 'Remove CV' }).click();
    await expect(page.getByText('CV will be removed when you save')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('CV will be removed when you save')).toHaveCount(0);
    await expect(page.getByLabel('CV', { exact: true })).toHaveValue('/uploads/cv.pdf?v=a1b2c3');

    await page.getByRole('button', { name: 'Remove CV' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('CV removed. The download link disappears after the next deploy.')).toBeVisible();
    expect(gh.refUpdates()).toHaveLength(1);
    expect(gh.commitLog.map((c) => c.message)).toEqual(['content(profile): update profile (-cv)']);
    expect(gh.treeLog[0]!.tree).toContainEqual(expect.objectContaining({ path: 'public/uploads/cv.pdf', sha: null }));
    expect(gh.files.has('public/uploads/cv.pdf')).toBe(false);
    expect(headJson<Profile>(gh, 'content/profile.json').cvUrl).toBeUndefined();
    // Step 2b: the existence check asks for the object media type (the default one is rejected over 1 MB).
    const check = gh.requests.find((r) => r.method === 'GET' && r.path === `${REPO_PATH}/contents/public/uploads/cv.pdf`);
    expect(check?.headers['accept']).toContain('application/vnd.github.object');
  });

  test('Remove CV when cv.pdf is already missing at head: the save succeeds without a delete entry', async ({ page }) => {
    const profile = { ...headJson<Profile>(gh, 'content/profile.json'), cvUrl: '/uploads/cv.pdf?v=a1b2c3' };
    gh.setFile('content/profile.json', `${JSON.stringify(profile, null, 2)}\n`);
    await loggedIn(page);
    await openTab(page, 'Profile');
    await page.getByRole('button', { name: 'Remove CV' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('CV removed. The download link disappears after the next deploy.')).toBeVisible();
    expect(gh.treeLog.flatMap((t) => t.tree).filter((e) => e.sha === null)).toEqual([]);
    expect(headJson<Profile>(gh, 'content/profile.json').cvUrl).toBeUndefined();
  });

  test('Remove CV (external / other path): only profile.json changes, through the Contents API', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Profile');
    await page.getByRole('button', { name: 'Remove CV' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. The site will update after the next deploy (a few minutes).')).toBeVisible();
    expect(gh.treeLog).toHaveLength(0);
    expect(gh.refUpdates()).toHaveLength(0);
    const put = putJson<Profile>(gh);
    expect(put.message).toBe('content(profile): update profile');
    expect(put.data.cvUrl).toBeUndefined();
  });
});
