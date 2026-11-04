import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, type FileChange } from '../../../src/admin/lib/githubClient';
import {
  AuthError, ConflictError, GitHubApiError, NetworkError, PermissionError, RateLimitError,
} from '../../../src/admin/lib/errors';
import { SITE } from '../../../src/config/site';

const TOKEN = 'github_pat_TEST';
const R = '/repos/estheralmendros/portfolio';
const OBJECT = 'application/vnd.github.object';

interface Call { key: string; url: URL; init: RequestInit; body: unknown; accept: string | null }
type Reply = Response | (() => never);
type Handler = (call: Call, n: number) => Reply;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const lost = (): never => {
  throw new TypeError('Failed to fetch');
};

/** Route table keyed by "METHOD /path"; handlers get the call and its per-key index. */
function harness(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const counts = new Map<string, number>();
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const key = `${(init.method ?? 'GET').toUpperCase()} ${decodeURIComponent(url.pathname)}`;
    const call: Call = { key, url, init, body: init.body ? JSON.parse(String(init.body)) : undefined, accept: new Headers(init.headers).get('accept') };
    calls.push(call);
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    const reply = handler(call, n);
    return typeof reply === 'function' ? reply() : reply;
  });
  const onAuthError = vi.fn();
  const client = createGitHubClient({ token: TOKEN, fetch: fetchImpl as unknown as typeof fetch, onAuthError });
  return { client, calls, onAuthError, keys: () => calls.map((c) => c.key) };
}

const JSON_PATH = 'content/projects.json';
const IMG_PATH = 'src/assets/uploads/projects/app-a1b2c3.webp';
const CV = 'public/uploads/cv.pdf';

/** A healthy repo at head "h1" (tree "t1") where projects.json has blob sha "s1" and cv.pdf exists. */
function repo(over: Record<string, Handler> = {}): Record<string, Handler> {
  let blob = 0;
  return {
    [`GET ${R}/git/ref/heads/main`]: () => json(200, { ref: 'refs/heads/main', object: { sha: 'h1', type: 'commit' } }),
    [`GET ${R}/contents/${JSON_PATH}`]: () => json(200, { type: 'file', path: JSON_PATH, sha: 's1', content: '' }),
    [`GET ${R}/contents/${CV}`]: () => json(200, { type: 'file', path: CV, sha: 'cv1', content: '' }),
    [`GET ${R}/git/commits/h1`]: () => json(200, { sha: 'h1', tree: { sha: 't1' } }),
    [`GET ${R}/git/commits/h2`]: () => json(200, { sha: 'h2', tree: { sha: 't2' } }),
    [`POST ${R}/git/blobs`]: () => json(201, { sha: `b${++blob}` }),
    [`POST ${R}/git/trees`]: () => json(201, { sha: 'nt' }),
    [`POST ${R}/git/commits`]: () => json(201, { sha: 'nc' }),
    [`PATCH ${R}/git/refs/heads/main`]: () => json(200, { ref: 'refs/heads/main', object: { sha: 'nc' } }),
    ...over,
  };
}

const jsonFile: FileChange = { path: JSON_PATH, content: '[{"title":"Gestión"}]\n', encoding: 'utf-8' };
const imgFile: FileChange = { path: IMG_PATH, content: 'AAEC', encoding: 'base64' };
const args = (files: FileChange[] = [jsonFile, imgFile]) => ({ files, message: 'content(projects): update "App" (+image)', expectedShas: { [JSON_PATH]: 's1' } });

