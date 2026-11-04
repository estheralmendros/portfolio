// Image URLs for the admin preview (prd2 Feature 5). Type-only import from imageResolver: its module pulls in
// astro:assets, which must never reach the admin bundle.
import { SITE } from '../../config/site';
import type { ResolvedImage } from '../../lib/imageResolver';
import { withBase } from '../../lib/paths';
import { isUploadPath } from '../../lib/uploads';

/**
 * objectUrl (a new upload) wins; upload path → raw.githubusercontent.com at `commitRef` (AdminApp's lastCommitSha,
 * since the deployed site doesn't have the file yet) or the branch; '/x' → withBase; https as-is; anything else → none.
 */
export function resolvePreviewImage(ref: string | undefined, opts: { objectUrl?: string; commitRef?: string } = {}): ResolvedImage | undefined {
  if (opts.objectUrl) return { src: opts.objectUrl };
  const value = ref?.trim();
  if (!value) return undefined;
  if (isUploadPath(value)) return { src: `https://raw.githubusercontent.com/${SITE.owner}/${SITE.repo}/${opts.commitRef ?? SITE.branch}/${value}` };
  if (/^https:\/\//i.test(value)) return { src: value };
  if (/^\/(?!\/)/.test(value)) return { src: withBase(value) };
  return undefined;
}
