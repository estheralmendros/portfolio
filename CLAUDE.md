# CLAUDE.md

Personal portfolio for Esther Almendros: static Astro site (GitHub Pages, base path `/portfolio`) rendered from `content/*.json`, plus a client-side React admin at `/portfolio/admin/` that edits every `content/*.json` file (with image/CV uploads, reorder, live preview and a deploy badge) and commits to `main` through the GitHub API with a fine-grained token. Specs live in `specs/PF-1/portfolio-esther/` (`prd.md` = MVP, `prd2.md` = v2; both implemented).

## Commands

```bash
npm ci                              # install
npx playwright install chromium     # once, for e2e
npm run dev                         # dev server, http://localhost:4321/portfolio/ (no CSP in dev)
npm run lint                        # eslint . (flat config, eslint.config.js)
npm run typecheck                   # astro check && tsc --noEmit
npm test                            # Vitest: tests/unit/**/*.test.ts (node) + tests/component/**/*.test.tsx (jsdom)
npm run build                       # real content/ -> dist/
npm run test:smoke                  # structural checks over dist/ (needs a build)
npm run build:test                  # tests/fixtures/content -> dist-test/
SMOKE_DIR=dist-test npm run test:smoke
npm run test:e2e                    # Playwright vs dist-test/ (run build:test first); serves on port 4321
make test | lint | typecheck | build | smoke | smoke-test | e2e | all
```

Single test: `npx vitest run tests/unit/markdown.test.ts`, `npx playwright test -g "conflict"`.

Port 4321 must be free for e2e (`reuseExistingServer: false`); stop `create-environment.sh` / `astro preview` first. Astro 7 auto-backgrounds `astro preview` when it detects an AI agent; always pass `--ignore-lock` to keep it in the foreground (`npx astro preview stop` kills a stray background one).

## Architecture

```
content/*.json ──@content alias──► src/content/load.ts ──parseContent──► pages (build time) ──await resolveImage──► <img>
                                         │
src/content/schema.ts (Zod v4) ◄─────────┴── shared ──► src/admin/lib/contentStore.ts (browser)
src/admin: LoginScreen → verifyToken (GET /user, GET /repos, POST git/blobs probe)
           AdminNav tabs → <Section>List / <Section>Form / ProfileForm → loadCollection (GET contents, per-file SHA)
           save without files → saveCollection (validate, PUT contents w/ sha)
           save with files    → saveCollectionWithFiles → commitFiles (Git Data API: one commit) → pollDeployStatus → badge
```

