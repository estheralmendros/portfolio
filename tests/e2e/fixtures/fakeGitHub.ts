// In-memory GitHub API for e2e tests, installed with page.route. No real GitHub calls ever leave the browser.
// The core (`respond`) is pure so unit tests can drive the real githubClient against it through `fetch`.
//
// SHA scheme: blob SHAs are real git SHA-1 values (sha1("blob <len>\0" + bytes)), shared by the Contents API and the
// Git Data API, so a JSON blob SHA from commitFiles equals the SHA the next GET contents returns.
// Every change to the repo (setFile, Contents PUT, PATCH ref, pushCommit) is a commit on `main`, so `?ref=<commit>`
// reads the snapshot at that commit.
import type { Page, Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const OWNER = 'estheralmendros';
export const REPO = 'portfolio';
export const GOOD_TOKEN = 'github_pat_e2e_owner';
export const DEPLOY_WORKFLOW = 'deploy.yml';
/** GitHub serves the default Contents media type only for files up to 1 MB. */
export const CONTENTS_DEFAULT_MAX_BYTES = 1024 * 1024;
const OBJECT_MEDIA_TYPE = 'application/vnd.github.object';

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface FakeRequest {
  method: string;
  url: string;
  headers: Record<string, string>; // lowercase names
  body: unknown;
}

export type FakeResponse = { status: number; body?: unknown; headers?: Record<string, string> } | { abort: true };

export interface FakeFile {
  /** UTF-8 view of the bytes (for JSON files). */
  content: string;
  bytes: Buffer;
  sha: string;
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string | null;
}
export interface RecordedTree {
  sha: string;
  base_tree: string;
  tree: TreeEntry[];
}
export interface FakeCommit {
  sha: string;
  tree: string;
  parents: string[];
  message: string;
}

/** One scripted answer of the Actions runs endpoint: no run yet, a run, or an HTTP error. */
export type ScriptedRun =
  | null
  | { status: string; conclusion?: string | null; run_started_at?: string | null }
  | { httpStatus: number; message?: string };

interface Override {
  method: string;
  pathPrefix: string;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  times: number;
}

interface Hook {
  method: string;
  pathPrefix: string;
  times: number;
  fn: () => void;
}

interface LostResponse {
  method: string;
  pathPrefix: string;
  /** true: the request takes effect and only the response is lost; false: it never reaches GitHub. */
  apply: boolean;
  times: number;
}

const sha1 = (s: string | Buffer) => createHash('sha1').update(s).digest('hex');
export const gitBlobSha = (bytes: Buffer) => sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
const toFile = (data: string | Buffer): FakeFile => {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return { content: bytes.toString('utf8'), bytes, sha: gitBlobSha(bytes) };
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version, user-agent',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'x-ratelimit-remaining, x-ratelimit-reset, retry-after',
};

export class FakeGitHub {
  /** Files at the head of `main` (mutated in place on every commit). */
  readonly files = new Map<string, FakeFile>();
  readonly requests: RecordedRequest[] = [];
  /** token -> login returned by GET /user. Unknown tokens get 401. */
  readonly users = new Map<string, string>([[GOOD_TOKEN, OWNER]]);
  /** Tokens whose Repository access omits the repo: GET /repos still 200 (public repo), blob probe 403. */
  readonly writeDenied = new Set<string>();
  offline = false;
  /** Every tree created through POST git/trees, in order. */
  readonly treeLog: RecordedTree[] = [];
  /** Every commit created through POST git/commits, in order. */
  readonly commitLog: FakeCommit[] = [];
  headSha = '';

  private readonly blobs = new Map<string, Buffer>();
  private readonly trees = new Map<string, Map<string, FakeFile>>();
  private readonly commits = new Map<string, FakeCommit>();
  private overrides: Override[] = [];
  private hooks: Hook[] = [];
  private lost: LostResponse[] = [];
  private runScript: ScriptedRun[] = [];
  private runCalls = 0;
  private counter = 0;

  constructor() {
    const fixture = readFileSync(path.resolve('tests/fixtures/content/projects.json'), 'utf8');
    this.setFile('content/projects.json', fixture);
  }

  /** Writes a file directly on `main` (a commit made outside the admin). */
  setFile(filePath: string, content: string | Buffer) {
    this.pushCommit({ [filePath]: content }, `fixture: set ${filePath}`);
  }

  /** Simulate another commit changing the file (the admin's loaded SHA becomes stale → 409 on PUT). */
  changeElsewhere(filePath: string) {
    const f = this.files.get(filePath)!;
    this.setFile(filePath, `${f.content}\n`);
  }

  /** Commit on top of head outside the admin; `null` deletes a path. Returns the new head SHA. */
  pushCommit(changes: Record<string, string | Buffer | null>, message = 'external change'): string {
    const snapshot = new Map(this.files);
    for (const [p, data] of Object.entries(changes)) {
      if (data === null) snapshot.delete(p);
      else snapshot.set(p, toFile(data));
    }
    const tree = this.storeTree(snapshot);
    const commit = this.storeCommit(tree, this.headSha ? [this.headSha] : [], message);
    this.moveHead(commit.sha);
    return commit.sha;
  }

  /** Make the next `times` matching requests fail with `status`. */
  fail(method: string, pathPrefix: string, status: number, body: unknown = { message: `HTTP ${status}` }, headers: Record<string, string> = {}, times = 1) {
    this.overrides.push({ method, pathPrefix, status, body, headers, times });
  }

  /** Run `fn` just before the next `times` matching requests are handled (e.g. move head). */
  before(method: string, pathPrefix: string, fn: () => void, times = 1) {
    this.hooks.push({ method, pathPrefix, fn, times });
  }

  /** Another commit lands on `main` right before the next matching request (default: before `PATCH ref`). */
  moveHeadBefore(changes: Record<string, string | Buffer | null>, method = 'PATCH', pathPrefix = `/repos/${OWNER}/${REPO}/git/refs/heads/`) {
    this.before(method, pathPrefix, () => this.pushCommit(changes, 'concurrent change'));
  }

  /** The next matching request's response is lost (network error). `apply` decides whether it took effect. */
  loseResponse(method: string, pathPrefix: string, apply: boolean, times = 1) {
    this.lost.push({ method, pathPrefix, apply, times });
  }

  /** Lose the response of the next `PATCH refs/heads/main` (it is applied unless `apply` is false). */
  losePatchResponse(apply = true) {
    this.loseResponse('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/`, apply);
  }

  /** Answers for successive GETs of the deploy workflow runs; the last one repeats. */
  scriptRuns(steps: ScriptedRun[]) {
    this.runScript = [...steps];
    this.runCalls = 0;
  }

  /** Contents API writes (PUT). */
  writes(): RecordedRequest[] {
    return this.requests.filter((r) => r.method === 'PUT');
  }

  /** Ref updates (PATCH refs/heads/main), whatever their outcome. */
  refUpdates(): RecordedRequest[] {
    return this.requests.filter((r) => r.method === 'PATCH' && r.path.includes('/git/refs/'));
  }

  /** Any commit known to the fake (on `main` or not), by SHA. */
  commitAt(sha: string): FakeCommit | undefined {
    return this.commits.get(sha);
  }

  /** raw.githubusercontent.com requests (admin preview images of uploaded files), as `<ref>/<path>`. */
  readonly rawRequests: string[] = [];

  async install(page: Page) {
    await page.route('https://api.github.com/**', (route) => this.handle(route));
    await page.route('https://raw.githubusercontent.com/**', (route) => this.handleRaw(route));
  }

  /** Serves `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` from the snapshot at `ref`. */
  private async handleRaw(route: Route) {
    const parts = decodeURIComponent(new URL(route.request().url()).pathname).split('/').slice(1);
    const [owner, repo, ref, ...rest] = parts;
    const filePath = rest.join('/');
    this.rawRequests.push(`${ref}/${filePath}`);
    const file = owner === OWNER && repo === REPO ? this.snapshotAt(ref)?.get(filePath) : undefined;
    if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: '404: Not Found' });
    const ext = path.extname(filePath).slice(1);
    const types: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
    return route.fulfill({ status: 200, contentType: types[ext] ?? 'application/octet-stream', body: file.bytes });
  }

  /** A fetch backed by `respond` (unit tests). A lost response throws like a dropped connection. */
  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v;
    });
    let body: unknown;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const res = this.respond({ method: (init.method ?? 'GET').toUpperCase(), url: String(input), headers, body });
    if ('abort' in res) throw new TypeError('Failed to fetch');
    return new Response(res.status === 204 ? null : JSON.stringify(res.body ?? null), {
      status: res.status,
      headers: { 'content-type': 'application/json', ...res.headers },
    });
  };

  private async handle(route: Route) {
    const req = route.request();
    let body: unknown;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    const res = this.respond({ method: req.method(), url: req.url(), headers: req.headers(), body });
    if ('abort' in res) return route.abort(this.offline ? 'internetdisconnected' : 'failed');
    return route.fulfill({
      status: res.status,
      contentType: 'application/json',
      headers: { ...CORS, ...res.headers },
      body: res.status === 204 ? '' : JSON.stringify(res.body ?? null),
    });
  }

  /** Pure request handler: records the request and returns the response (or a lost response). */
  respond(req: FakeRequest): FakeResponse {
    const { method } = req;
    if (method === 'OPTIONS') return { status: 204 };
    if (this.offline) return { abort: true };
    const url = new URL(req.url);
    const p = decodeURIComponent(url.pathname);
    const query = Object.fromEntries(url.searchParams);
    this.requests.push({ method, path: p, query, headers: req.headers, body: req.body });

    const match = <T extends { method: string; pathPrefix: string; times: number }>(list: T[]) =>
      list.find((o) => o.method === method && p.startsWith(o.pathPrefix) && o.times > 0);

    const hook = match(this.hooks);
    if (hook) {
      hook.times -= 1;
      hook.fn();
    }
    const ov = match(this.overrides);
    if (ov) {
      ov.times -= 1;
      return { status: ov.status, body: ov.body, headers: ov.headers };
    }
    const lost = match(this.lost);
    if (lost) {
      lost.times -= 1;
      if (lost.apply) this.route(method, p, query, req);
      return { abort: true };
    }
    return this.route(method, p, query, req);
  }

  private route(method: string, p: string, query: Record<string, string>, req: FakeRequest): FakeResponse {
    const json = (status: number, body: unknown): FakeResponse => ({ status, body });
    const token = (req.headers['authorization'] ?? '').replace(/^Bearer /, '');
    const login = this.users.get(token);
    if (!login) return json(401, { message: 'Bad credentials' });
    const denied = () => json(403, { message: 'Resource not accessible by personal access token' });

    const repoPath = `/repos/${OWNER}/${REPO}`;
    if (method === 'GET' && p === '/user') return json(200, { login });
    if (method === 'GET' && p === repoPath) return json(200, { full_name: `${OWNER}/${REPO}`, private: false, permissions: { push: true } });
    if (!p.startsWith(`${repoPath}/`)) return json(404, { message: 'Not Found' });
    const rest = p.slice(repoPath.length + 1);
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Contents API
    if (rest.startsWith('contents/')) {
      const filePath = rest.slice('contents/'.length);
      if (method === 'GET') {
        const snapshot = this.snapshotAt(query['ref']);
        if (!snapshot) return json(404, { message: `No commit found for the ref ${query['ref']}` });
        const file = snapshot.get(filePath);
        if (!file) return json(404, { message: 'Not Found' });
        const objectType = (req.headers['accept'] ?? '').includes(OBJECT_MEDIA_TYPE);
        const large = file.bytes.length > CONTENTS_DEFAULT_MAX_BYTES;
        if (large && !objectType) {
          return json(403, {
            message: 'This API returns blobs up to 1 MB in size. The requested blob is too large to fetch via the API, but you can use the Git Data API to request blobs up to 100 MB in size.',
            errors: [{ resource: 'Blob', field: 'data', code: 'too_large' }],
          });
        }
        const content = large ? '' : file.bytes.toString('base64').replace(/(.{60})/g, '$1\n');
        return json(200, { type: 'file', path: filePath, sha: file.sha, size: file.bytes.length, encoding: 'base64', content });
      }
      if (method === 'PUT') {
        if (this.writeDenied.has(token)) return denied();
        const b = body as { content: string; sha?: string; message: string; branch: string };
        const file = this.files.get(filePath);
        if (file && b.sha !== file.sha) return json(409, { message: `${filePath} does not match ${b.sha}` });
        const head = this.pushCommit({ [filePath]: Buffer.from(b.content, 'base64') }, b.message);
        return json(200, { content: { path: filePath, sha: this.files.get(filePath)!.sha }, commit: { sha: head } });
      }
    }

    // Git Data API
    if (method === 'GET' && rest === 'git/ref/heads/main') return json(200, { ref: 'refs/heads/main', object: { sha: this.headSha, type: 'commit' } });
    if (method === 'GET' && rest.startsWith('git/commits/')) {
      const commit = this.commits.get(rest.slice('git/commits/'.length));
      if (!commit) return json(404, { message: 'Not Found' });
      return json(200, { sha: commit.sha, tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })), message: commit.message });
    }
    if (method === 'POST' && rest === 'git/blobs') {
      if (this.writeDenied.has(token)) return denied();
      const content = String(body['content'] ?? '');
      const bytes = body['encoding'] === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
      const sha = gitBlobSha(bytes);
      this.blobs.set(sha, bytes);
      return json(201, { sha, url: `https://api.github.com${repoPath}/git/blobs/${sha}` });
    }
    if (method === 'POST' && rest === 'git/trees') {
      if (this.writeDenied.has(token)) return denied();
      const baseSha = String(body['base_tree'] ?? '');
      const base = this.trees.get(baseSha);
      if (!base) return json(422, { message: 'Invalid tree info' });
      const entries = (body['tree'] ?? []) as TreeEntry[];
      const snapshot = new Map(base);
      for (const e of entries) {
        if (e.sha === null) {
          if (!snapshot.has(e.path)) return json(422, { message: `GitRPC::BadObjectState: ${e.path} does not exist` });
          snapshot.delete(e.path);
          continue;
        }
        const bytes = this.blobs.get(e.sha);
        if (!bytes) return json(422, { message: `Invalid tree info: ${e.sha} is not a blob` });
        snapshot.set(e.path, toFile(bytes));
      }
      const sha = this.storeTree(snapshot);
      this.treeLog.push({ sha, base_tree: baseSha, tree: entries });
      return json(201, { sha });
    }
    if (method === 'POST' && rest === 'git/commits') {
      if (this.writeDenied.has(token)) return denied();
      const tree = String(body['tree'] ?? '');
      const parents = (body['parents'] ?? []) as string[];
      if (!this.trees.has(tree) || parents.some((s) => !this.commits.has(s))) return json(422, { message: 'Invalid tree or parent' });
      const commit = this.storeCommit(tree, parents, String(body['message'] ?? ''));
      this.commitLog.push(commit);
      return json(201, { sha: commit.sha, tree: { sha: tree }, parents: parents.map((sha) => ({ sha })) });
    }
    if (method === 'PATCH' && rest === 'git/refs/heads/main') {
      if (this.writeDenied.has(token)) return denied();
      const sha = String(body['sha'] ?? '');
      if (!this.commits.has(sha)) return json(422, { message: 'Object does not exist' });
      if (body['force'] !== true && !this.isAncestor(this.headSha, sha)) return json(422, { message: 'Update is not a fast forward' });
      this.moveHead(sha);
      return json(200, { ref: 'refs/heads/main', object: { sha, type: 'commit' } });
    }

    // Actions
    if (method === 'GET' && rest === `actions/workflows/${DEPLOY_WORKFLOW}/runs`) {
      const step = this.runScript.length ? this.runScript[Math.min(this.runCalls, this.runScript.length - 1)]! : null;
      this.runCalls += 1;
      if (step && 'httpStatus' in step) return json(step.httpStatus, { message: step.message ?? 'Resource not accessible by personal access token' });
      if (!step) return json(200, { total_count: 0, workflow_runs: [] });
      const id = 1000 + this.runCalls;
      return json(200, {
        total_count: 1,
        workflow_runs: [{
          id, name: 'Deploy', head_sha: query['head_sha'] ?? '', status: step.status, conclusion: step.conclusion ?? null,
          run_started_at: step.run_started_at ?? null, html_url: `https://github.com/${OWNER}/${REPO}/actions/runs/${id}`,
        }],
      });
    }
    return json(404, { message: 'Not Found' });
  }

  private snapshotAt(ref: string | undefined): Map<string, FakeFile> | undefined {
    if (!ref || ref === 'main' || ref === 'heads/main' || ref === 'refs/heads/main') return this.files;
    const commit = this.commits.get(ref);
    return commit ? this.trees.get(commit.tree) : undefined;
  }

  private storeTree(snapshot: Map<string, FakeFile>): string {
    const sha = sha1(`tree:${[...snapshot].map(([p, f]) => `${p}:${f.sha}`).sort().join('\n')}`);
    this.trees.set(sha, new Map(snapshot));
    for (const f of snapshot.values()) this.blobs.set(f.sha, f.bytes);
    return sha;
  }

  private storeCommit(tree: string, parents: string[], message: string): FakeCommit {
    const commit = { sha: sha1(`commit:${tree}:${parents.join(',')}:${message}:${++this.counter}`), tree, parents, message };
    this.commits.set(commit.sha, commit);
    return commit;
  }

  private moveHead(sha: string) {
    this.headSha = sha;
    const snapshot = this.trees.get(this.commits.get(sha)!.tree)!;
    this.files.clear();
    for (const [p, f] of snapshot) this.files.set(p, f);
  }

  private isAncestor(ancestor: string, sha: string): boolean {
    const queue = [sha];
    while (queue.length) {
      const s = queue.shift()!;
      if (s === ancestor) return true;
      queue.push(...(this.commits.get(s)?.parents ?? []));
    }
    return false;
  }
}
