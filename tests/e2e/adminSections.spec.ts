// prd2 Features 1 and 2 end to end: CRUD on every section, reorder, error handling per screen, dirty-form guard.
import { expect, test } from '@playwright/test';
import type { Certification, Experience, Profile, Skill } from '../../src/content/schema';
import type { FakeGitHub } from './fixtures/fakeGitHub';
import { REPO_PATH, headJson, loggedIn, openTab, putJson, seededGitHub, trackExternalRequests } from './fixtures/admin';

// The End label shows a visual (aria-hidden) "*" while Present is unchecked; match both forms, not "End date" etc.
const END_LABEL = /^End\*?$/;

const SAVED = 'Saved. The site will update after the next deploy (a few minutes).';

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

test.describe('profile', () => {
  test('edit commits one update with the profile message and keeps the other fields', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Profile');
    await expect(page).toHaveURL(/#\/profile$/);
    await expect(page.getByLabel(/^Name/)).toHaveValue('Fixture Person');
    await page.getByLabel(/^Title/).fill('Staff Fixture Engineer');
    await page.getByLabel(/^Availability/).selectOption({ label: 'Open to opportunities' });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    expect(gh.writes()).toHaveLength(1);
    const put = putJson<Profile>(gh);
    expect(put.path).toBe(`${REPO_PATH}/contents/content/profile.json`);
    expect(put.message).toBe('content(profile): update profile');
    expect(put.data).toEqual({ ...headJson<Profile>(gh, 'content/profile.json'), title: 'Staff Fixture Engineer', availability: 'open' });
    expect(put.data.cvUrl).toBe('/docs/fixture-cv.pdf');
    // The form stays on screen with the saved values.
    await expect(page).toHaveURL(/#\/profile$/);
    await expect(page.getByLabel(/^Title/)).toHaveValue('Staff Fixture Engineer');
  });

  test('invalid values block the save with field errors and no write', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Profile');
    await page.getByLabel(/^Email/).fill('not-an-email');
    await page.getByLabel(/^LinkedIn URL/).fill('http://linkedin.com/in/x');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel(/^Email/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(/^LinkedIn URL/)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Fix errors to save')).toBeVisible();
    expect(gh.writes()).toHaveLength(0);
    expect(gh.refUpdates()).toHaveLength(0);
  });

  test('conflict: stale SHA shows the banner, disables Save, and Reload refetches', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Profile');
    await expect(page.getByLabel(/^Title/)).toHaveValue('Fixture Engineer');
    gh.changeElsewhere('content/profile.json');
    await page.getByLabel(/^Title/).fill('Changed');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Content changed elsewhere — reload to get the latest version.');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByLabel(/^Title/)).toHaveValue('Fixture Engineer');
    expect(gh.files.get('content/profile.json')!.content).not.toContain('Changed');
  });

  test('a 401 on save forces logout', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Profile');
    gh.fail('PUT', `${REPO_PATH}/contents/`, 401, { message: 'Bad credentials' });
    await page.getByLabel(/^Title/).fill('Changed');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Your session expired or the token was revoked. Log in again.');
    await expect(page.getByLabel('GitHub fine-grained token')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('portfolio.admin.token'))).toBeNull();
  });
});

