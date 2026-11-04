// The e2e fake GitHub, driven by the real githubClient through its pure `respond` core.
import { describe, expect, it } from 'vitest';
import { createGitHubClient } from '../../../src/admin/lib/githubClient';
import { ConflictError, NetworkError, PermissionError } from '../../../src/admin/lib/errors';
import { CONTENTS_DEFAULT_MAX_BYTES, FakeGitHub, GOOD_TOKEN, gitBlobSha } from '../../e2e/fixtures/fakeGitHub';

const JSON_PATH = 'content/projects.json';
const CV = 'public/uploads/cv.pdf';
const IMG = 'src/assets/uploads/projects/app-a1b2c3.png';
const R = '/repos/estheralmendros/portfolio';

function setup() {
  const gh = new FakeGitHub();
  const client = createGitHubClient({ token: GOOD_TOKEN, fetch: gh.fetch });
  return { gh, client };
}

describe('FakeGitHub', () => {
  it('uses real git blob SHAs, shared by Contents and Git Data', async () => {
    const { client } = setup();
    expect(gitBlobSha(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a'); // `git hash-object`
    const { content, sha } = await client.getFile(JSON_PATH);
    expect(sha).toBe(gitBlobSha(Buffer.from(content)));
    const res = await client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }], message: 'm', expectedShas: { [JSON_PATH]: sha } });
    expect(res.blobShas[JSON_PATH]).toBe(gitBlobSha(Buffer.from('[]\n')));
    expect((await client.getFile(JSON_PATH)).sha).toBe(res.blobShas[JSON_PATH]);
  });

  it('keeps the MVP flows: verify, Contents PUT commits on main, 409 on a stale SHA', async () => {
    const { gh, client } = setup();
    expect(await client.verifyToken()).toEqual({ ok: true, login: 'estheralmendros' });
    const { sha } = await client.getFile(JSON_PATH);
    const before = gh.headSha;
    const put = await client.putFile({ path: JSON_PATH, content: '[]\n', sha, message: 'content(projects): delete "x"' });
    expect(gh.headSha).toBe(put.commitSha);
    expect(gh.commitAt(put.commitSha)?.parents).toEqual([before]);
    expect(gh.writes()).toHaveLength(1);
    await expect(client.putFile({ path: JSON_PATH, content: '[1]\n', sha, message: 'm' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('commitFiles writes JSON + binary image + delete in one commit and records the tree', async () => {
    const { gh, client } = setup();
    gh.setFile(CV, Buffer.from('%PDF-1.7 old'));
    const { sha } = await client.getFile(JSON_PATH);
    const head = gh.headSha;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    const res = await client.commitFiles({
      files: [
        { path: JSON_PATH, content: '[{"title":"Gestión"}]\n', encoding: 'utf-8' },
        { path: IMG, content: png.toString('base64'), encoding: 'base64' },
        { path: CV, delete: true },
      ],
      message: 'content(projects): update "App" (+image)',
      expectedShas: { [JSON_PATH]: sha },
    });
    expect(gh.headSha).toBe(res.commitSha);
    expect(gh.commitAt(res.commitSha)).toMatchObject({ parents: [head], message: 'content(projects): update "App" (+image)' });
    expect(gh.files.get(JSON_PATH)?.content).toBe('[{"title":"Gestión"}]\n');
    expect(gh.files.get(IMG)?.bytes.equals(png)).toBe(true);
    expect(gh.files.has(CV)).toBe(false);
    expect(gh.treeLog).toHaveLength(1);
    expect(gh.treeLog[0]!.tree).toContainEqual({ path: CV, mode: '100644', type: 'blob', sha: null });
    expect(gh.refUpdates()).toHaveLength(1);
  });

  it('a file over 1 MB: default media type → 403 too_large; the object type works (Remove CV of 3 MB)', async () => {
    const { gh, client } = setup();
    gh.setFile(CV, Buffer.alloc(3 * 1024 * 1024, 1));
    const plain = await gh.fetch(`https://api.github.com${R}/contents/${CV}`, { headers: { authorization: `Bearer ${GOOD_TOKEN}` } });
    expect(plain.status).toBe(403);
    expect(((await plain.json()) as { errors: { code: string }[] }).errors[0]!.code).toBe('too_large');
    const obj = await gh.fetch(`https://api.github.com${R}/contents/${CV}`, { headers: { authorization: `Bearer ${GOOD_TOKEN}`, accept: 'application/vnd.github.object' } });
    expect(await obj.json()).toMatchObject({ sha: gh.files.get(CV)!.sha, content: '' });
    expect(gh.files.get(CV)!.bytes.length).toBeGreaterThan(CONTENTS_DEFAULT_MAX_BYTES);

    const { sha } = await client.getFile(JSON_PATH);
    await client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }, { path: CV, delete: true }], message: 'm', expectedShas: { [JSON_PATH]: sha } });
    expect(gh.files.has(CV)).toBe(false);
  });

  it('a delete whose file is already missing is skipped (the fake rejects deleting a missing path)', async () => {
    const { gh, client } = setup();
    const { sha } = await client.getFile(JSON_PATH);
    await client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }, { path: CV, delete: true }], message: 'm', expectedShas: { [JSON_PATH]: sha } });
    expect(gh.treeLog[0]!.tree.map((e) => e.path)).toEqual([JSON_PATH]);
  });

  it('JSON changed elsewhere → ConflictError, head not moved', async () => {
    const { gh, client } = setup();
    const { sha } = await client.getFile(JSON_PATH);
    gh.changeElsewhere(JSON_PATH);
    const head = gh.headSha;
    await expect(client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }], message: 'm', expectedShas: { [JSON_PATH]: sha } })).rejects.toBeInstanceOf(ConflictError);
    expect(gh.headSha).toBe(head);
    expect(gh.refUpdates()).toHaveLength(0);
  });

  it('unrelated head move before GET ref: success on top of the new head, unrelated file kept', async () => {
    const { gh, client } = setup();
    const { sha } = await client.getFile(JSON_PATH);
    gh.moveHeadBefore({ 'src/other.ts': 'x' }, 'GET', `${R}/git/ref/heads/main`);
    const res = await client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }], message: 'm', expectedShas: { [JSON_PATH]: sha } });
    const parent = gh.commitAt(res.commitSha)!.parents[0]!;
    expect(gh.commitAt(parent)?.message).toBe('concurrent change');
    expect(gh.files.get('src/other.ts')?.content).toBe('x');
  });

  it('unrelated head move before PATCH: 422 non-fast-forward, restart, success', async () => {
    const { gh, client } = setup();
    const { sha } = await client.getFile(JSON_PATH);
    gh.moveHeadBefore({ 'src/other.ts': 'x' });
    await client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }], message: 'm', expectedShas: { [JSON_PATH]: sha } });
    expect(gh.refUpdates()).toHaveLength(2);
    expect(gh.files.get(JSON_PATH)?.content).toBe('[]\n');
    expect(gh.files.get('src/other.ts')?.content).toBe('x');
  });

  it('related head move before PATCH → ConflictError, the other change survives', async () => {
    const { gh, client } = setup();
    const { sha } = await client.getFile(JSON_PATH);
    gh.moveHeadBefore({ [JSON_PATH]: '["other"]\n' });
    await expect(client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }], message: 'm', expectedShas: { [JSON_PATH]: sha } })).rejects.toBeInstanceOf(ConflictError);
    expect(gh.files.get(JSON_PATH)?.content).toBe('["other"]\n');
  });

  it('lost PATCH response that was applied → success; not applied → NetworkError and nothing published', async () => {
    const ok = setup();
    const s1 = (await ok.client.getFile(JSON_PATH)).sha;
    ok.gh.losePatchResponse(true);
    const res = await ok.client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }], message: 'm', expectedShas: { [JSON_PATH]: s1 } });
    expect(ok.gh.headSha).toBe(res.commitSha);

    const ko = setup();
    const s2 = (await ko.client.getFile(JSON_PATH)).sha;
    const head = ko.gh.headSha;
    ko.gh.losePatchResponse(false);
    await expect(ko.client.commitFiles({ files: [{ path: JSON_PATH, content: '[]\n', encoding: 'utf-8' }], message: 'm', expectedShas: { [JSON_PATH]: s2 } })).rejects.toBeInstanceOf(NetworkError);
    expect(ko.gh.headSha).toBe(head);
  });

  it('?ref=<commit> reads the snapshot at that commit', async () => {
    const { gh } = setup();
    const old = gh.headSha;
    const oldSha = gh.files.get(JSON_PATH)!.sha;
    gh.changeElsewhere(JSON_PATH);
    const res = await gh.fetch(`https://api.github.com${R}/contents/${JSON_PATH}?ref=${old}`, { headers: { authorization: `Bearer ${GOOD_TOKEN}` } });
    expect(((await res.json()) as { sha: string }).sha).toBe(oldSha);
  });

  it('scripted Actions runs: no run, queued, success (last repeats); 403/404', async () => {
    const { gh, client } = setup();
    gh.scriptRuns([null, { status: 'queued' }, { status: 'completed', conclusion: 'success', run_started_at: '2026-01-01T10:00:00Z' }]);
    expect(await client.getWorkflowRunForCommit('abc')).toBeNull();
    expect(await client.getWorkflowRunForCommit('abc')).toMatchObject({ status: 'queued', conclusion: null, run_started_at: null });
    const done = await client.getWorkflowRunForCommit('abc');
    expect(done).toMatchObject({ status: 'completed', conclusion: 'success', run_started_at: '2026-01-01T10:00:00Z' });
    expect(done?.html_url).toMatch(/^https:\/\/github\.com\/estheralmendros\/portfolio\/actions\/runs\/\d+$/);
    expect(await client.getWorkflowRunForCommit('abc')).toMatchObject({ conclusion: 'success' });
    const req = gh.requests.at(-1)!;
    expect(req.path).toBe(`${R}/actions/workflows/deploy.yml/runs`);
    expect(req.query).toMatchObject({ head_sha: 'abc', per_page: '1' });

    for (const httpStatus of [403, 404]) {
      gh.scriptRuns([{ httpStatus }]);
      await expect(client.getWorkflowRunForCommit('abc')).rejects.toBeInstanceOf(PermissionError);
    }
  });
});