- `src/content/schema.ts`: Zod schemas (strict objects; key order = serialization order) + types. `ImageRefSchema` = `https://…` | `/path` | upload path; `CvUrlSchema` is separate (no image uploads). `parse.ts` is pure (imports only `./schema`, which imports only `zod` and `src/lib/uploads.ts`), `load.ts` imports the five JSON files via `@content` and parses at module load (build fails on invalid content).
- `src/lib/`: pure helpers — `paths.ts` (`withBase`, idempotent), `uploads.ts` (upload path regex/builder, `randomShortId`; must stay import-free), `imageResolver.ts` (pure `createImageResolver` over an injected `RasterMap`; uses `astro:assets` `getImage`, aliased to `tests/mocks/astroAssets.ts` in Vitest), `images.ts` (only the glob-backed `resolveImage`; never import it from the admin or unit tests), `ogImage.ts`, `projectFilter.ts` (`cardMatches`, used by the filter script), `projects.ts` (`hasDetailPage`), `skills.ts` (`SKILL_GROUPS`, category labels; shared by `SkillsSection` and the admin), `markdown.ts` (`renderMarkdown`, `sanitizeUrl`), `dates.ts`, `slugify.ts`, `icons.ts` (simple-icons, build only), `initials.ts`, `sections.ts`.
- `src/components/*.tsx`: pure, prop-driven presentational React, SSR-only on the public site (no hydration, no hooks/state), reused by the admin preview. `ProjectsSection` renders `ProjectFilter` (hidden chip group); `src/scripts/projectFilter.ts` (bundled module included by `index.astro`) wires it (progressive enhancement, `data-tags` JSON arrays). `*.astro` components: header (with `<details>` mobile menu), theme toggle, footer, SEO (`ogImage` + required `imageAlt` props for `og:image:alt`/`twitter:image:alt`, `noindex` option used by `404.astro`; `[slug].astro` passes the absolute 1200 px WebP for uploads). All styles live in `src/styles/global.css` (no scoped `<style>` blocks); interactive-control borders use `--color-line-strong` (≥ 3:1), `--color-line` is for decorative dividers only.
- `src/layouts/BaseLayout.astro` (public CSP) and `AdminLayout.astro` (admin CSP; `img-src` adds `blob:` for upload previews). `src/pages/`: `index`, `projects/[slug]` (only for non-empty descriptions), `404`, `robots.txt.ts`, `admin/index`.
- `src/admin/`: single React root (`main.tsx`, bundled module script), hash routes (`useHashRoute.ts`: `#/profile`, `#/<section>[/new|/<id>]`, unknown → `#/projects`, dirty-form `confirm` guard + `beforeunload`), `AdminApp.tsx` owns auth/session, per-tab load state + SHA, commits, `lastCommitSha` (`adminContext.ts`) and deploy polling (aborted on new commit/logout/unmount); `sections.ts` = per-section copy/labels; `previewValues.ts` = best-effort preview placeholders; `messages.ts` holds all user-facing copy.
- `src/admin/components/`: `AdminHeader` (+ `AdminNav`, `DeployStatusBadge`), `CollectionList` → `ReorderableList` (staged ↑/↓, live region, sticky "Order changed" bar), one `<Section>List`/`<Section>Form` per collection + `ProfileForm`, `formKit.tsx` (Field with `aria-required`, `useEntryForm` form skeleton + save runner, `useAutoId`/`IdField`, `duplicateIdError`, `useImageUpload`, banners, `FormLayout` with preview aside / Edit-Preview tabs below 1024 px via `matchMedia`; each form has one `check()` used by both Save and the preview), `ImageField`, `CvField`, `PreviewPane` (debounced 150 ms, `role="region"`, `aria-busy` while debouncing, error boundary, `inert`), `ConfirmDialog`, `StatusBanner`, `LoginScreen`.
- `src/admin/lib/`: `githubClient` (Octokit, `cache: 'no-store'`, Bearer auth, error mapping; `commitFiles` = Git Data path: GET ref → per-file SHA check at head (`Accept: application/vnd.github.object`) → blobs → tree (`sha: null` deletes, missing targets dropped) → commit → PATCH ref; non-fast-forward restarts ≤ 2×, lost PATCH response re-reads the ref; `getWorkflowRunForCommit` uses `SITE.deployWorkflow`), `contentStore` (`saveCollection`, `saveCollectionWithFiles`, `commitMessage` with `(+image)`/`(+cv)`/`(-cv)` and CI-skip neutralization, `moveEntry`, `insertSkill`), `imageProcessing` (type/size rules, resize via injectable `ImageCodec`, SVG → PNG, `finalizeUpload`, `checkTypedImageRef`), `cvUpload`, `deployStatus` (`mapRunToState`, two-phase timeout polling), `previewImage`, `errors` (+ `ImageError`, `CvError`, `GitHubApiError`), `session` (sessionStorage `portfolio.admin.token`), `base64`, `formUtils`.
- `src/config/site.ts`: `SITE` (owner, repo, branch, origin, base, `deployWorkflow`) and `isSitemapPage` — the base path is defined only here.

## Conventions and rules

