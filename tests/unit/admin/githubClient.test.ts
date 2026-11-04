import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient } from '../../../src/admin/lib/githubClient';
import { AuthError, ConflictError, NetworkError, NotFoundError, PermissionError, RateLimitError } from '../../../src/admin/lib/errors';

const TOKEN = 'github_pat_TEST';
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function stubFetch(routes: Record<string, Handler>) {
  const calls: { method: string; url: string; init: RequestInit; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ method, url, init, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${method} ${decodeURIComponent(new URL(url).pathname)}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(url, init);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const okRoutes = (overrides: Record<string, Handler> = {}): Record<string, Handler> => ({
  'GET /user': () => json(200, { login: 'EstherAlmendros' }),
  'GET /repos/estheralmendros/portfolio': () => json(200, { permissions: { push: true } }),
  'POST /repos/estheralmendros/portfolio/git/blobs': () => json(201, { sha: 'blob' }),
  ...overrides,
});

const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

describe('verifyToken', () => {
  it('rejects a non fine-grained token without any request', async () => {
    const { fetchImpl, calls } = stubFetch(okRoutes());
    for (const t of ['', '   ', 'ghp_classic']) {
      expect(await createGitHubClient({ token: t, fetch: fetchImpl }).verifyToken()).toEqual({ ok: false, reason: 'invalid-format' });
    }
    expect(calls).toHaveLength(0);
  });

  it('succeeds after user, repo and blob probe, with bearer auth and no-store', async () => {
    const { fetchImpl, calls } = stubFetch(okRoutes());
    expect(await createGitHubClient({ token: `  ${TOKEN} `, fetch: fetchImpl }).verifyToken()).toEqual({ ok: true, login: 'EstherAlmendros' });
    expect(calls.map((c) => `${c.method} ${decodeURIComponent(new URL(c.url).pathname)}`)).toEqual([
      'GET /user', 'GET /repos/estheralmendros/portfolio', 'POST /repos/estheralmendros/portfolio/git/blobs',
    ]);
    expect(calls[2]?.body).toEqual({ content: '', encoding: 'utf-8' });
    for (const c of calls) {
      expect(headerOf(c.init, 'authorization')).toBe(`Bearer ${TOKEN}`);
      expect(c.init.cache).toBe('no-store');
    }
  });

  it.each([
    ['invalid-token', { 'GET /user': () => json(401, { message: 'Bad credentials' }) }],
    ['no-repo-access', { 'GET /repos/estheralmendros/portfolio': () => json(404, { message: 'Not Found' }) }],
    ['no-repo-access', { 'GET /repos/estheralmendros/portfolio': () => json(403, { message: 'Forbidden' }) }],
    ['no-write-access', { 'GET /repos/estheralmendros/portfolio': () => json(200, { permissions: { push: false } }) }],
    ['no-write-access', { 'POST /repos/estheralmendros/portfolio/git/blobs': () => json(403, { message: 'Resource not accessible by personal access token' }) }],
    ['no-write-access', { 'POST /repos/estheralmendros/portfolio/git/blobs': () => json(404, { message: 'Not Found' }) }],
    ['network', { 'GET /user': () => { throw new TypeError('Failed to fetch'); } }],
    ['network', { 'GET /repos/estheralmendros/portfolio': () => json(503, { message: 'unavailable' }) }],
    ['rate-limited', { 'GET /user': () => json(429, { message: 'slow down' }) }],
    ['rate-limited', { 'POST /repos/estheralmendros/portfolio/git/blobs': () => json(403, { message: 'You have exceeded a secondary rate limit' }) }],
  ] as const)('maps to %s', async (reason, overrides) => {
    const onAuthError = vi.fn();
    const { fetchImpl } = stubFetch(okRoutes(overrides as Record<string, Handler>));
    const res = await createGitHubClient({ token: TOKEN, fetch: fetchImpl, onAuthError }).verifyToken();
    expect(res).toMatchObject({ ok: false, reason });
    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('wrong-user carries the login', async () => {
    const { fetchImpl } = stubFetch(okRoutes({ 'GET /user': () => json(200, { login: 'someone' }) }));
    expect(await createGitHubClient({ token: TOKEN, fetch: fetchImpl }).verifyToken()).toEqual({ ok: false, reason: 'wrong-user', login: 'someone' });
  });

  it('rate-limited carries resetAt', async () => {
    const { fetchImpl } = stubFetch(okRoutes({ 'GET /user': () => json(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' }) }));
    const res = await createGitHubClient({ token: TOKEN, fetch: fetchImpl }).verifyToken();
    expect(res).toEqual({ ok: false, reason: 'rate-limited', resetAt: new Date(1700000000 * 1000) });
  });
});

describe('getFile', () => {
  it('GETs contents at ref=main and decodes UTF-8 base64 with newlines', async () => {
    const b64 = Buffer.from('[{"title":"Gestión"}]\n').toString('base64').replace(/(.{8})/g, '$1\n');
    const { fetchImpl, calls } = stubFetch({ 'GET /repos/estheralmendros/portfolio/contents/content/projects.json': () => json(200, { content: b64, sha: 's1', encoding: 'base64' }) });
    const res = await createGitHubClient({ token: TOKEN, fetch: fetchImpl }).getFile('content/projects.json');
    expect(res).toEqual({ content: '[{"title":"Gestión"}]\n', sha: 's1' });
    expect(new URL(calls[0]!.url).searchParams.get('ref')).toBe('main');
    expect(calls[0]?.init.cache).toBe('no-store');
  });

  it('calls onAuthError on 401 and throws AuthError', async () => {
    const onAuthError = vi.fn();
    const { fetchImpl } = stubFetch({ 'GET /repos/estheralmendros/portfolio/contents/content/projects.json': () => json(401, { message: 'Bad credentials' }) });
    await expect(createGitHubClient({ token: TOKEN, fetch: fetchImpl, onAuthError }).getFile('content/projects.json')).rejects.toBeInstanceOf(AuthError);
    expect(onAuthError).toHaveBeenCalledOnce();
  });

  it.each([
    [404, {}, 'Not Found', NotFoundError],
    [403, {}, 'Forbidden', PermissionError],
    [500, {}, 'boom', NetworkError],
    [429, {}, 'slow', RateLimitError],
  ] as const)('maps %i', async (status, headers, message, cls) => {
    const { fetchImpl } = stubFetch({ 'GET /repos/estheralmendros/portfolio/contents/content/projects.json': () => json(status, { message }, headers) });
    await expect(createGitHubClient({ token: TOKEN, fetch: fetchImpl }).getFile('content/projects.json')).rejects.toBeInstanceOf(cls);
  });
});

describe('putFile', () => {
  const path = 'PUT /repos/estheralmendros/portfolio/contents/content/projects.json';
  it('PUTs base64 content with sha and branch main', async () => {
    const { fetchImpl, calls } = stubFetch({ [path]: () => json(200, { content: { sha: 'new' }, commit: { sha: 'commit' } }) });
    const res = await createGitHubClient({ token: TOKEN, fetch: fetchImpl }).putFile({ path: 'content/projects.json', content: 'Gestión\n', sha: 'old', message: 'msg' });
    expect(res).toEqual({ sha: 'new', commitSha: 'commit' });
    expect(calls[0]?.body).toEqual({ message: 'msg', content: Buffer.from('Gestión\n').toString('base64'), sha: 'old', branch: 'main' });
    expect(headerOf(calls[0]!.init, 'authorization')).toBe(`Bearer ${TOKEN}`);
  });
  it.each([
    [409, 'conflict'],
    [422, 'Invalid request.\n\n"sha" wasn\'t supplied.'],
  ])('maps %i to ConflictError', async (status, message) => {
    const { fetchImpl } = stubFetch({ [path]: () => json(status, { message }) });
    await expect(createGitHubClient({ token: TOKEN, fetch: fetchImpl }).putFile({ path: 'content/projects.json', content: 'x', sha: 'old', message: 'm' })).rejects.toBeInstanceOf(ConflictError);
  });
  it('calls onAuthError on 401', async () => {
    const onAuthError = vi.fn();
    const { fetchImpl } = stubFetch({ [path]: () => json(401, { message: 'Bad credentials' }) });
    await expect(createGitHubClient({ token: TOKEN, fetch: fetchImpl, onAuthError }).putFile({ path: 'content/projects.json', content: 'x', sha: 'old', message: 'm' })).rejects.toBeInstanceOf(AuthError);
    expect(onAuthError).toHaveBeenCalledOnce();
  });
});
