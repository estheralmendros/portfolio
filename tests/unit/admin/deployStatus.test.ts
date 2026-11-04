import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapRunToState, pollDeployStatus, type DeployState } from '../../../src/admin/lib/deployStatus';
import { AuthError, NetworkError, NotFoundError, PermissionError, RateLimitError } from '../../../src/admin/lib/errors';
import type { GitHubClient, WorkflowRun } from '../../../src/admin/lib/githubClient';

const URL_ = 'https://github.com/estheralmendros/portfolio/actions/runs/1';
const run = (status: WorkflowRun['status'], conclusion: string | null = null, run_started_at: string | null = null): WorkflowRun => ({
  id: 1, status, conclusion, html_url: URL_, run_started_at,
});

describe('mapRunToState', () => {
  it.each([
    [null, { kind: 'deploying' }],
    ...(['requested', 'queued', 'in_progress', 'waiting', 'pending'] as const).map((s) => [run(s), { kind: 'deploying' }] as const),
    [run('completed', 'success'), { kind: 'live' }],
    ...['failure', 'timed_out', 'startup_failure', 'action_required'].map((c) => [run('completed', c), { kind: 'failed', runUrl: URL_ }] as const),
    ...['cancelled', 'skipped'].map((c) => [run('completed', c), { kind: 'superseded' }] as const),
    ...['neutral', 'stale', 'something-new', null].map((c) => [run('completed', c), { kind: 'unknown', reason: 'unexpected' }] as const),
  ] as [WorkflowRun | null, DeployState][])('%j → %j', (input, expected) => expect(mapRunToState(input)).toEqual(expected));
});

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const iso = (ms: number) => new Date(T0 + ms).toISOString();

/** A client whose run is a function of the elapsed time since T0 (or throws). */
function scripted(at: (elapsed: number) => WorkflowRun | null | Error) {
  const getWorkflowRunForCommit = vi.fn(async () => {
    const r = at(Date.now() - T0);
    if (r instanceof Error) throw r;
    return r;
  });
  return { client: { getWorkflowRunForCommit } as unknown as GitHubClient, calls: getWorkflowRunForCommit };
}

function start(at: (elapsed: number) => WorkflowRun | null | Error, extra: { signal?: AbortSignal } = {}) {
  const { client, calls } = scripted(at);
  const updates: DeployState[] = [];
  pollDeployStatus({ client, commitSha: 'c1', onUpdate: (s) => updates.push(s), now: () => Date.now(), ...extra });
  return { calls, updates, last: () => updates.at(-1) };
}

