import { describe, expect, it } from 'vitest';
import { formatBytes, saveFailureMessage, savedMessage, verifyMessage, SESSION_EXPIRED } from '../../../src/admin/messages';
import {
  AuthError, ConflictError, GitHubApiError, NetworkError, PermissionError, RateLimitError, ValidationError,
} from '../../../src/admin/lib/errors';

describe('verifyMessage (one per verify-result row)', () => {
  it.each([
    [{ ok: false, reason: 'invalid-format' }, 'Use a fine-grained token (it starts with github_pat_).'],
    [{ ok: false, reason: 'invalid-token' }, "GitHub rejected this token. Check it was copied fully and hasn't expired."],
    [{ ok: false, reason: 'wrong-user', login: 'someone' }, 'This token belongs to @someone. Only @estheralmendros can use this admin.'],
    [{ ok: false, reason: 'no-repo-access' }, "Can't find estheralmendros/portfolio with this token. Check the repository exists and is included in the token's Repository access."],
    [{ ok: false, reason: 'no-write-access' }, "This token can't write to estheralmendros/portfolio. Make sure Repository access includes it and Contents is Read and write."],
    [{ ok: false, reason: 'network' }, "Couldn't reach GitHub. Check your connection and try again."],
    [{ ok: false, reason: 'rate-limited' }, "GitHub's rate limit was reached. Try again in a few minutes."],
  ] as const)('%o', (result, message) => expect(verifyMessage(result)).toBe(message));
  it('rate-limited with resetAt shows HH:MM', () =>
    expect(verifyMessage({ ok: false, reason: 'rate-limited', resetAt: new Date(2026, 0, 1, 14, 30) })).toBe(
      "GitHub's rate limit was reached. Try again after 14:30.",
    ));
  it('session expired copy', () => expect(SESSION_EXPIRED).toBe('Your session expired or the token was revoked. Log in again.'));
});

describe('saveFailureMessage (same mapping on every screen)', () => {
  it.each([
    [new ConflictError('409'), 'Content changed elsewhere — reload to get the latest version. Your unsaved changes will be lost.'],
    [new RateLimitError('x', new Date(2026, 0, 1, 9, 5)), "GitHub's rate limit was reached. Try again after 09:05."],
    [new PermissionError('x'), 'This token can no longer write to the repository.'],
    [new GitHubApiError(422), 'GitHub rejected the save (HTTP 422). Nothing was published.'],
    [new NetworkError('x'), "Couldn't save. Check your connection and try again."],
    [new Error('boom'), "Couldn't save. Check your connection and try again."],
    [new ValidationError('bad', [{ code: 'custom', path: [1, 'name'], message: 'Skill "Go" is duplicated', input: 'Go' }]),
      'Not saved: Skill "Go" is duplicated'],
  ] as const)('%s', (err, text) => expect(saveFailureMessage(err)).toBe(text));
  it('AuthError shows nothing (forced logout already explains it)', () => expect(saveFailureMessage(new AuthError('401'))).toBeNull());
});

describe('phase 4 copy', () => {
  it('savedMessage: MVP copy without files; redeploy copy for images/CV; the PRD CV-removed copy', () => {
    expect(savedMessage()).toBe('Saved. The site will update after the next deploy (a few minutes).');
    expect(savedMessage(['image'])).toBe('Saved. The new image appears on the site after the next deploy (a few minutes).');
    expect(savedMessage(['cv'])).toBe('Saved. The new CV is available on the site after the next deploy (a few minutes).');
    expect(savedMessage(['image', 'cv'])).toBe('Saved. The new image and CV appear on the site after the next deploy (a few minutes).');
    expect(savedMessage(['-cv'])).toBe('CV removed. The download link disappears after the next deploy.');
    expect(savedMessage(['image', '-cv'])).toMatch(/^CV removed\. The download link disappears after the next deploy\. /);
  });

  it('formatBytes: KB below 1 MB, MB with one decimal above', () => {
    expect(formatBytes(412 * 1024)).toBe('412 KB');
    expect(formatBytes(10)).toBe('1 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
  });
});

describe('review copy', () => {
  it('idTaken takes the noun (slug for projects); invalidFormMessage adds the first message when known', async () => {
    const { idTaken, invalidFormMessage, slugHint } = await import('../../../src/admin/messages');
    expect(idTaken('X')).toBe("This id is already used by 'X'");
    expect(idTaken('X', 'slug')).toBe("This slug is already used by 'X'");
    expect(invalidFormMessage()).toBe('Fix errors to save');
    expect(invalidFormMessage('Bad')).toBe('Fix errors to save: Bad');
    expect(slugHint('/base/projects/<slug>/')).toBe('Used in the URL: /base/projects/<slug>/');
  });
});
