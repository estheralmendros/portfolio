import { describe, expect, it } from 'vitest';
import {
  AuthError, ConflictError, CvError, GitHubApiError, ImageError, NetworkError, NotFoundError, PermissionError, RateLimitError,
  githubRejectedMessage, mapHttpError, rateLimitMessage, toAppError,
} from '../../../src/admin/lib/errors';

const h = (o: Record<string, string> = {}) => o;

describe('mapHttpError (order: 401 → rate limit → 403 → 404 → 409/422-sha → 5xx)', () => {
  it('401 → AuthError', () => expect(mapHttpError(401, h(), 'Bad credentials')).toBeInstanceOf(AuthError));
  it('429 → RateLimitError', () => expect(mapHttpError(429, h(), '')).toBeInstanceOf(RateLimitError));
  it('403 with x-ratelimit-remaining: 0 → RateLimitError', () =>
    expect(mapHttpError(403, h({ 'x-ratelimit-remaining': '0' }), 'API rate limit exceeded')).toBeInstanceOf(RateLimitError));
  it('403 secondary rate limit → RateLimitError', () =>
    expect(mapHttpError(403, h(), 'You have exceeded a secondary rate limit.')).toBeInstanceOf(RateLimitError));
  it('other 403 → PermissionError', () =>
    expect(mapHttpError(403, h({ 'x-ratelimit-remaining': '42' }), 'Resource not accessible')).toBeInstanceOf(PermissionError));
  it('404 → NotFoundError', () => expect(mapHttpError(404, h(), 'Not Found')).toBeInstanceOf(NotFoundError));
  it('409 → ConflictError', () => expect(mapHttpError(409, h(), 'conflict')).toBeInstanceOf(ConflictError));
  it('422 mentioning sha → ConflictError', () =>
    expect(mapHttpError(422, h(), 'Invalid request.\n\n"sha" wasn\'t supplied.')).toBeInstanceOf(ConflictError));
  it('422 without sha → not a conflict', () => expect(mapHttpError(422, h(), 'Validation failed')).not.toBeInstanceOf(ConflictError));
  it('5xx → NetworkError', () => expect(mapHttpError(502, h(), 'Bad gateway')).toBeInstanceOf(NetworkError));
});

describe('RateLimitError.resetAt', () => {
  it('reads x-ratelimit-reset (epoch seconds)', () => {
    const e = mapHttpError(429, h({ 'x-ratelimit-reset': '1700000000' }), '') as RateLimitError;
    expect(e.resetAt?.getTime()).toBe(1700000000 * 1000);
  });
  it('reads retry-after (seconds from now)', () => {
    const now = Date.now();
    const e = mapHttpError(429, h({ 'retry-after': '60' }), '', () => now) as RateLimitError;
    expect(e.resetAt?.getTime()).toBe(now + 60_000);
  });
  it('is undefined without headers', () => expect((mapHttpError(429, h(), '') as RateLimitError).resetAt).toBeUndefined());
});

describe('rateLimitMessage', () => {
  it('formats HH:MM local time', () => {
    const d = new Date(2026, 0, 1, 9, 5);
    expect(rateLimitMessage(d)).toBe("GitHub's rate limit was reached. Try again after 09:05.");
  });
  it('falls back to a few minutes', () => expect(rateLimitMessage(undefined)).toBe("GitHub's rate limit was reached. Try again in a few minutes."));
});

describe('toAppError', () => {
  it('maps a fetch TypeError to NetworkError', () => expect(toAppError(new TypeError('Failed to fetch'))).toBeInstanceOf(NetworkError));
  it('maps an object with status and response headers', () => {
    const err = Object.assign(new Error('x'), { status: 403, response: { headers: { 'x-ratelimit-remaining': '0' }, data: { message: 'x' } } });
    expect(toAppError(err)).toBeInstanceOf(RateLimitError);
  });
  it('passes app errors through', () => {
    const e = new ConflictError('c');
    expect(toAppError(e)).toBe(e);
  });
});

describe('v2 error classes', () => {
  it('ImageError and CvError carry the user-facing message', () => {
    const i = new ImageError('Image is too large to process');
    expect(i).toBeInstanceOf(Error);
    expect(i.name).toBe('ImageError');
    expect(i.message).toBe('Image is too large to process');
    const c = new CvError('CV must be a PDF of 5 MB or less');
    expect(c.name).toBe('CvError');
    expect(c.message).toBe('CV must be a PDF of 5 MB or less');
  });
  it('GitHubApiError carries the status and the PRD message', () => {
    const e = new GitHubApiError(422);
    expect(e.name).toBe('GitHubApiError');
    expect(e.status).toBe(422);
    expect(e.message).toBe('GitHub rejected the save (HTTP 422). Nothing was published.');
    expect(githubRejectedMessage(404)).toBe('GitHub rejected the save (HTTP 404). Nothing was published.');
  });
  it('toAppError passes the new classes through', () => {
    for (const e of [new GitHubApiError(400), new ImageError('x'), new CvError('y')]) expect(toAppError(e)).toBe(e);
  });
});
