import { expect, test, type Page } from '@playwright/test';
import { FakeGitHub, GOOD_TOKEN } from './fixtures/fakeGitHub';

let gh: FakeGitHub;

test.beforeEach(async ({ page }) => {
  gh = new FakeGitHub();
  await gh.install(page);
});

test.afterEach(() => {
  // Defensive: every GitHub request in these tests was served by the fake.
  expect(gh.requests.every((r) => r.path.startsWith('/'))).toBe(true);
});

async function login(page: Page, token = GOOD_TOKEN) {
  await page.goto('admin/');
  await page.getByLabel('GitHub fine-grained token').fill(token);
  await page.getByRole('button', { name: 'Log in' }).click();
}

async function loggedIn(page: Page) {
  await login(page);
  await expect(page.getByText('Fixture Alpha')).toBeVisible();
}

test.describe('login', () => {
  test('success stores the token only in sessionStorage', async ({ page, context }) => {
    await loggedIn(page);
    await expect(page).toHaveURL(/#\/projects$/);
    expect(await page.evaluate(() => sessionStorage.getItem('portfolio.admin.token'))).toBe(GOOD_TOKEN);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'portfolio.theme'))).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(page.url()).not.toContain(GOOD_TOKEN);
    expect(gh.requests.map((r) => `${r.method} ${r.path}`).slice(0, 3)).toEqual([
      'GET /user', 'GET /repos/estheralmendros/portfolio', 'POST /repos/estheralmendros/portfolio/git/blobs',
    ]);
    expect(gh.requests[0]?.headers['authorization']).toBe(`Bearer ${GOOD_TOKEN}`);
  });

  test('invalid format makes no request', async ({ page }) => {
    await login(page, 'ghp_classic');
    await expect(page.getByRole('alert')).toHaveText(/Use a fine-grained token \(it starts with github_pat_\)\./);
    expect(gh.requests).toEqual([]);
  });

  test('invalid token (401)', async ({ page }) => {
    await login(page, 'github_pat_revoked');
    await expect(page.getByRole('alert')).toContainText("GitHub rejected this token. Check it was copied fully and hasn't expired.");
  });

  test('wrong user', async ({ page }) => {
    gh.users.set('github_pat_other', 'someone-else');
    await login(page, 'github_pat_other');
    await expect(page.getByRole('alert')).toContainText('This token belongs to @someone-else. Only @estheralmendros can use this admin.');
  });

  test('token without the repo in Repository access (public repo) → no-write-access', async ({ page }) => {
    gh.users.set('github_pat_norepo', 'estheralmendros');
    gh.writeDenied.add('github_pat_norepo');
    await login(page, 'github_pat_norepo');
    await expect(page.getByRole('alert')).toContainText(
      "This token can't write to estheralmendros/portfolio. Make sure Repository access includes it and Contents is Read and write.",
    );
    expect(await page.evaluate(() => sessionStorage.getItem('portfolio.admin.token'))).toBeNull();
  });

  test('rate limited during verify', async ({ page }) => {
    gh.fail('GET', '/user', 403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });
    await login(page);
    await expect(page.getByRole('alert')).toContainText("GitHub's rate limit was reached. Try again in a few minutes.");
  });

  test('log out clears the token', async ({ page }) => {
    await loggedIn(page);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByLabel('GitHub fine-grained token')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('portfolio.admin.token'))).toBeNull();
  });
});