test.describe('skills', () => {
  test('list is grouped by category with Edit/Delete per row', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    await expect(page).toHaveURL(/#\/skills$/);
    for (const category of ['Languages', 'Data, IoT & AI', 'Dev tools']) await expect(page.getByRole('heading', { name: category })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'DevOps & Cloud' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit TypeScript' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Docker' })).toBeVisible();
  });

  test('create inserts the skill at the top of its category in one commit', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    await page.getByRole('button', { name: '+ New skill' }).click();
    await expect(page).toHaveURL(/#\/skills\/new$/);
    await page.getByLabel(/^Name/).fill('Go Lang');
    await expect(page.getByLabel(/^Id/)).toHaveValue('go-lang');
    await page.getByLabel(/^Category/).selectOption({ label: 'Data, IoT & AI' });
    await page.getByLabel(/^Years/).fill('2');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    expect(gh.writes()).toHaveLength(1);
    const put = putJson<Skill[]>(gh);
    expect(put.message).toBe('content(skills): add "Go Lang"');
    expect(put.data.map((s) => s.id)).toEqual(['typescript', 'fixturelang', 'go-lang', 'react', 'docker']);
    expect(put.data[2]).toEqual({ id: 'go-lang', name: 'Go Lang', category: 'data', years: 2 });
  });

  test('edit keeps the id read-only and commits an update', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    await page.getByRole('button', { name: 'Edit React' }).click();
    await expect(page).toHaveURL(/#\/skills\/react$/);
    await expect(page.getByLabel(/^Id/)).toHaveAttribute('readonly', '');
    await page.getByLabel(/^Years/).fill('6');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    const put = putJson<Skill[]>(gh);
    expect(put.message).toBe('content(skills): update "React"');
    expect(put.data.find((s) => s.id === 'react')).toEqual({ id: 'react', name: 'React', category: 'data', years: 6, icon: 'react' });
  });

  test('duplicate name (case-insensitive) is blocked without a request', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    await page.getByRole('button', { name: '+ New skill' }).click();
    await page.getByLabel(/^Name/).fill('typescript');
    await page.getByLabel(/^Id/).fill('typescript-2');
    await page.getByLabel(/^Category/).selectOption({ label: 'Languages' });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText("A skill named 'TypeScript' already exists")).toBeVisible();
    expect(gh.writes()).toHaveLength(0);
  });

  test('delete asks for confirmation and commits a delete', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    await page.getByRole('button', { name: 'Delete Docker' }).click();
    await expect(page.getByRole('alertdialog')).toContainText("Delete 'Docker'?");
    await page.getByRole('button', { name: 'Delete skill' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    const put = putJson<Skill[]>(gh);
    expect(put.message).toBe('content(skills): delete "Docker"');
    expect(put.data.map((s) => s.id)).toEqual(['typescript', 'fixturelang', 'react']);
    await expect(page.getByRole('button', { name: 'Delete Docker' })).toHaveCount(0);
  });

  test('a 403 on delete shows the no-longer-write message', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    gh.fail('PUT', `${REPO_PATH}/contents/`, 403, { message: 'Resource not accessible by personal access token' });
    await page.getByRole('button', { name: 'Delete Docker' }).click();
    await page.getByRole('button', { name: 'Delete skill' }).click();
    await expect(page.getByRole('alert')).toContainText('This token can no longer write to the repository.');
    expect(headJson<Skill[]>(gh, 'content/skills.json').map((s) => s.id)).toContain('docker');
  });
});

test.describe('reorder', () => {
  test('skills: keyboard moves stay within the category, are local until Save order, then commit once', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    const loadedSha = gh.files.get('content/skills.json')!.sha;
    // Boundaries are per category.
    await expect(page.getByRole('button', { name: "Move 'TypeScript' up" })).toBeDisabled();
    await expect(page.getByRole('button', { name: "Move 'Fixturelang' down" })).toBeDisabled();
    await expect(page.getByRole('button', { name: "Move 'React' up" })).toBeDisabled();
    await expect(page.getByRole('button', { name: "Move 'React' down" })).toBeDisabled();

    const down = page.getByRole('button', { name: "Move 'TypeScript' down" });
    await down.focus();
    await page.keyboard.press('Enter');
    // The pressed button became disabled (last in its category), so focus moves to its enabled sibling.
    await expect(page.getByRole('button', { name: "Move 'TypeScript' up" })).toBeFocused();
    await expect(page.getByText("Moved 'TypeScript' to position 2 of 2")).toBeAttached();
    await expect(page.getByText('Order changed —')).toBeVisible();
    for (const name of ['+ New skill', 'Edit React', 'Delete Docker']) await expect(page.getByRole('button', { name })).toBeDisabled();
    expect(gh.writes()).toHaveLength(0);

    await page.getByRole('button', { name: 'Save order' }).click();
    await expect(page.getByText('Order changed —')).toHaveCount(0);
    await expect(page.getByText(SAVED)).toBeVisible();
    expect(gh.writes()).toHaveLength(1);
    const put = putJson<Skill[]>(gh);
    expect(put.message).toBe('content(skills): reorder');
    expect((gh.writes()[0]!.body as { sha: string }).sha).toBe(loadedSha);
    expect(put.data.map((s) => s.id)).toEqual(['fixturelang', 'typescript', 'react', 'docker']);
    await expect(page.getByRole('button', { name: 'Edit React' })).toBeEnabled();
  });

  test('Discard restores the loaded order without a commit', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Certifications');
    const rows = page.getByRole('listitem');
    await expect(rows.first()).toContainText('Fixture Current Certification');
    await page.getByRole('button', { name: "Move 'Fixture Current Certification' down" }).click();
    await expect(rows.first()).toContainText('Fixture Expired Certification');
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(rows.first()).toContainText('Fixture Current Certification');
    await expect(page.getByText('Order changed —')).toHaveCount(0);
    expect(gh.writes()).toHaveLength(0);
  });

  test('focus never drops to <body> while the order is committing (A1-25)', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Experience');
    // Hold the commit until released; route.fallback() hands it to FakeGitHub's handler.
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    // Octokit encodes the path's "/" as %2F.
    await page.route(/api\.github\.com\/repos\/.+\/contents\/content(\/|%2F)experience\.json/i, async (route) => {
      if (route.request().method() === 'PUT') await held;
      await route.fallback();
    });
    const upBtn = page.getByRole('button', { name: "Move 'Fixture Degree @ Fixture School' up" });
    await upBtn.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save order' }).focus();
    await page.keyboard.press('Enter');
    const busy = page.getByRole('button', { name: 'Saving…' });
    await expect(busy).toHaveAttribute('aria-disabled', 'true');
    await expect(busy).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await page.keyboard.press('Enter');
    release();
    await expect(page.getByText(SAVED)).toBeVisible();
    expect(gh.writes()).toHaveLength(1);
    await expect(page.getByRole('button', { name: "Move 'Fixture Degree @ Fixture School' down" })).toBeFocused();
  });

  test('experience: Save order commits the reorder message', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Experience');
    await page.getByRole('button', { name: "Move 'Fixture Degree @ Fixture School' up" }).click();
    await page.getByRole('button', { name: 'Save order' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    const put = putJson<Experience[]>(gh);
    expect(put.message).toBe('content(experience): reorder');
    expect(put.data.map((e) => e.id)).toEqual(['fixture-school', 'fixture-company']);
  });
});