describe('commitFiles: happy path', () => {
  it('makes the exact request sequence and returns the commit and blob SHAs', async () => {
    const h = harness(repo());
    const res = await h.client.commitFiles({ ...args([jsonFile, imgFile, { path: CV, delete: true }]) });
    expect(res).toEqual({ commitSha: 'nc', blobShas: { [JSON_PATH]: 'b1', [IMG_PATH]: 'b2' } });
    expect(h.keys()).toEqual([
      `GET ${R}/git/ref/heads/main`,
      `GET ${R}/contents/${JSON_PATH}`,
      `GET ${R}/contents/${CV}`,
      `GET ${R}/git/commits/h1`,
      `POST ${R}/git/blobs`,
      `POST ${R}/git/blobs`,
      `POST ${R}/git/trees`,
      `POST ${R}/git/commits`,
      `PATCH ${R}/git/refs/heads/main`,
    ]);
    const [, step2, step2b, , blob1, blob2, tree, commit, patch] = h.calls;
    for (const c of [step2, step2b]) {
      expect(c!.url.searchParams.get('ref')).toBe('h1');
      expect(c!.accept).toBe(OBJECT);
    }
    expect(blob1!.body).toEqual({ content: Buffer.from(jsonFile.content, 'utf8').toString('base64'), encoding: 'base64' });
    expect(blob2!.body).toEqual({ content: 'AAEC', encoding: 'base64' });
    expect(tree!.body).toEqual({
      base_tree: 't1',
      tree: [
        { path: JSON_PATH, mode: '100644', type: 'blob', sha: 'b1' },
        { path: IMG_PATH, mode: '100644', type: 'blob', sha: 'b2' },
        { path: CV, mode: '100644', type: 'blob', sha: null },
      ],
    });
    expect(commit!.body).toEqual({ message: 'content(projects): update "App" (+image)', tree: 'nt', parents: ['h1'] });
    expect(patch!.body).toEqual({ sha: 'nc', force: false });
    for (const c of h.calls) {
      expect(new Headers(c.init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
      expect(c.init.cache).toBe('no-store');
    }
  });

  it('drops a delete entry whose file is already gone at head (step 2b 404)', async () => {
    const h = harness(repo({ [`GET ${R}/contents/${CV}`]: () => json(404, { message: 'Not Found' }) }));
    const res = await h.client.commitFiles({ files: [jsonFile, { path: CV, delete: true }], message: 'm', expectedShas: { [JSON_PATH]: 's1' } });
    expect(res.commitSha).toBe('nc');
    const tree = h.calls.find((c) => c.key.endsWith('/git/trees'))!.body as { tree: { path: string }[] };
    expect(tree.tree.map((e) => e.path)).toEqual([JSON_PATH]);
  });
});

describe('commitFiles: conflicts', () => {
  it('expected SHA differs at head → ConflictError, nothing written', async () => {
    const h = harness(repo({ [`GET ${R}/contents/${JSON_PATH}`]: () => json(200, { sha: 'other', content: '' }) }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(ConflictError);
    expect(h.keys().some((k) => k.startsWith('POST') || k.startsWith('PATCH'))).toBe(false);
  });

  it('expected file deleted at head (404) → ConflictError', async () => {
    const h = harness(repo({ [`GET ${R}/contents/${JSON_PATH}`]: () => json(404, { message: 'Not Found' }) }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(ConflictError);
  });

  it('non-fast-forward 422 after an unrelated head move restarts from GET ref and succeeds on the new head', async () => {
    const h = harness(repo({
      [`GET ${R}/git/ref/heads/main`]: (_c, n) => json(200, { object: { sha: n === 0 ? 'h1' : 'h2' } }),
      [`POST ${R}/git/commits`]: (_c, n) => json(201, { sha: `nc${n}` }),
      [`PATCH ${R}/git/refs/heads/main`]: (_c, n) => (n === 0 ? json(422, { message: 'Update is not a fast forward' }) : json(200, { object: { sha: 'nc1' } })),
    }));
    const res = await h.client.commitFiles(args());
    expect(res.commitSha).toBe('nc1');
    expect(h.keys().filter((k) => k === `GET ${R}/git/ref/heads/main`)).toHaveLength(2);
    const contentChecks = h.calls.filter((c) => c.key === `GET ${R}/contents/${JSON_PATH}`);
    expect(contentChecks.map((c) => c.url.searchParams.get('ref'))).toEqual(['h1', 'h2']);
    const commits = h.calls.filter((c) => c.key === `POST ${R}/git/commits`).map((c) => c.body as { parents: string[]; tree: string });
    expect(commits.map((c) => c.parents)).toEqual([['h1'], ['h2']]);
    expect(h.calls.filter((c) => c.key === `GET ${R}/git/commits/h2`)).toHaveLength(1);
    // Blobs are re-created on the restart (nothing from the failed attempt is reused).
    expect(h.keys().filter((k) => k === `POST ${R}/git/blobs`)).toHaveLength(4);
  });

  it('related head move (expected file changed) during the restart → ConflictError', async () => {
    const h = harness(repo({
      [`GET ${R}/git/ref/heads/main`]: (_c, n) => json(200, { object: { sha: n === 0 ? 'h1' : 'h2' } }),
      [`GET ${R}/contents/${JSON_PATH}`]: (c) => json(200, { sha: c.url.searchParams.get('ref') === 'h1' ? 's1' : 's2', content: '' }),
      [`PATCH ${R}/git/refs/heads/main`]: () => json(422, { message: 'Update is not a fast forward' }),
    }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(ConflictError);
    expect(h.keys().filter((k) => k.startsWith('PATCH'))).toHaveLength(1);
  });

  it('gives up with ConflictError after 2 restarts', async () => {
    const h = harness(repo({ [`PATCH ${R}/git/refs/heads/main`]: () => json(422, { message: 'Update is not a fast forward' }) }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(ConflictError);
    expect(h.keys().filter((k) => k.startsWith('PATCH'))).toHaveLength(3);
    expect(h.keys().filter((k) => k === `GET ${R}/git/ref/heads/main`)).toHaveLength(3);
  });
});

describe('commitFiles: lost PATCH response (step 5′)', () => {
  it('re-reads the ref; equal to the new commit → success', async () => {
    const h = harness(repo({
      [`GET ${R}/git/ref/heads/main`]: (_c, n) => json(200, { object: { sha: n === 0 ? 'h1' : 'nc' } }),
      [`PATCH ${R}/git/refs/heads/main`]: () => lost,
    }));
    expect(await h.client.commitFiles(args())).toEqual({ commitSha: 'nc', blobShas: { [JSON_PATH]: 'b1', [IMG_PATH]: 'b2' } });
    expect(h.keys().slice(-2)).toEqual([`PATCH ${R}/git/refs/heads/main`, `GET ${R}/git/ref/heads/main`]);
  });

  it.each([
    ['network error', () => lost],
    ['502', () => json(502, { message: 'Bad gateway' })],
  ])('re-reads the ref after a %s; different → NetworkError (nothing published)', async (_l, reply) => {
    const h = harness(repo({ [`PATCH ${R}/git/refs/heads/main`]: reply as Handler }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(NetworkError);
    expect(h.keys().filter((k) => k.startsWith('PATCH'))).toHaveLength(1);
    expect(h.keys().at(-1)).toBe(`GET ${R}/git/ref/heads/main`);
  });

  it('re-read failing too → NetworkError', async () => {
    const h = harness(repo({
      [`GET ${R}/git/ref/heads/main`]: (_c, n) => (n === 0 ? json(200, { object: { sha: 'h1' } }) : lost),
      [`PATCH ${R}/git/refs/heads/main`]: () => lost,
    }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('commitFiles: error mapping', () => {
  it.each([
    ['GET ref 404', `GET ${R}/git/ref/heads/main`, 404],
    ['GET commit 404', `GET ${R}/git/commits/h1`, 404],
    ['blob 400', `POST ${R}/git/blobs`, 400],
    ['tree 422', `POST ${R}/git/trees`, 422],
    ['commit 409', `POST ${R}/git/commits`, 409],
    ['commit 422 with "sha"', `POST ${R}/git/commits`, 422],
    ['PATCH other 422', `PATCH ${R}/git/refs/heads/main`, 422],
    ['PATCH 404', `PATCH ${R}/git/refs/heads/main`, 404],
  ])('%s → GitHubApiError (never ConflictError)', async (_l, key, status) => {
    const h = harness(repo({ [key]: () => json(status, { message: 'Invalid sha: Reference update failed' }) }));
    const err = await h.client.commitFiles(args()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubApiError);
    expect((err as GitHubApiError).status).toBe(status);
    expect((err as Error).message).toBe(`GitHub rejected the save (HTTP ${status}). Nothing was published.`);
    if (!key.startsWith('PATCH')) expect(h.keys().some((k) => k.startsWith('PATCH'))).toBe(false);
  });

  it.each([
    `GET ${R}/git/ref/heads/main`,
    `GET ${R}/contents/${JSON_PATH}`,
    `POST ${R}/git/blobs`,
    `PATCH ${R}/git/refs/heads/main`,
  ])('401 on %s → AuthError and onAuthError', async (key) => {
    const h = harness(repo({ [key]: () => json(401, { message: 'Bad credentials' }) }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(AuthError);
    expect(h.onAuthError).toHaveBeenCalledOnce();
  });

  it.each([
    ['403', () => json(403, { message: 'Resource not accessible by personal access token' }), PermissionError],
    ['rate limit', () => json(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' }), RateLimitError],
    ['429', () => json(429, { message: 'slow down' }), RateLimitError],
    ['500', () => json(500, { message: 'boom' }), NetworkError],
    ['network', () => lost, NetworkError],
  ] as const)('%s on step 1–4 maps like the MVP', async (_l, reply, cls) => {
    for (const key of [`GET ${R}/git/ref/heads/main`, `GET ${R}/contents/${JSON_PATH}`, `GET ${R}/git/commits/h1`, `POST ${R}/git/trees`]) {
      const h = harness(repo({ [key]: reply as Handler }));
      await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(cls);
    }
  });

  it('403 on PATCH → PermissionError', async () => {
    const h = harness(repo({ [`PATCH ${R}/git/refs/heads/main`]: () => json(403, { message: 'Forbidden' }) }));
    await expect(h.client.commitFiles(args())).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('getWorkflowRunForCommit', () => {
  const runs = `GET ${R}/actions/workflows/${SITE.deployWorkflow}/runs`;
  const run = {
    id: 7, status: 'in_progress', conclusion: null, html_url: 'https://github.com/estheralmendros/portfolio/actions/runs/7',
    run_started_at: '2026-01-01T10:00:00Z', name: 'Deploy', head_sha: 'abc',
  };

  it('queries SITE.deployWorkflow by head_sha with per_page=1 and maps the run', async () => {
    const h = harness({ [runs]: () => json(200, { total_count: 1, workflow_runs: [run] }) });
    expect(await h.client.getWorkflowRunForCommit('abc')).toEqual({
      id: 7, status: 'in_progress', conclusion: null, html_url: run.html_url, run_started_at: '2026-01-01T10:00:00Z',
    });
    const c = h.calls[0]!;
    expect(c.url.pathname).toBe(`${R}/actions/workflows/deploy.yml/runs`);
    expect(c.url.searchParams.get('head_sha')).toBe('abc');
    expect(c.url.searchParams.get('per_page')).toBe('1');
    expect(c.init.cache).toBe('no-store');
  });

  it('returns null when there is no run yet', async () => {
    const h = harness({ [runs]: () => json(200, { total_count: 0, workflow_runs: [] }) });
    expect(await h.client.getWorkflowRunForCommit('abc')).toBeNull();
  });

  it('defaults a missing run_started_at to null', async () => {
    const { run_started_at: _omit, ...noStart } = run;
    const h = harness({ [runs]: () => json(200, { total_count: 1, workflow_runs: [noStart] }) });
    expect((await h.client.getWorkflowRunForCommit('abc'))?.run_started_at).toBeNull();
  });

  it.each([403, 404])('%i → PermissionError', async (status) => {
    const h = harness({ [runs]: () => json(status, { message: 'Resource not accessible by personal access token' }) });
    await expect(h.client.getWorkflowRunForCommit('abc')).rejects.toBeInstanceOf(PermissionError);
  });

  it('rate-limited 403 → RateLimitError; 401 → AuthError; 500 → NetworkError', async () => {
    const rl = harness({ [runs]: () => json(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' }) });
    await expect(rl.client.getWorkflowRunForCommit('abc')).rejects.toBeInstanceOf(RateLimitError);
    const auth = harness({ [runs]: () => json(401, { message: 'Bad credentials' }) });
    await expect(auth.client.getWorkflowRunForCommit('abc')).rejects.toBeInstanceOf(AuthError);
    expect(auth.onAuthError).toHaveBeenCalledOnce();
    const down = harness({ [runs]: () => json(500, { message: 'boom' }) });
    await expect(down.client.getWorkflowRunForCommit('abc')).rejects.toBeInstanceOf(NetworkError);
  });
});
