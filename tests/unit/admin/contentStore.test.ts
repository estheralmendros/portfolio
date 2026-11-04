import { describe, expect, it, vi } from 'vitest';
import {
  COLLECTIONS, addEntry, commitMessage, insertSkill, loadCollection, moveEntry, removeEntry, saveCollection, saveCollectionWithFiles,
  serializeCollection, updateEntry,
} from '../../../src/admin/lib/contentStore';
import { NotFoundError, RemoteContentError, ValidationError } from '../../../src/admin/lib/errors';
import type { GitHubClient } from '../../../src/admin/lib/githubClient';
import type { Profile, Project, Skill } from '../../../src/content/schema';

const p = (id: string, title = id): Project => ({ id, title, summary: 'S', description: '', tags: [], featured: false, date: '2024-01' });

function fakeClient(content = '[]', sha = 'sha1'): GitHubClient & { putFile: ReturnType<typeof vi.fn> } {
  return {
    verifyToken: vi.fn(),
    getFile: vi.fn(async () => ({ content, sha })),
    putFile: vi.fn(async () => ({ sha: 'sha2', commitSha: 'c1' })),
  } as unknown as GitHubClient & { putFile: ReturnType<typeof vi.fn> };
}

describe('COLLECTIONS', () => {
  it('maps names to content paths', () => {
    expect(COLLECTIONS.projects.path).toBe('content/projects.json');
    expect(Object.keys(COLLECTIONS)).toEqual(['profile', 'projects', 'skills', 'certifications', 'experience']);
  });
});

describe('serializeCollection', () => {
  it('pretty-prints with 2 spaces and a trailing newline', () =>
    expect(serializeCollection([{ a: 1 }])).toBe('[\n  {\n    "a": 1\n  }\n]\n'));
});

describe('commitMessage', () => {
  it('formats conventional messages', () => {
    expect(commitMessage('projects', 'add', 'My Project')).toBe('content(projects): add "My Project"');
    expect(commitMessage('projects', 'update', 'X')).toBe('content(projects): update "X"');
    expect(commitMessage('projects', 'delete', 'X')).toBe('content(projects): delete "X"');
  });

  it.each([
    [['projects', 'add', 'My App'], 'content(projects): add "My App"'],
    [['projects', 'update', 'My App', ['image']], 'content(projects): update "My App" (+image)'],
    [['profile', 'update'], 'content(profile): update profile'],
    [['profile', 'update', undefined, ['cv', 'image']], 'content(profile): update profile (+image, +cv)'],
    [['profile', 'update', undefined, ['-cv']], 'content(profile): update profile (-cv)'],
    [['skills', 'reorder'], 'content(skills): reorder'],
    [['experience', 'delete', 'Engineer @ Acme'], 'content(experience): delete "Engineer @ Acme"'],
  ] as const)('PRD example %j', (args, expected) =>
    expect(commitMessage(...(args as unknown as Parameters<typeof commitMessage>))).toBe(expected));

  it('de-duplicates attachments and orders them image, cv, -cv', () => {
    expect(commitMessage('profile', 'update', undefined, ['-cv', 'image', 'image'])).toBe('content(profile): update profile (+image, -cv)');
    expect(commitMessage('certifications', 'add', 'AWS', [])).toBe('content(certifications): add "AWS"');
  });

  it('uses other labels verbatim (quotes, unicode)', () =>
    expect(commitMessage('projects', 'update', 'Gestión "v2"')).toBe('content(projects): update "Gestión "v2""'));

  it.each(['[skip ci]', '[ci skip]', '[no ci]', '[skip actions]', '[actions skip]', '[SKIP CI]', '[Skip Actions]'])(
    'neutralizes the CI-skip marker %s in labels (R1)',
    (marker) => {
      const msg = commitMessage('projects', 'add', `App ${marker} x`);
      expect(msg).toBe(`content(projects): add "App ${marker.replace('[', '(').replace(']', ')')} x"`);
      expect(msg).not.toMatch(/\[(skip ci|ci skip|no ci|skip actions|actions skip)\]/i);
    },
  );

  it('keeps unrelated brackets', () =>
    expect(commitMessage('projects', 'add', '[WIP] App [skip]')).toBe('content(projects): add "[WIP] App [skip]"'));
});

