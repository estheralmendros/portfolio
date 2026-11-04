import { Octokit } from '@octokit/rest';
import { SITE } from '../../config/site';
import { decodeUtf8Base64, encodeUtf8Base64 } from './base64';
import {
  AuthError, ConflictError, GitHubApiError, NetworkError, NotFoundError, PermissionError, RateLimitError, toAppError,
} from './errors';

export type VerifyResult =
  | { ok: true; login: string }
  | {
      ok: false;
      reason: 'invalid-format' | 'invalid-token' | 'wrong-user' | 'no-repo-access' | 'no-write-access' | 'network' | 'rate-limited';
      login?: string;
      resetAt?: Date;
    };

export type FileChange =
  | { path: string; content: string; encoding: 'utf-8' | 'base64' }
  | { path: string; delete: true }; // tree entry { path, mode: '100644', type: 'blob', sha: null }

export interface WorkflowRun {
  id: number;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending';
  conclusion: string | null;
  html_url: string;
  run_started_at: string | null; // ISO 8601
}

export interface GitHubClient {
  verifyToken(): Promise<VerifyResult>;
  getFile(path: string): Promise<{ content: string; sha: string }>;
  putFile(args: { path: string; content: string; sha: string; message: string }): Promise<{ sha: string; commitSha: string }>;
  /** One commit with several files (Git Data API); see prd2 "commitFiles algorithm". */
  commitFiles(args: { files: FileChange[]; message: string; expectedShas: Record<string, string> }): Promise<{
    commitSha: string;
    blobShas: Record<string, string>;
  }>;
  /** Latest run of SITE.deployWorkflow for the commit, or null. PermissionError on 403 or 404. */
  getWorkflowRunForCommit(commitSha: string): Promise<WorkflowRun | null>;
}

type Step = 'user' | 'repo' | 'blob';

/** Steps 2/2b read only `sha`; the default media type fails for files over 1 MB. */
const OBJECT_MEDIA_TYPE = 'application/vnd.github.object';
const MAX_RESTARTS = 2;

const statusOf = (e: unknown): number | undefined =>
  typeof e === 'object' && e !== null && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : undefined;

const messageOf = (e: unknown): string => {
  const err = e as { message?: unknown; response?: { data?: { message?: unknown } } };
  const m = err?.response?.data?.message ?? err?.message;
  return typeof m === 'string' ? m : '';
};

/** commitFiles mapping: 401/rate limit/403/network keep the MVP classes; any other HTTP status → GitHubApiError. */
function toCommitError(e: unknown): Error {
  const err = toAppError(e);
  if ([AuthError, RateLimitError, PermissionError, NetworkError].some((C) => err instanceof C)) return err;
  const status = statusOf(e);
  return status === undefined ? err : new GitHubApiError(status);
}

const isLostResponse = (e: unknown) => toAppError(e) instanceof NetworkError;

/** Raised inside an attempt when the ref update is not a fast forward (head moved). */
class HeadMoved extends Error {}

function verifyFailure(err: Error, step: Step): VerifyResult {
  if (err instanceof RateLimitError) {
    return err.resetAt ? { ok: false, reason: 'rate-limited', resetAt: err.resetAt } : { ok: false, reason: 'rate-limited' };
  }
  if (err instanceof NetworkError) return { ok: false, reason: 'network' };
  if (err instanceof AuthError) return { ok: false, reason: 'invalid-token' };
  if (step === 'repo' && (err instanceof NotFoundError || err instanceof PermissionError)) return { ok: false, reason: 'no-repo-access' };
  if (step === 'blob' && (err instanceof NotFoundError || err instanceof PermissionError)) return { ok: false, reason: 'no-write-access' };
  if (step === 'user') return { ok: false, reason: 'invalid-token' };
  return { ok: false, reason: 'network' };
}

