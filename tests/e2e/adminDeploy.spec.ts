// prd2 Feature 7 end to end: the deploy badge follows the scripted Actions runs of the fake GitHub after a save.
import { expect, test, type Page } from '@playwright/test';
import { DEPLOY_WORKFLOW, type FakeGitHub, type ScriptedRun } from './fixtures/fakeGitHub';
import { REPO_PATH, badge, loggedIn, openTab, seededGitHub, trackExternalRequests } from './fixtures/admin';

const ACTIONS_URL = 'https://github.com/estheralmendros/portfolio/actions';
const POLL_MS = 5_000;

let gh: FakeGitHub;
let external: string[];

test.beforeEach(async ({ page }) => {
  gh = seededGitHub();
  await gh.install(page);
  external = trackExternalRequests(page);
  // Fake timers that still flow in real time; runFor() skips ahead to the next poll.
  await page.clock.install();
});

test.afterEach(() => {
  expect(external).toEqual([]);
});

/** Saves the profile (one Contents API commit) and returns the commit SHA the badge polls for. */
async function saveProfile(page: Page, { login = true } = {}): Promise<string> {
  if (login) await loggedIn(page);
  await openTab(page, 'Profile');
  await page.getByLabel(/^Title/).fill(`Deployed ${Date.now()}`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved. The site will update after the next deploy (a few minutes).')).toBeVisible();
  return gh.headSha;
}

const runRequests = () => gh.requests.filter((r) => r.method === 'GET' && r.path === `${REPO_PATH}/actions/workflows/${DEPLOY_WORKFLOW}/runs`);

async function nextPoll(page: Page) {
  await page.clock.runFor(POLL_MS);
}

/**
 * A poll's request reaches the fake asynchronously after the clock fires it (and the next poll is only scheduled once
 * that response is handled), so a "no more polls" check has no event to await: it advances the clock and then waits
 * this fixed real-time window for a request that must never arrive.
 */
const NO_POLL_WINDOW_MS = 500;

/** Advances the clock by `polls` poll intervals, letting each poll's request (if any) land before the next. */
async function advancePolls(page: Page, polls = 2) {
  for (let i = 0; i < polls; i += 1) {
    await nextPoll(page);
    await page.waitForTimeout(NO_POLL_WINDOW_MS);
  }
}

/** Asserts that `count()` does not grow over two more poll intervals. */
async function expectNoMorePolls(page: Page, count: () => number) {
  const before = count();
  await advancePolls(page);
  expect(count()).toBe(before);
}

test('idle until the first commit; Deploying… → Live with a View site link', async ({ page }) => {
  gh.scriptRuns([null, { status: 'queued' }, { status: 'in_progress', run_started_at: new Date().toISOString() }, { status: 'completed', conclusion: 'success' }]);
  await loggedIn(page);
  await expect(badge(page)).toHaveText('');
  const sha = await saveProfile(page, { login: false });
  await expect(badge(page)).toContainText('Deploying…');
  await expect.poll(() => runRequests().length).toBeGreaterThan(0);
  const first = runRequests()[0]!;
  expect(first.query).toEqual({ head_sha: sha, per_page: '1' });
  await nextPoll(page);
  await expect(badge(page)).toContainText('Deploying…');
  await nextPoll(page);
  await expect(badge(page)).toContainText('Deploying…');
  await nextPoll(page);
  await expect(badge(page)).toContainText('Live');
  await expect(badge(page).getByRole('link', { name: /View site/ })).toHaveAttribute('href', 'https://estheralmendros.github.io/portfolio/');
  // Polling stopped on completion.
  await expectNoMorePolls(page, () => runRequests().length);
});

const terminal: { name: string; run: ScriptedRun; text: string; link: RegExp; href: string | RegExp; hint?: string }[] = [
  {
    name: 'failure → Failed with View run (html_url)', run: { status: 'completed', conclusion: 'failure' }, text: 'Failed', link: /View run/,
    href: /^https:\/\/github\.com\/estheralmendros\/portfolio\/actions\/runs\/\d+$/,
  },
  { name: 'cancelled → Replaced by a newer deploy', run: { status: 'completed', conclusion: 'cancelled' }, text: 'Replaced by a newer deploy', link: /Open Actions/, href: ACTIONS_URL },
  {
    name: '403 → Status unknown with the Actions: Read hint', run: { httpStatus: 403 }, text: 'Status unknown', link: /Open Actions/, href: ACTIONS_URL,
    hint: 'Add Actions: Read to your token',
  },
  { name: '404 → Status unknown (like 403)', run: { httpStatus: 404, message: 'Not Found' }, text: 'Status unknown', link: /Open Actions/, href: ACTIONS_URL, hint: 'Add Actions: Read to your token' },
];

for (const t of terminal) {
  test(`badge: ${t.name}`, async ({ page }) => {
    gh.scriptRuns([{ status: 'queued' }, t.run]);
    await saveProfile(page);
    await expect(badge(page)).toContainText('Deploying…');
    await nextPoll(page);
    await expect(badge(page)).toContainText(t.text);
    await expect(badge(page).getByRole('link', { name: t.link })).toHaveAttribute('href', t.href);
    if (t.hint) await expect(badge(page)).toContainText(t.hint);
    else await expect(badge(page)).not.toContainText('Add Actions: Read to your token');
    await expectNoMorePolls(page, () => runRequests().length);
  });
}

test('a new commit restarts polling for the new SHA; logout stops it', async ({ page }) => {
  gh.scriptRuns([{ status: 'queued' }]);
  const first = await saveProfile(page);
  await expect(badge(page)).toContainText('Deploying…');
  await page.getByLabel(/^Title/).fill('Second save');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => gh.headSha).not.toBe(first);
  const second = gh.headSha;
  await expect.poll(() => runRequests().some((r) => r.query['head_sha'] === second)).toBe(true);
  const forSha = (sha: string) => () => runRequests().filter((r) => r.query['head_sha'] === sha).length;
  const firstCalls = forSha(first)();
  await advancePolls(page);
  expect(forSha(first)()).toBe(firstCalls);
  await expect.poll(forSha(second)).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByLabel('GitHub fine-grained token')).toBeVisible();
  await expectNoMorePolls(page, () => runRequests().length);
});
