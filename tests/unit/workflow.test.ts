// Structural checks on the deploy workflow: deploy only after every verify step passes.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const yml = readFileSync(path.resolve('.github/workflows/deploy.yml'), 'utf8');
const verify = yml.slice(yml.indexOf('  verify:'), yml.indexOf('  deploy:'));

describe('deploy.yml', () => {
  it('runs on push to main and manual dispatch with the pages concurrency group', () => {
    expect(yml).toMatch(/push:\s*\n\s*branches: \[main\]/);
    expect(yml).toContain('workflow_dispatch');
    expect(yml).toMatch(/group: pages\s*\n\s*cancel-in-progress: false/);
  });
  it('grants least privilege: top level contents: read only, pages/id-token write only on the deploy job', () => {
    const topLevel = yml.slice(0, yml.indexOf('jobs:'));
    expect(topLevel).toMatch(/^permissions:\s*\n\s+contents: read\s*\n(?!\s+\S+: )/m);
    expect(topLevel).not.toContain('pages: write');
    expect(topLevel).not.toContain('id-token: write');
    expect(verify).not.toMatch(/pages: write|id-token: write/);
    const deploy = yml.slice(yml.indexOf('  deploy:'));
    expect(deploy).toMatch(/permissions:\s*\n\s+pages: write\s*\n\s+id-token: write/);
  });
  it('verify runs every gate in order before uploading dist/', () => {
    const steps = [
      'npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build', 'npm run test:smoke',
      'playwright install', 'npm run build:test', 'SMOKE_DIR: dist-test', 'npm run test:e2e', 'upload-pages-artifact',
    ];
    const positions = steps.map((s) => verify.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(verify).toMatch(/path: dist\s*$/m);
    expect(verify).toContain('node-version: 22');
  });
  it('deploy needs verify and publishes with deploy-pages to github-pages', () => {
    const deploy = yml.slice(yml.indexOf('  deploy:'));
    expect(deploy).toContain('needs: verify');
    expect(deploy).toContain('name: github-pages');
    expect(deploy).toContain('actions/deploy-pages');
  });
});
