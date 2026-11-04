import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function restrictedErrors(code: string, filePath: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('test-content isolation lint rule', { timeout: 30_000 }, () => {
  const component = 'tests/component/__probe__.test.tsx';
  it('blocks @content imports in component tests', async () => {
    expect(await restrictedErrors("import p from '@content/profile.json';\nexport default p;\n", component)).toBe(1);
  });
  it('blocks relative imports of real /content', async () => {
    expect(await restrictedErrors("import p from '../../content/profile.json';\nexport default p;\n", component)).toBe(1);
  });
  it('allows fixture content', async () => {
    expect(await restrictedErrors("import p from '../fixtures/content/profile.json';\nexport default p;\n", component)).toBe(0);
  });
  it('blocks src/content/load in component and e2e tests', async () => {
    expect(await restrictedErrors("import { content } from '../../src/content/load';\nexport default content;\n", component)).toBe(1);
    expect(await restrictedErrors("import { content } from '../../src/content/load';\nexport default content;\n", 'tests/e2e/__probe__.spec.ts')).toBe(1);
  });
  it('blocks @content in unit tests other than seed.test.ts', async () => {
    expect(await restrictedErrors("import p from '@content/profile.json';\nexport default p;\n", 'tests/unit/__probe__.test.ts')).toBe(1);
    expect(await restrictedErrors("import p from '@content/profile.json';\nexport default p;\n", 'tests/unit/seed.test.ts')).toBe(0);
  });
});