describe('list operations are pure', () => {
  it('addEntry prepends without mutating', () => {
    const list = [p('a')];
    const out = addEntry(list, p('b'));
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
    expect(list.map((x) => x.id)).toEqual(['a']);
  });
  it('addEntry throws ValidationError on duplicate id', () => expect(() => addEntry([p('a')], p('a'))).toThrow(ValidationError));
  it('updateEntry keeps position', () => {
    const list = [p('a'), p('b'), p('c')];
    const out = updateEntry(list, 'b', p('b', 'B2'));
    expect(out[1]?.title).toBe('B2');
    expect(list[1]?.title).toBe('b');
  });
  it('updateEntry rejects id changes and unknown ids', () => {
    expect(() => updateEntry([p('a')], 'a', p('z'))).toThrow(ValidationError);
    expect(() => updateEntry([p('a')], 'x', p('x'))).toThrow(NotFoundError);
  });
  it('removeEntry removes without mutating; NotFoundError if absent', () => {
    const list = [p('a'), p('b')];
    expect(removeEntry(list, 'a').map((x) => x.id)).toEqual(['b']);
    expect(list).toHaveLength(2);
    expect(() => removeEntry(list, 'x')).toThrow(NotFoundError);
  });
});

describe('loadCollection', () => {
  it('parses remote JSON with the schema', async () => {
    const loaded = await loadCollection(fakeClient(JSON.stringify([p('a')]), 'abc'), 'projects');
    expect(loaded).toEqual({ data: [p('a')], sha: 'abc' });
  });
  it('throws RemoteContentError on invalid JSON', async () => {
    await expect(loadCollection(fakeClient('{nope'), 'projects')).rejects.toBeInstanceOf(RemoteContentError);
  });
  it('throws RemoteContentError listing issues on schema failure', async () => {
    const err = await loadCollection(fakeClient(JSON.stringify([{ ...p('a'), date: 'x' }])), 'projects').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RemoteContentError);
    expect((err as RemoteContentError).issues[0]).toBe('[0].date: Expected YYYY-MM');
  });
});

describe('COLLECTIONS', () => {
  it('holds only the path and schema of each file (section labels live in src/admin/sections.ts)', () => {
    for (const c of Object.values(COLLECTIONS)) expect(Object.keys(c).sort()).toEqual(['path', 'schema']);
  });
});

describe('saveCollection', () => {
  it('returns the Zod-parsed data it committed', async () => {
    const client = fakeClient();
    const res = await saveCollection(client, 'projects', [{ ...p('a'), title: '  A  ' }], 'sha1', 'm');
    expect(res.data[0]!.title).toBe('A');
  });
  it('rejects invalid data without calling the client', async () => {
    const client = fakeClient();
    await expect(saveCollection(client, 'projects', [{ ...p('a'), date: 'bad' }], 'sha1', 'm')).rejects.toBeInstanceOf(ValidationError);
    expect(client.putFile).not.toHaveBeenCalled();
  });
  it('puts the serialized parsed data with the sha and message', async () => {
    const client = fakeClient();
    const res = await saveCollection(client, 'projects', [p('a')], 'sha1', 'content(projects): add "a"');
    expect(res).toEqual({ sha: 'sha2', commitSha: 'c1', data: [p('a')] });
    expect(client.putFile).toHaveBeenCalledWith({
      path: 'content/projects.json',
      content: serializeCollection([p('a')]),
      sha: 'sha1',
      message: 'content(projects): add "a"',
    });
  });
});

const sk = (id: string, category: Skill['category']): Skill => ({ id, name: id.toUpperCase(), category });