test.describe('silent re-verify on reload', () => {
  test('401 → login with the session-expired message', async ({ page }) => {
    await loggedIn(page);
    gh.users.delete(GOOD_TOKEN);
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Your session expired or the token was revoked. Log in again.');
    expect(await page.evaluate(() => sessionStorage.getItem('portfolio.admin.token'))).toBeNull();
  });

  test('offline keeps the token; Retry when back online continues to the requested route', async ({ page }) => {
    await loggedIn(page);
    await page.getByRole('button', { name: '+ New project' }).click();
    await expect(page).toHaveURL(/#\/projects\/new$/);
    gh.offline = true;
    await page.reload();
    await expect(page.getByText("Couldn't reach GitHub. Check your connection.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('portfolio.admin.token'))).toBe(GOOD_TOKEN);
    gh.offline = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();
    await expect(page).toHaveURL(/#\/projects\/new$/);
  });
});

test.describe('manage projects', () => {
  test('create commits once with the new project first', async ({ page }) => {
    await loggedIn(page);
    const loadedSha = gh.files.get('content/projects.json')!.sha;
    await page.getByRole('button', { name: '+ New project' }).click();
    await page.getByLabel(/^Title/).fill('Gestión de Inventario');
    await expect(page.getByLabel(/^Slug/)).toHaveValue('gestion-de-inventario');
    await page.getByLabel(/^Summary/).fill('Inventory app');
    await page.getByLabel(/^Tags/).fill('React, react, TypeScript');
    await page.getByLabel(/^Date/).fill('2026-10');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved. The site will update after the next deploy (a few minutes).')).toBeVisible();
    const writes = gh.writes();
    expect(writes).toHaveLength(1);
    const body = writes[0]!.body as { message: string; sha: string; branch: string; content: string };
    expect(writes[0]!.path).toBe('/repos/estheralmendros/portfolio/contents/content/projects.json');
    expect(body.message).toBe('content(projects): add "Gestión de Inventario"');
    expect(body.sha).toBe(loadedSha);
    expect(body.branch).toBe('main');
    const text = Buffer.from(body.content, 'base64').toString('utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
    expect(JSON.parse(text)[0]).toEqual({
      id: 'gestion-de-inventario', title: 'Gestión de Inventario', summary: 'Inventory app', description: '',
      tags: ['React', 'TypeScript'], featured: false, date: '2026-10',
    });
    await expect(page.getByRole('listitem').first()).toContainText('Gestión de Inventario');
  });

  test('invalid form makes no write and focuses the first invalid field', async ({ page }) => {
    await loggedIn(page);
    await page.getByRole('button', { name: '+ New project' }).click();
    await page.getByLabel(/^Title/).fill('Has errors');
    await page.getByLabel(/^Repo URL/).fill('http://github.com/x');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel(/^Summary/)).toBeFocused();
    await expect(page.getByLabel(/^Summary/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Must start with https://')).toBeVisible();
    expect(gh.writes()).toHaveLength(0);
  });

  test('duplicate slug is blocked', async ({ page }) => {
    await loggedIn(page);
    await page.getByRole('button', { name: '+ New project' }).click();
    await page.getByLabel(/^Title/).fill('Fixture Alpha');
    await page.getByLabel(/^Summary/).fill('dup');
    await page.getByLabel(/^Date/).fill('2026-10');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText("This slug is already used by 'Fixture Alpha'")).toBeVisible();
    expect(gh.writes()).toHaveLength(0);
  });

  test('edit commits an update with the slug read-only', async ({ page }) => {
    await loggedIn(page);
    await page.getByRole('button', { name: 'Edit Fixture Gamma' }).click();
    await expect(page.getByLabel(/^Slug/)).toHaveAttribute('readonly', '');
    await page.getByLabel(/^Title/).fill('Fixture Gamma Renamed');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Saved\./)).toBeVisible();
    const body = gh.writes()[0]!.body as { message: string; content: string };
    expect(body.message).toBe('content(projects): update "Fixture Gamma Renamed"');
    const list = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) as { id: string; title: string }[];
    expect(list.map((p) => p.id)).toEqual(['fixture-alpha', 'admin-dashboard', 'fixture-gamma']);
    expect(list[2]!.title).toBe('Fixture Gamma Renamed');
  });

  test('delete requires confirmation; Escape cancels and returns focus', async ({ page }) => {
    await loggedIn(page);
    const del = page.getByRole('button', { name: 'Delete Fixture Gamma' });
    await del.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText("Delete 'Fixture Gamma'? This commits to main and removes it from the live site.");
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(del).toBeFocused();
    expect(gh.writes()).toHaveLength(0);
    await del.click();
    await page.getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByText(/Saved\./)).toBeVisible();
    expect((gh.writes()[0]!.body as { message: string }).message).toBe('content(projects): delete "Fixture Gamma"');
    await expect(page.getByText('Fixture Gamma')).toHaveCount(0);
  });

  test('stale SHA → conflict banner, Save disabled, no retry; Reload refetches', async ({ page }) => {
    await loggedIn(page);
    gh.changeElsewhere('content/projects.json');
    await page.getByRole('button', { name: 'Edit Fixture Gamma' }).click();
    await page.getByLabel(/^Summary/).fill('Changed summary');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Content changed elsewhere — reload to get the latest version.');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(gh.writes()).toHaveLength(1);
    const before = gh.requests.filter((r) => r.method === 'GET' && r.path.includes('/contents/')).length;
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page).toHaveURL(/#\/projects$/);
    await expect(page.getByText('Fixture Gamma', { exact: true })).toBeVisible();
    expect(gh.requests.filter((r) => r.method === 'GET' && r.path.includes('/contents/')).length).toBe(before + 1);
    expect(gh.files.get('content/projects.json')!.content).not.toContain('Changed summary');
  });

  test('a 401 after login forces logout with the session-expired message', async ({ page }) => {
    await loggedIn(page);
    gh.fail('PUT', '/repos/estheralmendros/portfolio/contents/', 401, { message: 'Bad credentials' });
    await page.getByRole('button', { name: 'Delete Fixture Gamma' }).click();
    await page.getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByRole('alert')).toContainText('Your session expired or the token was revoked. Log in again.');
    expect(await page.evaluate(() => sessionStorage.getItem('portfolio.admin.token'))).toBeNull();
  });

  test('save while rate limited keeps form data', async ({ page }) => {
    await loggedIn(page);
    gh.fail('PUT', '/repos/estheralmendros/portfolio/contents/', 429, { message: 'slow down' });
    await page.getByRole('button', { name: 'Edit Fixture Gamma' }).click();
    await page.getByLabel(/^Summary/).fill('Kept');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText("GitHub's rate limit was reached.");
    await expect(page.getByLabel(/^Summary/)).toHaveValue('Kept');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
