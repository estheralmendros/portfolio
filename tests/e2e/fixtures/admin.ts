// Shared helpers for the admin e2e specs: a fake GitHub seeded with every fixture content file, login, navigation
// and readers for what the fake recorded. Only tests/fixtures/content is used (never the real /content).
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FakeGitHub, GOOD_TOKEN, OWNER, REPO } from './fakeGitHub';

export const REPO_PATH = `/repos/${OWNER}/${REPO}`;
const IMAGES = path.resolve('tests/fixtures/images');
export const image = (name: string) => path.join(IMAGES, name);
export const readImage = (name: string) => readFileSync(image(name));

const FIXTURE_FILES = ['profile', 'skills', 'certifications', 'experience'] as const;

/** The default fake has only projects.json; the v2 admin needs every content file. */
export function seededGitHub(): FakeGitHub {
  const gh = new FakeGitHub();
  for (const name of FIXTURE_FILES) gh.setFile(`content/${name}.json`, readFileSync(path.resolve(`tests/fixtures/content/${name}.json`)));
  return gh;
}

/** Submits the login form with `token` (no assertion on the outcome). */
export async function login(page: Page, token = GOOD_TOKEN) {
  await page.goto('admin/');
  await page.getByLabel('GitHub fine-grained token').fill(token);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Logs in with the good token and waits for the Projects list. */
export async function loggedIn(page: Page) {
  await login(page);
  await expect(page.getByText('Fixture Alpha')).toBeVisible();
}

/** Switches section with the header tabs. */
export async function openTab(page: Page, name: 'Profile' | 'Projects' | 'Skills' | 'Certifications' | 'Experience') {
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name, exact: true }).click();
}

/** Decoded JSON content of a file at the fake's head. */
export function headJson<T = unknown>(gh: FakeGitHub, filePath: string): T {
  const file = gh.files.get(filePath);
  if (!file) throw new Error(`${filePath} is not on main`);
  return JSON.parse(file.content) as T;
}

/** Decoded JSON body of the n-th Contents API PUT. */
export function putJson<T = unknown>(gh: FakeGitHub, index = 0): { message: string; data: T; path: string } {
  const req = gh.writes()[index];
  if (!req) throw new Error(`no PUT #${index}`);
  const body = req.body as { message: string; content: string };
  return { message: body.message, path: req.path, data: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) as T };
}

/** Every path any recorded tree touched (writes and deletes). */
export const treePaths = (gh: FakeGitHub) => gh.treeLog.flatMap((t) => t.tree.map((e) => e.path));

/** The inert live-preview container (inside the "Preview" tab panel). */
export const previewPane = (page: Page) => page.locator('[inert][aria-label="Preview"]');

/** The deploy badge (the header's status region). */
export const badge = (page: Page) => page.getByRole('banner').getByRole('status');

/** Selects a file through the hidden file input of an image/CV field. */
export async function chooseFile(
  page: Page,
  field: 'image' | 'photo' | 'badge' | 'cvUrl',
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await page.locator(`input[name="${field}-file"]`).setInputFiles(file);
}

/**
 * Records every http(s) request that leaves localhost and isn't served by the fakes (api.github.com and
 * raw.githubusercontent.com are routed by FakeGitHub). Specs assert it stays empty.
 */
export function trackExternalRequests(page: Page, allowed: readonly string[] = []): string[] {
  const seen: string[] = [];
  const served = new Set(['localhost', 'api.github.com', 'raw.githubusercontent.com', ...allowed]);
  page.on('request', (req) => {
    const url = new URL(req.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !served.has(url.hostname)) seen.push(req.url());
  });
  return seen;
}
