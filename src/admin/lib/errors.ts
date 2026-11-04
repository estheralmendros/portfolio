import type { z } from 'zod';

export class AuthError extends Error {
  override name = 'AuthError';
}
export class RateLimitError extends Error {
  override name = 'RateLimitError';
  resetAt?: Date;
  constructor(message: string, resetAt?: Date) {
    super(message);
    this.resetAt = resetAt;
  }
}
export class PermissionError extends Error {
  override name = 'PermissionError';
}
export class ConflictError extends Error {
  override name = 'ConflictError';
}
export class NotFoundError extends Error {
  override name = 'NotFoundError';
}
export class NetworkError extends Error {
  override name = 'NetworkError';
}
export class ValidationError extends Error {
  override name = 'ValidationError';
  issues: z.core.$ZodIssue[];
  constructor(message: string, issues: z.core.$ZodIssue[] = []) {
    super(message);
    this.issues = issues;
  }
}
export class RemoteContentError extends Error {
  override name = 'RemoteContentError';
  issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.issues = issues;
  }
}

/** User-facing message from Feature 3 (image upload). */
export class ImageError extends Error {
  override name = 'ImageError';
}
/** User-facing message from Feature 4 (CV upload). */
export class CvError extends Error {
  override name = 'CvError';
}

export function githubRejectedMessage(status: number): string {
  return `GitHub rejected the save (HTTP ${status}). Nothing was published.`;
}

/** Unexpected 4xx/422 during commitFiles (never a conflict). */
export class GitHubApiError extends Error {
  override name = 'GitHubApiError';
  status: number;
  constructor(status: number, message: string = githubRejectedMessage(status)) {
    super(message);
    this.status = status;
  }
}

export type HeaderBag = Record<string, string | number | undefined>;

function header(headers: HeaderBag, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  const v = key === undefined ? undefined : headers[key];
  return v === undefined ? undefined : String(v);
}

function resetAtFrom(headers: HeaderBag, now: () => number): Date | undefined {
  const reset = header(headers, 'x-ratelimit-reset');
  if (reset && /^\d+$/.test(reset)) return new Date(Number(reset) * 1000);
  const retry = header(headers, 'retry-after');
  if (retry && /^\d+$/.test(retry)) return new Date(now() + Number(retry) * 1000);
  return undefined;
}

/** Mapping order: 401 → 429/rate-limit 403 → other 403 → 404 → 409/422-sha → 5xx. */
export function mapHttpError(status: number, headers: HeaderBag, message: string, now: () => number = Date.now): Error {
  if (status === 401) return new AuthError(message || 'Unauthorized');
  const rateLimited =
    status === 429 ||
    (status === 403 && (header(headers, 'x-ratelimit-remaining') === '0' || /secondary rate limit/i.test(message)));
  if (rateLimited) return new RateLimitError(message || 'Rate limited', resetAtFrom(headers, now));
  if (status === 403) return new PermissionError(message || 'Forbidden');
  if (status === 404) return new NotFoundError(message || 'Not found');
  if (status === 409 || (status === 422 && /\bsha\b/i.test(message))) return new ConflictError(message || 'Conflict');
  if (status >= 500 || status === 0) return new NetworkError(message || `HTTP ${status}`);
  return new Error(`GitHub error ${status}: ${message}`);
}

const APP_ERRORS = [
  AuthError, RateLimitError, PermissionError, ConflictError, NotFoundError, NetworkError, ValidationError, RemoteContentError,
  ImageError, CvError, GitHubApiError,
];

const FETCH_FAILURE_RE = /fetch|network|load failed/i;

/** Normalizes anything thrown by fetch/Octokit into an errors.ts class. */
export function toAppError(err: unknown): Error {
  if (APP_ERRORS.some((C) => err instanceof C)) return err as Error;
  if (typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number') {
    const e = err as { status: number; message?: string; response?: { headers?: HeaderBag; data?: { message?: string } } };
    const message = e.response?.data?.message ?? e.message ?? '';
    return mapHttpError(e.status, e.response?.headers ?? {}, message);
  }
  // fetch rejects with a TypeError on network failure (Chromium "Failed to fetch", Firefox "NetworkError when
  // attempting to fetch resource.", Safari "Load failed"); other TypeErrors are bugs and stay generic.
  if (err instanceof TypeError && FETCH_FAILURE_RE.test(err.message)) return new NetworkError(err.message);
  return err instanceof Error ? err : new Error(String(err));
}

export function rateLimitMessage(resetAt: Date | undefined): string {
  if (!resetAt) return "GitHub's rate limit was reached. Try again in a few minutes.";
  const hh = String(resetAt.getHours()).padStart(2, '0');
  const mm = String(resetAt.getMinutes()).padStart(2, '0');
  return `GitHub's rate limit was reached. Try again after ${hh}:${mm}.`;
}