describe('pollDeployStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it('shows Deploying… at once, polls immediately and then every 5 s for the commit', async () => {
    const p = start(() => null);
    expect(p.updates).toEqual([{ kind: 'deploying' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.calls).toHaveBeenCalledTimes(1);
    expect(p.calls).toHaveBeenCalledWith('c1');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(p.calls).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.calls).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(p.calls).toHaveBeenCalledTimes(4);
    expect(p.updates).toEqual([{ kind: 'deploying' }]);
  });

  it.each([
    ['success', { kind: 'live' }],
    ['failure', { kind: 'failed', runUrl: URL_ }],
    ['cancelled', { kind: 'superseded' }],
    ['neutral', { kind: 'unknown', reason: 'unexpected' }],
  ] as const)('stops on completed/%s', async (conclusion, expected) => {
    const p = start((t) => (t < 20_000 ? run('in_progress', null, iso(0)) : run('completed', conclusion, iso(0))));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(p.last()).toEqual(expected);
    const n = p.calls.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.calls).toHaveBeenCalledTimes(n);
  });

  it.each([
    ['403', new PermissionError('Forbidden')],
    ['404', new NotFoundError('Not Found')],
  ])('%s → unknown/forbidden and stops', async (_l, err) => {
    const p = start(() => err);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.last()).toEqual({ kind: 'unknown', reason: 'forbidden' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.calls).toHaveBeenCalledTimes(1);
  });

  it('a long queue then a normal run ends live, never unknown (12 min queued, 5 min running)', async () => {
    const p = start((t) => {
      if (t < 12 * MIN) return run('queued');
      if (t < 17 * MIN) return run('in_progress', null, iso(12 * MIN));
      return run('completed', 'success', iso(12 * MIN));
    });
    await vi.advanceTimersByTimeAsync(18 * MIN);
    expect(p.updates.map((u) => u.kind)).toEqual(['deploying', 'live']);
  });

  it('the queue budget stops applying once the run is in progress (25 min queued, 10 min running)', async () => {
    const p = start((t) => {
      if (t < 25 * MIN) return run('waiting');
      if (t < 35 * MIN) return run('in_progress', null, iso(25 * MIN));
      return run('completed', 'success', iso(25 * MIN));
    });
    await vi.advanceTimersByTimeAsync(36 * MIN);
    expect(p.updates.map((u) => u.kind)).toEqual(['deploying', 'live']);
  });

  const waiting: [string, () => WorkflowRun | null][] = [
    ['no run', () => null],
    ['queued', () => run('queued')],
    ['requested', () => run('requested')],
    ['pending', () => run('pending')],
  ];
  it.each(waiting)('%s for 30 min → unknown/timeout', async (_l, at) => {
    const p = start(at);
    await vi.advanceTimersByTimeAsync(30 * MIN - 5_000);
    expect(p.last()).toEqual({ kind: 'deploying' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(p.last()).toEqual({ kind: 'unknown', reason: 'timeout' });
    const n = p.calls.mock.calls.length;
    await vi.advanceTimersByTimeAsync(MIN);
    expect(p.calls).toHaveBeenCalledTimes(n);
  });

  it('in_progress for 15 min after run_started_at → unknown/timeout', async () => {
    const p = start((t) => (t < MIN ? run('queued') : run('in_progress', null, iso(MIN))));
    await vi.advanceTimersByTimeAsync(16 * MIN - 5_000);
    expect(p.last()).toEqual({ kind: 'deploying' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(p.last()).toEqual({ kind: 'unknown', reason: 'timeout' });
  });

  it('run_started_at: null → the run budget counts from the first in_progress poll', async () => {
    const p = start((t) => (t < 10 * MIN ? run('queued') : run('in_progress', null, null)));
    await vi.advanceTimersByTimeAsync(24 * MIN);
    expect(p.last()).toEqual({ kind: 'deploying' });
    await vi.advanceTimersByTimeAsync(MIN);
    expect(p.last()).toEqual({ kind: 'unknown', reason: 'timeout' });
  });

  it('a network error keeps the last state and continues', async () => {
    const p = start((t) => (t < 30_000 ? new NetworkError('offline') : run('completed', 'success')));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(p.updates).toEqual([{ kind: 'deploying' }]);
    expect(p.calls.mock.calls.length).toBeGreaterThan(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(p.last()).toEqual({ kind: 'live' });
  });

  it('timeouts are checked on every tick, also during a long outage (R4)', async () => {
    const p = start(() => new NetworkError('offline'));
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(p.last()).toEqual({ kind: 'unknown', reason: 'timeout' });
  });

  it('a rate limit waits until the next interval after resetAt', async () => {
    let limited = true;
    const p = start(() => {
      if (limited) {
        limited = false;
        return new RateLimitError('rate', new Date(T0 + 62_000));
      }
      return run('queued');
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(p.calls).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.calls).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(p.calls).toHaveBeenCalledTimes(2);
    expect(p.updates).toEqual([{ kind: 'deploying' }]);
  });

  it('a rate-limit wait without resetAt uses the normal interval', async () => {
    const p = start((t) => (t === 0 ? new RateLimitError('rate') : run('queued')));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(p.calls).toHaveBeenCalledTimes(2);
  });

  it('a rate-limit wait past the current phase timeout ends as unknown/timeout (R4)', async () => {
    const p = start(() => new RateLimitError('rate', new Date(T0 + 31 * MIN)));
    await vi.advanceTimersByTimeAsync(0);
    expect(p.last()).toEqual({ kind: 'unknown', reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(40 * MIN);
    expect(p.calls).toHaveBeenCalledTimes(1);
  });

  it('a rate-limit wait past the run budget ends as unknown/timeout', async () => {
    const p = start((t) => (t < 10_000 ? run('in_progress', null, iso(0)) : new RateLimitError('rate', new Date(T0 + 20 * MIN))));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(p.last()).toEqual({ kind: 'unknown', reason: 'timeout' });
  });

  it('AuthError stops polling silently (logout handles it)', async () => {
    const p = start(() => new AuthError('bad'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.calls).toHaveBeenCalledTimes(1);
    expect(p.updates).toEqual([{ kind: 'deploying' }]);
  });

  it('abort stops polling and drops an in-flight result', async () => {
    const ctrl = new AbortController();
    let resolveRun: (r: WorkflowRun) => void = () => {};
    const getWorkflowRunForCommit = vi.fn(() => new Promise<WorkflowRun>((r) => { resolveRun = r; }));
    const updates: DeployState[] = [];
    pollDeployStatus({
      client: { getWorkflowRunForCommit } as unknown as GitHubClient, commitSha: 'c1', onUpdate: (s) => updates.push(s), signal: ctrl.signal, now: () => Date.now(),
    });
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    resolveRun(run('completed', 'success'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(updates).toEqual([{ kind: 'deploying' }]);
    expect(getWorkflowRunForCommit).toHaveBeenCalledTimes(1);
  });

  it('abort between polls cancels the next one', async () => {
    const ctrl = new AbortController();
    const p = start(() => null, { signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.calls).toHaveBeenCalledTimes(1);
  });

  it('an already-aborted signal does nothing', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const p = start(() => null, { signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(p.calls).not.toHaveBeenCalled();
    expect(p.updates).toEqual([]);
  });

  it('honours custom interval and timeouts', async () => {
    const { client, calls } = scripted(() => null);
    const updates: DeployState[] = [];
    pollDeployStatus({ client, commitSha: 'c1', onUpdate: (s) => updates.push(s), intervalMs: 1_000, queueTimeoutMs: 3_000, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calls).toHaveBeenCalledTimes(4);
    expect(updates.at(-1)).toEqual({ kind: 'unknown', reason: 'timeout' });
  });
});