test.describe('certifications', () => {
  test('create, edit and delete each commit once with the specified message', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Certifications');
    await page.getByRole('button', { name: '+ New certification' }).click();
    await page.getByLabel(/^Name/).fill('Cloud Practitioner');
    await expect(page.getByLabel(/^Id/)).toHaveValue('cloud-practitioner');
    await page.getByLabel(/^Issuer/).fill('Fixture Cloud');
    await page.getByLabel(/^Issued/).fill('2025-05');
    await page.getByLabel(/^Credential URL/).fill('https://example.com/verify/cp');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    let put = putJson<Certification[]>(gh, 0);
    expect(put.message).toBe('content(certifications): add "Cloud Practitioner"');
    expect(put.data[0]).toEqual({
      id: 'cloud-practitioner', name: 'Cloud Practitioner', issuer: 'Fixture Cloud', issued: '2025-05', credentialUrl: 'https://example.com/verify/cp',
    });

    await page.getByRole('button', { name: 'Edit Cloud Practitioner' }).click();
    await expect(page.getByLabel(/^Id/)).toHaveAttribute('readonly', '');
    await page.getByLabel(/^Expires/).fill('2028-05');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    put = putJson<Certification[]>(gh, 1);
    expect(put.message).toBe('content(certifications): update "Cloud Practitioner"');
    expect(put.data[0]!.expires).toBe('2028-05');

    await page.getByRole('button', { name: 'Delete Fixture Expired Certification' }).click();
    await page.getByRole('button', { name: 'Delete certification' }).click();
    await expect(page.getByRole('button', { name: 'Delete Fixture Expired Certification' })).toHaveCount(0);
    put = putJson<Certification[]>(gh, 2);
    expect(put.message).toBe('content(certifications): delete "Fixture Expired Certification"');
    expect(put.data.map((c) => c.id)).toEqual(['cloud-practitioner', 'fixture-current-cert']);
  });

  test('duplicate id and schema errors block the save', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Certifications');
    await page.getByRole('button', { name: '+ New certification' }).click();
    await page.getByLabel(/^Name/).fill('Fixture Current Certification');
    await page.getByLabel(/^Id/).fill('fixture-current-cert');
    await page.getByLabel(/^Issuer/).fill('X');
    await page.getByLabel(/^Issued/).fill('2025-05');
    await page.getByLabel(/^Credential URL/).fill('http://insecure.example');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText("This id is already used by 'Fixture Current Certification'")).toBeVisible();
    await expect(page.getByLabel(/^Credential URL/)).toHaveAttribute('aria-invalid', 'true');
    expect(gh.writes()).toHaveLength(0);
  });

  test('network error on save keeps the form data', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Certifications');
    await page.getByRole('button', { name: 'Edit Fixture Current Certification' }).click();
    await page.getByLabel(/^Issuer/).fill('Kept Issuer');
    gh.offline = true;
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText("Couldn't save. Check your connection and try again.");
    await expect(page.getByLabel(/^Issuer/)).toHaveValue('Kept Issuer');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

test.describe('experience', () => {
  test('create with Present writes end: null; edit and delete commit with the role @ org label', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Experience');
    await page.getByRole('button', { name: '+ New experience' }).click();
    await page.getByLabel(/^Role/).fill('Lead Engineer');
    await page.getByLabel(/^Organization/).fill('Acme');
    await expect(page.getByLabel(/^Id/)).toHaveValue('lead-engineer-acme');
    await page.getByLabel(/^Start/).fill('2024-02');
    await page.getByLabel('Present').check();
    await expect(page.getByLabel(END_LABEL)).toBeDisabled();
    await page.getByLabel(/^Highlights/).fill('Led things\n\n  Shipped stuff  \n');
    await page.getByLabel(/^Tags/).fill('Go, Go, Kubernetes');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    let put = putJson<Experience[]>(gh, 0);
    expect(put.message).toBe('content(experience): add "Lead Engineer @ Acme"');
    expect(put.data[0]).toEqual({
      id: 'lead-engineer-acme', type: 'work', role: 'Lead Engineer', org: 'Acme', start: '2024-02', end: null,
      highlights: ['Led things', 'Shipped stuff'], tags: ['Go', 'Kubernetes'],
    });

    await page.getByRole('button', { name: 'Edit Fixture Degree @ Fixture School' }).click();
    await page.getByLabel('Education').check();
    await page.getByLabel(/^Location/).fill('Fixture Town');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    put = putJson<Experience[]>(gh, 1);
    expect(put.message).toBe('content(experience): update "Fixture Degree @ Fixture School"');
    expect(put.data.find((e) => e.id === 'fixture-school')!.location).toBe('Fixture Town');

    await page.getByRole('button', { name: 'Delete Fixture Role @ Fixture Company' }).click();
    await page.getByRole('button', { name: 'Delete experience' }).click();
    await expect(page.getByRole('button', { name: 'Delete Fixture Role @ Fixture Company' })).toHaveCount(0);
    put = putJson<Experience[]>(gh, 2);
    expect(put.message).toBe('content(experience): delete "Fixture Role @ Fixture Company"');
    expect(put.data.map((e) => e.id)).toEqual(['lead-engineer-acme', 'fixture-school']);
  });

  test('unchecking Present requires an End date on or after Start', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Experience');
    await page.getByRole('button', { name: 'Edit Fixture Role @ Fixture Company' }).click();
    await expect(page.getByLabel('Present')).toBeChecked();
    await page.getByLabel('Present').uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel(END_LABEL)).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel(END_LABEL).fill('2021-01');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel(END_LABEL)).toHaveAttribute('aria-invalid', 'true');
    expect(gh.writes()).toHaveLength(0);
    await page.getByLabel(END_LABEL).fill('2023-06');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(SAVED)).toBeVisible();
    expect(putJson<Experience[]>(gh).data[0]!.end).toBe('2023-06');
  });

  test('more than 8 highlights is blocked', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Experience');
    await page.getByRole('button', { name: 'Edit Fixture Role @ Fixture Company' }).click();
    await page.getByLabel(/^Highlights/).fill(Array.from({ length: 9 }, (_, i) => `H${i}`).join('\n'));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Use at most 8 highlights')).toBeVisible();
    expect(gh.writes()).toHaveLength(0);
  });

  test('conflict on save', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Experience');
    await page.getByRole('button', { name: 'Edit Fixture Role @ Fixture Company' }).click();
    gh.changeElsewhere('content/experience.json');
    await page.getByLabel(/^Location/).fill('Elsewhere');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Content changed elsewhere — reload to get the latest version.');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

test.describe('navigation', () => {
  test('tabs load each file once, unknown routes fall back to projects', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    await expect(page.getByRole('button', { name: 'Edit TypeScript' })).toBeVisible();
    await openTab(page, 'Projects');
    await openTab(page, 'Skills');
    await expect(page.getByRole('button', { name: 'Edit TypeScript' })).toBeVisible();
    const skillGets = gh.requests.filter((r) => r.method === 'GET' && r.path.endsWith('/contents/content/skills.json'));
    expect(skillGets).toHaveLength(1);
    await page.evaluate(() => {
      location.hash = '#/nope/really';
    });
    await expect(page).toHaveURL(/#\/projects$/);
  });

  test('switching tabs with unsaved changes asks to discard; cancel keeps the form', async ({ page }) => {
    await loggedIn(page);
    await openTab(page, 'Skills');
    await page.getByRole('button', { name: 'Edit React' }).click();
    await page.getByLabel(/^Years/).fill('9');
    const messages: string[] = [];
    page.once('dialog', (d) => {
      messages.push(d.message());
      void d.dismiss();
    });
    await openTab(page, 'Projects');
    expect(messages).toEqual(['Discard unsaved changes?']);
    await expect(page).toHaveURL(/#\/skills\/react$/);
    await expect(page.getByLabel(/^Years/)).toHaveValue('9');
    page.once('dialog', (d) => void d.accept());
    await openTab(page, 'Projects');
    await expect(page).toHaveURL(/#\/projects$/);
  });
});