describe('moveEntry', () => {
  const list = [p('a'), p('b'), p('c')];
  it('swaps with the neighbour without mutating', () => {
    expect(moveEntry(list, 'b', 'up').map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(moveEntry(list, 'b', 'down').map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('returns an equal copy at the boundaries and for unknown ids', () => {
    for (const [id, dir] of [['a', 'up'], ['c', 'down'], ['zz', 'up']] as const) {
      const out = moveEntry(list, id, dir);
      expect(out).toEqual(list);
      expect(out).not.toBe(list);
    }
  });
  it('with sameGroup swaps with the nearest neighbour of the same group', () => {
    const skills = [sk('ts', 'languages'), sk('react', 'data'), sk('go', 'languages'), sk('vue', 'data')];
    const same = (x: Skill, y: Skill) => x.category === y.category;
    expect(moveEntry(skills, 'go', 'up', same).map((x) => x.id)).toEqual(['go', 'react', 'ts', 'vue']);
    expect(moveEntry(skills, 'react', 'down', same).map((x) => x.id)).toEqual(['ts', 'vue', 'go', 'react']);
  });
  it('with sameGroup is a no-op at the group boundary', () => {
    const skills = [sk('ts', 'languages'), sk('react', 'data'), sk('go', 'languages')];
    const same = (x: Skill, y: Skill) => x.category === y.category;
    expect(moveEntry(skills, 'ts', 'up', same)).toEqual(skills);
    expect(moveEntry(skills, 'go', 'down', same)).toEqual(skills);
    expect(moveEntry(skills, 'react', 'up', same)).toEqual(skills);
    expect(moveEntry(skills, 'react', 'down', same)).toEqual(skills);
  });
});

describe('insertSkill', () => {
  const skills = [sk('ts', 'languages'), sk('react', 'data'), sk('go', 'languages')];
  it('inserts before the first skill of the same category without mutating', () => {
    expect(insertSkill(skills, sk('vue', 'data')).map((x) => x.id)).toEqual(['ts', 'vue', 'react', 'go']);
    expect(insertSkill(skills, sk('rust', 'languages')).map((x) => x.id)).toEqual(['rust', 'ts', 'react', 'go']);
    expect(skills).toHaveLength(3);
  });
  it('appends when the category is new', () =>
    expect(insertSkill(skills, sk('aws', 'devops')).map((x) => x.id)).toEqual(['ts', 'react', 'go', 'aws']));
  it('throws ValidationError on a duplicate id', () => expect(() => insertSkill(skills, sk('go', 'tools'))).toThrow(ValidationError));
});

const profile: Profile = {
  name: 'Esther', title: 'Engineer', bio: 'Bio', location: 'Madrid', availability: 'open',
  socials: { email: 'e@example.com', linkedin: 'https://linkedin.com/in/e', github: 'https://github.com/e' },
} as Profile;

function v2Client() {
  return {
    verifyToken: vi.fn(),
    getFile: vi.fn(),
    putFile: vi.fn(async () => ({ sha: 'put-sha', commitSha: 'put-commit' })),
    commitFiles: vi.fn(async (args: { files: { path: string }[] }) => ({
      commitSha: 'git-commit',
      blobShas: Object.fromEntries(args.files.map((f) => [f.path, `blob:${f.path}`])),
    })),
    getWorkflowRunForCommit: vi.fn(),
  } as unknown as GitHubClient & { putFile: ReturnType<typeof vi.fn>; commitFiles: ReturnType<typeof vi.fn> };
}

describe('saveCollectionWithFiles', () => {
  const image = { path: 'src/assets/uploads/projects/a-a1b2c3.webp', content: 'AAAA', encoding: 'base64' as const };
  const withImage = [p('a')].map((x) => ({ ...x, image: image.path, imageAlt: 'Alt' }));

  it('without extra files uses the Contents API (saveCollection)', async () => {
    const client = v2Client();
    const res = await saveCollectionWithFiles(client, 'projects', [p('a')], 'sha1', 'm', []);
    expect(res).toEqual({ sha: 'put-sha', commitSha: 'put-commit', data: [p('a')] });
    expect(client.putFile).toHaveBeenCalledOnce();
    expect(client.commitFiles).not.toHaveBeenCalled();
  });

  it('with files makes one commitFiles call: JSON first, expected SHA of the collection', async () => {
    const client = v2Client();
    const res = await saveCollectionWithFiles(client, 'projects', withImage, 'sha1', 'content(projects): update "a" (+image)', [image]);
    expect(res).toEqual({ sha: 'blob:content/projects.json', commitSha: 'git-commit', data: COLLECTIONS.projects.schema.parse(withImage) });
    expect(client.putFile).not.toHaveBeenCalled();
    expect(client.commitFiles).toHaveBeenCalledWith({
      files: [{ path: 'content/projects.json', content: serializeCollection(COLLECTIONS.projects.schema.parse(withImage)), encoding: 'utf-8' }, image],
      message: 'content(projects): update "a" (+image)',
      expectedShas: { 'content/projects.json': 'sha1' },
    });
  });

  it('routes a delete-only change (Remove CV) through commitFiles', async () => {
    const client = v2Client();
    await saveCollectionWithFiles(client, 'profile', profile, 'psha', 'content(profile): update profile (-cv)', [
      { path: 'public/uploads/cv.pdf', delete: true },
    ]);
    expect(client.commitFiles).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.objectContaining({ path: 'content/profile.json' }), { path: 'public/uploads/cv.pdf', delete: true }],
      expectedShas: { 'content/profile.json': 'psha' },
    }));
  });

  it.each([
    ['an image', [image]],
    ['a delete entry', [{ path: 'public/uploads/cv.pdf', delete: true as const }]],
    ['no files', []],
  ])('validates before any request (with %s)', async (_label, files) => {
    const client = v2Client();
    await expect(saveCollectionWithFiles(client, 'projects', [{ ...p('a'), date: 'bad' }], 'sha1', 'm', files)).rejects.toBeInstanceOf(ValidationError);
    expect(client.commitFiles).not.toHaveBeenCalled();
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it('serializes the parsed data (trimmed strings)', async () => {
    const client = v2Client();
    const res = await saveCollectionWithFiles(client, 'projects', [{ ...p('a'), title: '  A  ' }], 'sha1', 'm', [image]);
    expect(res.data[0]!.title).toBe('A');
    const files = (client.commitFiles.mock.calls[0]![0] as { files: { content: string }[] }).files;
    expect(JSON.parse(files[0]!.content)[0].title).toBe('A');
  });
});
