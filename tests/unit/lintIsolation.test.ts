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

describe('admin bundle import ban (R15)', { timeout: 30_000 }, () => {
  const probe = 'src/admin/components/__probe__.tsx';
  const banned = async (code: string) => {
    const [result] = await eslint.lintText(code, { filePath: probe });
    return result!.messages.filter((m) => m.ruleId === '@typescript-eslint/no-restricted-imports').length;
  };
  it.each([
    "import { siReact } from 'simple-icons';\nexport default siReact;\n",
    "import { resolveImage } from '../../lib/images';\nexport default resolveImage;\n",
    "import { resolveImage } from '../../lib/images.ts';\nexport default resolveImage;\n",
    "import * as icons from '../../lib/icons';\nexport default icons;\n",
  ])('blocks %j', async (code) => expect(await banned(code)).toBe(1));
  it('allows type-only imports and imageResolver types', async () => {
    expect(await banned("import type { ResolvedImage } from '../../lib/imageResolver';\nexport type X = ResolvedImage;\n")).toBe(0);
    expect(await banned("import type { ResolvedImage } from '../../lib/images';\nexport type X = ResolvedImage;\n")).toBe(0);
  });
  it('does not apply outside src/admin', async () => {
    const [result] = await eslint.lintText("import { siReact } from 'simple-icons';\nexport default siReact;\n", { filePath: 'src/lib/__probe__.ts' });
    expect(result!.messages.filter((m) => m.ruleId?.endsWith('no-restricted-imports'))).toEqual([]);
  });
});

describe('jsx-a11y covers .astro files', { timeout: 30_000 }, () => {
  it('flags an <img> without alt in an .astro component', async () => {
    const [result] = await eslint.lintText('---\n---\n<img src="/x.png">\n', { filePath: 'src/components/__probe__.astro' });
    expect(result!.messages.some((m) => m.ruleId === 'astro/jsx-a11y/alt-text')).toBe(true);
  });
});
