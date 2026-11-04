import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const readme = readFileSync(path.resolve('README.md'), 'utf8');
const section = (title: string) => {
  const start = readme.indexOf(`\n## ${title}\n`);
  const next = readme.indexOf('\n## ', start + 1);
  return start === -1 ? '' : readme.slice(start, next === -1 ? undefined : next);
};

it('README › Setup lists the one-time prerequisites', () => {
  const setup = section('Setup');
  expect(setup).toMatch(/public/i);
  expect(setup).toContain('Source = GitHub Actions');
  expect(setup).toContain('github-pages');
  expect(setup).toContain('Contents → Read and write');
});

it('README › Security states the shared-origin owner rule', () => {
  const security = section('Security');
  expect(security).toContain('estheralmendros.github.io');
  expect(security).toContain('sessionStorage');
  expect(security).toMatch(/may load third-party or analytics scripts/);
});

it('README › Deployment warns that GitHub disables the weekly schedule after 60 days of inactivity', () => {
  const usage = section('Usage');
  expect(usage).toMatch(/60 days/);
  expect(usage).toMatch(/schedule/i);
  expect(usage).toMatch(/Expired/);
});