- **Base path**: never hardcode `/portfolio`. Internal links/assets go through `withBase()`; `astro.config.ts` takes `base` from `SITE`. Content paths are written without the base.
- **CSP / no inline scripts**: no inline `<script>` and no `style=` attributes anywhere in built HTML. Theme bootstrap is the external `public/theme-init.js` included with `<script is:inline src={withBase('/theme-init.js')}>` right after the CSP/charset/viewport metas (parser-blocking: no `type="module"`, `async`, `defer`). Other scripts are `<script>import …</script>` (bundled external modules). `inlineStylesheets: 'never'` and `assetsInlineLimit: 0` must stay. No Astro `client:*` islands (they inject inline scripts). No third-party scripts, fonts or stylesheets. CSP metas are emitted only when `import.meta.env.PROD`.
- **Content model**: optional = omitted (no `""`/`null` except `experience.end`); ids are kebab-case slugs, unique, immutable; dates `YYYY-MM`; URLs `https://`; image refs `https://…` or `/path` in `public/`.
- **Markdown**: only via `renderMarkdown` (raw HTML escaped, URLs through `sanitizeUrl`).
- **Uploads**: images go to `src/assets/uploads/{projects,profile,certifications}/<final id>-<6 hex>.{jpg,png,webp}` (JSON value without a leading slash; the path is built at Save, never typed — `checkTypedImageRef`); a missing upload fails the build (`Missing image: <path>`). Test-only upload files live in `tests/fixtures/uploads/` (alias `@extra-uploads`, active only when `CONTENT_DIR` is set, re-keyed under `src/assets/uploads/`) so they never ship in the real `dist/`. Never commit SVGs (badges are rasterized to PNG in the browser). The CV is `public/uploads/cv.pdf` with `cvUrl` `/uploads/cv.pdf?v=<6 hex>`. A save with files is one Git Data commit; without files it stays on the Contents API.
- **Deploy status**: the admin badge polls the Actions runs of `SITE.deployWorkflow` (`deploy.yml`); rename both together. The token's Actions: Read permission is optional (403/404 → "Status unknown").
- **Admin bundle**: never import `simple-icons`, `src/lib/images.ts`, `src/lib/icons.ts` or the upload glob into `src/admin` (ESLint `no-restricted-imports` on `src/admin/**` + smoke R15 check); use `import type` from `imageResolver`.
- **Admin async safety**: `AdminApp` captures the session before every await (`commit`, `reportError`, `onAuthError`) and drops results from an ended session or after unmount; never start a deploy poll or set state without that check.
- **CI permissions**: `deploy.yml` grants only `contents: read` at the top level; `pages: write` / `id-token: write` belong to the `deploy` job alone.
- **localStorage keys are namespaced** (`portfolio.theme`) — the origin is shared with other Pages sites. The admin token lives only in `sessionStorage`.
- **TDD**: write the failing test first. Vitest files are `*.test.ts(x)`, Playwright files `*.spec.ts`.

## Test isolation (enforced by ESLint `no-restricted-imports`, verified by `tests/unit/lintIsolation.test.ts`)

- `tests/component/**` and `tests/e2e/**` must never import `@content`, `content/*.json` (except `tests/fixtures/content/*.json`) or `src/content/load`; they assert only fixture values from `tests/fixtures/content/`.
- `tests/unit/**` may not either, except `tests/unit/seed.test.ts`, which only asserts that the real content parses (never values).
- `tests/smoke/dist.test.ts` is content-agnostic (structural checks only); it runs over `dist/` (real content) and `dist-test/`.
- No real GitHub calls in any test: unit tests inject a stub `fetch` (or `FakeGitHub.fetch`); component tests pass a fake `GitHubClient` (`tests/component/admin/fakeClient.ts`); e2e uses `tests/e2e/fixtures/fakeGitHub.ts` via `page.route` for `api.github.com` and `raw.githubusercontent.com`.
- `FakeGitHub`: real git blob SHAs, every change is a commit on `main` (`?ref=<sha>` snapshots), Contents + Git Data endpoints (`treeLog`, `commitLog`, `refUpdates()`, `writes()`), `fail`, `before`, `moveHeadBefore`, `pushCommit`, `losePatchResponse`, `offline`, `scriptRuns([...])` for the Actions runs endpoint, and 403 `too_large` for files > 1 MB unless `Accept: application/vnd.github.object`. It only seeds `content/projects.json`: admin specs use `seededGitHub()` from `tests/e2e/fixtures/admin.ts` (all fixture files), which also has `login`, `loggedIn`, `openTab`, `previewPane`, `chooseFile` (hidden `input[name="<field>-file"]`) and `trackExternalRequests`.
- Component tests stub browser globals only through `stubObjectUrls()` / `stubMatchMedia()` from `tests/component/fixtures.ts` (restored by `vi.unstubAllGlobals()` in `setup.ts`); `previewPane()` helpers live in `tests/component/fixtures.ts` and `tests/e2e/fixtures/admin.ts`.
- Image fixtures are in `tests/fixtures/images/` (`generate.ts` regenerates the binary ones); large inputs are built in memory in the test.

## Git

Local-only repository: never push or open PRs (a pre-push hook blocks pushes).
