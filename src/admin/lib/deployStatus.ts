// Deploy badge state (prd2 Feature 7): maps the deploy workflow run of a commit to a DeployState and polls it.
import { AuthError, NotFoundError, PermissionError, RateLimitError } from './errors';
import type { GitHubClient, WorkflowRun } from './githubClient';

export type DeployState =
  | { kind: 'idle' }
  | { kind: 'deploying' }
  | { kind: 'live' }
  | { kind: 'failed'; runUrl: string }
  | { kind: 'superseded'; runUrl: string }
  | { kind: 'unknown'; reason: 'forbidden' | 'timeout' | 'unexpected' };

const FAILED = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);
const SUPERSEDED = new Set(['cancelled', 'skipped']);

export function mapRunToState(run: WorkflowRun | null): DeployState {
  if (!run || run.status !== 'completed') return { kind: 'deploying' };
  const c = run.conclusion;
  if (c === 'success') return { kind: 'live' };
  if (c !== null && FAILED.has(c)) return { kind: 'failed', runUrl: run.html_url };
  if (c !== null && SUPERSEDED.has(c)) return { kind: 'superseded', runUrl: run.html_url };
  return { kind: 'unknown', reason: 'unexpected' };
}

const TIMEOUT: DeployState = { kind: 'unknown', reason: 'timeout' };

/**
 * Polls every `intervalMs` (first poll immediately) until a final state, abort, or a timeout.
 * Two-phase budget: queue = `queueTimeoutMs` from the start of polling while the run hasn't started;
 * run = `runTimeoutMs` from `run_started_at` (or the first poll that saw `in_progress`).
 * Timeouts are checked on every tick, errors included (review R4).
 */
export function pollDeployStatus(opts: {
  client: GitHubClient;
  commitSha: string;
  onUpdate: (s: DeployState) => void;
  intervalMs?: number;
  queueTimeoutMs?: number;
  runTimeoutMs?: number;
  signal?: AbortSignal;
  now?: () => number;
}): void {
  const { client, commitSha, onUpdate, signal } = opts;
  const intervalMs = opts.intervalMs ?? 5_000;
  const queueTimeoutMs = opts.queueTimeoutMs ?? 30 * 60_000;
  const runTimeoutMs = opts.runTimeoutMs ?? 15 * 60_000;
  const now = opts.now ?? Date.now;
  if (signal?.aborted) return;

  const startedAt = now();
  let runStartedAt: number | null = null;
  let last: DeployState = { kind: 'deploying' };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  };
  signal?.addEventListener('abort', stop);

  const emit = (s: DeployState) => {
    last = s;
    onUpdate(s);
  };
  const finish = (s: DeployState) => {
    emit(s);
    stop();
  };
  const deadline = () => (runStartedAt !== null ? runStartedAt + runTimeoutMs : startedAt + queueTimeoutMs);

  const tick = async () => {
    let delay = intervalMs;
    try {
      const run = await client.getWorkflowRunForCommit(commitSha);
      if (stopped) return;
      const state = mapRunToState(run);
      if (state.kind !== 'deploying') return finish(state);
      if (run?.status === 'in_progress') {
        const started = run.run_started_at ? Date.parse(run.run_started_at) : Number.NaN;
        runStartedAt = Number.isFinite(started) ? started : (runStartedAt ?? now());
      }
      if (last.kind !== 'deploying') emit(state);
    } catch (e) {
      if (stopped) return;
      if (e instanceof PermissionError || e instanceof NotFoundError) return finish({ kind: 'unknown', reason: 'forbidden' });
      if (e instanceof AuthError) return stop(); // forced logout aborts everything else
      if (e instanceof RateLimitError) {
        const wait = e.resetAt ? e.resetAt.getTime() - now() : 0;
        delay = Math.max(intervalMs, Math.ceil(wait / intervalMs) * intervalMs);
        if (now() + delay > deadline()) return finish(TIMEOUT);
      }
      // Network errors, 5xx and anything else: keep the last state and try again.
    }
    if (now() >= deadline()) return finish(TIMEOUT);
    timer = setTimeout(() => void tick(), delay);
  };

  emit(last);
  void tick();
}
