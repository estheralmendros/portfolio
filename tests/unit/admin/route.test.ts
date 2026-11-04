import { describe, expect, it } from 'vitest';
import { parseHash, routeHash, sectionOf, type Route } from '../../../src/admin/useHashRoute';

describe('parseHash', () => {
  it.each([
    ['', { name: 'list', section: 'projects' }],
    ['#/', { name: 'list', section: 'projects' }],
    ['#/login', { name: 'login' }],
    ['#/profile', { name: 'profile' }],
    ['#/projects', { name: 'list', section: 'projects' }],
    ['#/projects/new', { name: 'new', section: 'projects' }],
    ['#/projects/my-app', { name: 'edit', section: 'projects', id: 'my-app' }],
    ['#/projects/My%20App', { name: 'edit', section: 'projects', id: 'My App' }],
    ['#/skills', { name: 'list', section: 'skills' }],
    ['#/skills/new', { name: 'new', section: 'skills' }],
    ['#/skills/typescript', { name: 'edit', section: 'skills', id: 'typescript' }],
    ['#/certifications', { name: 'list', section: 'certifications' }],
    ['#/certifications/new', { name: 'new', section: 'certifications' }],
    ['#/certifications/aws-saa', { name: 'edit', section: 'certifications', id: 'aws-saa' }],
    ['#/experience', { name: 'list', section: 'experience' }],
    ['#/experience/new', { name: 'new', section: 'experience' }],
    ['#/experience/acme', { name: 'edit', section: 'experience', id: 'acme' }],
    // Unknown routes -> #/projects
    ['#/nope', { name: 'list', section: 'projects' }],
    ['#/profile/x', { name: 'list', section: 'projects' }],
    ['#/skills/a/b', { name: 'list', section: 'projects' }],
    ['#/skill', { name: 'list', section: 'projects' }],
    ['#/projects/%E0%A4%A', { name: 'list', section: 'projects' }],
  ] as const)('%j', (hash, route) => expect(parseHash(hash)).toEqual(route));

  it('builds hashes that parse back to the same route', () => {
    const routes: Route[] = [
      { name: 'login' },
      { name: 'profile' },
      { name: 'list', section: 'skills' },
      { name: 'new', section: 'certifications' },
      { name: 'edit', section: 'experience', id: 'a b' },
      { name: 'edit', section: 'projects', id: 'a-b' },
    ];
    for (const r of routes) expect(parseHash(routeHash(r))).toEqual(r);
    expect(routeHash({ name: 'edit', section: 'projects', id: 'a-b' })).toBe('#/projects/a-b');
    expect(routeHash({ name: 'new', section: 'projects' })).toBe('#/projects/new');
    expect(routeHash({ name: 'list', section: 'experience' })).toBe('#/experience');
    expect(routeHash({ name: 'profile' })).toBe('#/profile');
    expect(routeHash({ name: 'login' })).toBe('#/login');
  });

  it('sectionOf maps a route to its nav section', () => {
    expect(sectionOf({ name: 'profile' })).toBe('profile');
    expect(sectionOf({ name: 'edit', section: 'skills', id: 'x' })).toBe('skills');
    expect(sectionOf({ name: 'login' })).toBeUndefined();
  });
});
