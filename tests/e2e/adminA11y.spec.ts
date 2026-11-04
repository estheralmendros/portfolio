// axe scans of every admin screen (prd2 Testing Decisions), in the light and the dark theme.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { FakeGitHub, ScriptedRun } from './fixtures/fakeGitHub';
import { badge, chooseFile, image, loggedIn, openTab, previewPane, seededGitHub, trackExternalRequests } from './fixtures/admin';

let gh: FakeGitHub;
let external: string[];

test.beforeEach(async ({ page }) => {
  gh = seededGitHub();
  await gh.install(page);
  external = trackExternalRequests(page);
});

test.afterEach(() => {
  expect(external).toEqual([]);
});

async function expectNoSeriousViolations(page: Page) {
  // Let the debounced preview (150 ms) settle before scanning: it is aria-busy while a change is pending.
  await expect(previewPane(page).and(page.locator('[aria-busy="true"]'))).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function go(page: Page, hash: string) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

/** Each screen: how to reach it after login, and an element that proves it rendered. */
const screens: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'profile form + preview', open: async (p) => { await openTab(p, 'Profile'); await expect(p.getByLabel(/^Bio/)).toBeVisible(); } },
  { name: 'projects list', open: async (p) => { await expect(p.getByRole('button', { name: 'Edit Fixture Alpha' })).toBeVisible(); } },
  { name: 'skills list (grouped)', open: async (p) => { await openTab(p, 'Skills'); await expect(p.getByRole('button', { name: 'Edit TypeScript' })).toBeVisible(); } },
  {
    name: 'certifications list',
    open: async (p) => { await openTab(p, 'Certifications'); await expect(p.getByRole('button', { name: 'Edit Fixture Current Certification' })).toBeVisible(); },
  },
  {
    name: 'experience list',
    open: async (p) => { await openTab(p, 'Experience'); await expect(p.getByRole('button', { name: 'Edit Fixture Role @ Fixture Company' })).toBeVisible(); },
  },
  { name: 'new project form + preview', open: async (p) => { await go(p, '#/projects/new'); await expect(p.getByRole('heading', { name: 'New project' })).toBeVisible(); } },
  {
    name: 'edit project form + preview (Markdown detail, image)',
    open: async (p) => { await go(p, '#/projects/fixture-alpha'); await expect(p.getByLabel(/^Title/)).toHaveValue('Fixture Alpha'); },
  },
  { name: 'new skill form + preview', open: async (p) => { await go(p, '#/skills/new'); await expect(p.getByText('Icons appear after deploy')).toBeVisible(); } },
  { name: 'edit skill form + preview', open: async (p) => { await go(p, '#/skills/typescript'); await expect(p.getByLabel(/^Name/)).toHaveValue('TypeScript'); } },
  { name: 'new certification form + preview', open: async (p) => { await go(p, '#/certifications/new'); await expect(p.getByLabel(/^Issuer/)).toBeVisible(); } },
  {
    name: 'edit certification form + preview',
    open: async (p) => { await go(p, '#/certifications/fixture-current-cert'); await expect(p.getByLabel(/^Issuer/)).toHaveValue('Fixture Issuer'); },
  },
  { name: 'new experience form + preview', open: async (p) => { await go(p, '#/experience/new'); await expect(p.getByLabel(/^Role/)).toBeVisible(); } },
  {
    name: 'edit experience form + preview',
    open: async (p) => { await go(p, '#/experience/fixture-company'); await expect(p.getByLabel(/^Role/)).toHaveValue('Fixture Role'); },
  },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await loggedIn(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    });

    for (const screen of screens) {
      test(`axe: ${screen.name}`, async ({ page }) => {
        await screen.open(page);
        await expectNoSeriousViolations(page);
      });
    }

    test('axe: invalid form with field errors, "Fix errors to save" and a pending upload', async ({ page }) => {
      await go(page, '#/projects/new');
      await chooseFile(page, 'image', image('photo.jpg'));
      await expect(page.getByText('New image selected — saved with this entry')).toBeVisible();
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByLabel(/^Title/)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText('Fix errors to save')).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('axe: pending reorder bar', async ({ page }) => {
      await openTab(page, 'Skills');
      await page.getByRole('button', { name: "Move 'TypeScript' down" }).click();
      await expect(page.getByText('Order changed —')).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('axe: profile with a pending CV removal and the narrow preview tab', async ({ page }) => {
      await page.setViewportSize({ width: 700, height: 900 });
      await openTab(page, 'Profile');
      await page.getByRole('button', { name: 'Remove CV' }).click();
      await expect(page.getByText('CV will be removed when you save')).toBeVisible();
      await expectNoSeriousViolations(page);
      await page.getByRole('tab', { name: 'Preview' }).click();
      await expect(previewPane(page)).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    const badgeStates: { state: string; run: ScriptedRun }[] = [
      { state: 'Live', run: { status: 'completed', conclusion: 'success' } },
      { state: 'Failed', run: { status: 'completed', conclusion: 'failure' } },
      { state: 'Replaced by a newer deploy', run: { status: 'completed', conclusion: 'cancelled' } },
      { state: 'Status unknown', run: { httpStatus: 403 } },
    ];
    for (const { state, run } of badgeStates) {
      test(`axe: deploy badge "${state}"`, async ({ page }) => {
        gh.scriptRuns([run]);
        await openTab(page, 'Profile');
        await page.getByLabel(/^Title/).fill('A11y save');
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(badge(page)).toContainText(state);
        await expectNoSeriousViolations(page);
      });
    }
  });
}