export function createGitHubClient(opts: { token: string; fetch?: typeof fetch; onAuthError?: () => void }): GitHubClient {
  const token = opts.token.trim();
  const baseFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const octokit = new Octokit({
    request: { fetch: (url: RequestInfo | URL, init?: RequestInit) => baseFetch(url, { ...init, cache: 'no-store' }) },
  });
  // Bearer scheme for fine-grained tokens (Octokit's default auth would send `token <pat>`).
  octokit.hook.before('request', (options) => {
    options.headers.authorization = `Bearer ${token}`;
  });
  const { owner, repo, branch } = SITE;

  /** For calls made after a successful verify: 401 → onAuthError. */
  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const err = toAppError(e);
      if (err instanceof AuthError) opts.onAuthError?.();
      throw err;
    }
  }

  const notifyAuth = (err: Error) => {
    if (err instanceof AuthError) opts.onAuthError?.();
    return err;
  };

  const readHead = async (): Promise<string> => {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', { owner, repo, ref: `heads/${branch}` });
    return data.object.sha;
  };

  /** Blob SHA of `path` at `ref`, or null when the file doesn't exist there. */
  const shaAt = async (path: string, ref: string): Promise<string | null> => {
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner, repo, path, ref, headers: { accept: OBJECT_MEDIA_TYPE },
      });
      return (data as { sha: string }).sha;
    } catch (e) {
      if (statusOf(e) === 404) return null;
      throw e;
    }
  };

  /**
   * After a lost ref-update response, head is neither our commit nor its parent: someone pushed on top.
   * Our commit landed iff every file we wrote is still what we committed there (deletes still absent).
   * A failing check counts as "not landed".
   */
  const landedUnder = async (head: string, changes: FileChange[], blobShas: Record<string, string>): Promise<boolean> => {
    try {
      for (const f of changes) {
        const expected = 'delete' in f ? null : blobShas[f.path];
        if ((await shaAt(f.path, head)) !== expected) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  /** One attempt of steps 1–5; throws HeadMoved on a non-fast-forward ref update. */
  async function attempt(files: FileChange[], message: string, expectedShas: Record<string, string>) {
    const headSha = await readHead().catch((e: unknown) => {
      throw toCommitError(e);
    });
    try {
      for (const [path, expected] of Object.entries(expectedShas)) {
        if ((await shaAt(path, headSha)) !== expected) throw new ConflictError(`${path} changed since it was loaded`);
      }
      const changes: FileChange[] = [];
      for (const f of files) {
        if ('delete' in f && (await shaAt(f.path, headSha)) === null) continue; // already gone
        changes.push(f);
      }
      const { data: headCommit } = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', { owner, repo, commit_sha: headSha });
      const blobShas: Record<string, string> = {};
      const tree = [];
      for (const f of changes) {
        if ('delete' in f) {
          tree.push({ path: f.path, mode: '100644' as const, type: 'blob' as const, sha: null });
          continue;
        }
        const content = f.encoding === 'base64' ? f.content : encodeUtf8Base64(f.content);
        const { data: blob } = await octokit.request('POST /repos/{owner}/{repo}/git/blobs', { owner, repo, content, encoding: 'base64' });
        blobShas[f.path] = blob.sha;
        tree.push({ path: f.path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha });
      }
      const { data: newTree } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', { owner, repo, base_tree: headCommit.tree.sha, tree });
      const { data: commit } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
        owner, repo, message, tree: newTree.sha, parents: [headSha],
      });
      try {
        await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', { owner, repo, ref: `heads/${branch}`, sha: commit.sha, force: false });
      } catch (e) {
        if (statusOf(e) === 422 && /fast[ -]forward/i.test(messageOf(e))) throw new HeadMoved();
        if (!isLostResponse(e)) throw e;
        // 5′: the update may have landed; re-read the ref instead of reporting a failure or committing twice.
        const now = await readHead().catch(() => null);
        if (now !== commit.sha && !(now !== null && now !== headSha && (await landedUnder(now, changes, blobShas)))) {
          throw new NetworkError('The ref update response was lost and the branch does not point to the new commit');
        }
      }
      return { commitSha: commit.sha, blobShas };
    } catch (e) {
      if (e instanceof HeadMoved || e instanceof ConflictError) throw e;
      throw toCommitError(e);
    }
  }

  return {
    async verifyToken() {
      if (!token || !token.startsWith('github_pat_')) return { ok: false, reason: 'invalid-format' };
      let step: Step = 'user';
      try {
        const { data: user } = await octokit.rest.users.getAuthenticated();
        if (user.login.toLowerCase() !== owner.toLowerCase()) return { ok: false, reason: 'wrong-user', login: user.login };
        step = 'repo';
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
        if (repoData.permissions?.push !== true) return { ok: false, reason: 'no-write-access' };
        step = 'blob';
        // Write probe: proves the token itself has Contents write. The dangling blob is garbage-collected.
        await octokit.rest.git.createBlob({ owner, repo, content: '', encoding: 'utf-8' });
        return { ok: true, login: user.login };
      } catch (e) {
        return verifyFailure(toAppError(e), step);
      }
    },

    getFile(path) {
      return call(async () => {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch });
        if (Array.isArray(data) || !('content' in data) || typeof data.content !== 'string') {
          throw new NotFoundError(`${path} is not a file`);
        }
        return { content: decodeUtf8Base64(data.content), sha: data.sha };
      });
    },

    putFile({ path, content, sha, message }) {
      return call(async () => {
        const { data } = await octokit.rest.repos.createOrUpdateFileContents({
          owner, repo, path, message, content: encodeUtf8Base64(content), sha, branch,
        });
        return { sha: data.content?.sha ?? '', commitSha: data.commit.sha ?? '' };
      });
    },

    async commitFiles({ files, message, expectedShas }) {
      try {
        for (let restarts = 0; ; restarts++) {
          try {
            return await attempt(files, message, expectedShas);
          } catch (e) {
            if (!(e instanceof HeadMoved)) throw e;
            if (restarts >= MAX_RESTARTS) throw new ConflictError('The branch kept moving; reload and try again');
          }
        }
      } catch (e) {
        throw notifyAuth(e as Error);
      }
    },

    getWorkflowRunForCommit(commitSha) {
      return call(async () => {
        try {
          const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
            owner, repo, workflow_id: SITE.deployWorkflow, head_sha: commitSha, per_page: 1,
          });
          const run = data.workflow_runs[0];
          if (!run) return null;
          return {
            id: Number(run.id),
            status: run.status as WorkflowRun['status'],
            conclusion: run.conclusion ?? null,
            html_url: run.html_url,
            run_started_at: run.run_started_at ?? null,
          };
        } catch (e) {
          const err = toAppError(e);
          // A missing Actions permission may be reported as 404; a renamed workflow also gives 404.
          if (err instanceof NotFoundError) throw new PermissionError(err.message);
          throw err;
        }
      });
    },
  };
}
