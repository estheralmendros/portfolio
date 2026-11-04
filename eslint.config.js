// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

const contentImportPatterns = [
  // `!` re-allows the fixtures folder (gitignore-style negation; order matters: the negation comes last).
  {
    group: ['@content', '@content/*', '**/content/*.json', '!**/fixtures/content/*.json'],
    message: 'Tests must not depend on real /content; use tests/fixtures/content.',
  },
  {
    group: ['**/src/content/load', '**/src/content/load.*'],
    message: 'Import schema types from src/content/schema.ts; build test props from fixtures.',
  },
];

export default tseslint.config(
  { ignores: ['dist/**', 'dist-test/**', '.astro/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', 'specs/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  ...astro.configs['jsx-a11y-recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
  {
    files: ['*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  // Admin bundle (R15, also checked by smoke over the built JS): never pull in simple-icons or the
  // glob-backed upload resolver. Type-only imports are fine (e.g. `import type` from lib/imageResolver).
  {
    files: ['src/admin/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'simple-icons', message: 'simple-icons is build-only; the admin uses the initials fallback.', allowTypeImports: true },
            { name: '@mdi/js', message: '@mdi/js is build-only; the admin uses the initials fallback.', allowTypeImports: true },
          ],
          patterns: [
            {
              group: ['simple-icons/*', '**/lib/images', '**/lib/images.*', '**/lib/icons', '**/lib/icons.*'],
              message: 'Build-only module (upload glob / simple-icons): never import it from src/admin; use `import type` from lib/imageResolver.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  // Test-content isolation: component and e2e tests never read the owner's real /content.
  {
    files: ['tests/component/**', 'tests/e2e/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: contentImportPatterns }] },
  },
  // Unit tests: only seed.test.ts may load real content (review suggestion 21).
  {
    files: ['tests/unit/**'],
    ignores: ['tests/unit/seed.test.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: contentImportPatterns }] },
  },
);
