import { SITE } from '../config/site';
import {
  AuthError, ConflictError, GitHubApiError, PermissionError, RateLimitError, ValidationError, githubRejectedMessage, rateLimitMessage,
} from './lib/errors';
import type { VerifyResult } from './lib/githubClient';

const REPO = `${SITE.owner}/${SITE.repo}`;

export const SESSION_EXPIRED = 'Your session expired or the token was revoked. Log in again.';
export const REVERIFY_NETWORK = "Couldn't reach GitHub. Check your connection.";
export const SAVED = 'Saved. The site will update after the next deploy (a few minutes).';
export const CONFLICT = 'Content changed elsewhere — reload to get the latest version. Your unsaved changes will be lost.';
export const NO_LONGER_WRITE = 'This token can no longer write to the repository.';
export const SAVE_FAILED = "Couldn't save. Check your connection and try again.";
export { githubRejectedMessage };
export const DISCARD_CONFIRM = 'Discard unsaved changes?';
export const SAVE = 'Save';
export const CANCEL = 'Cancel';
export const RELOAD = 'Reload';
export const DELETING = 'Deleting…';
export const FORM_VIEW = 'Form view';

// Reorder (prd2 Feature 2)
export const ORDER_CHANGED = 'Order changed —';
export const SAVE_ORDER = 'Save order';
export const DISCARD = 'Discard';
export const SAVING = 'Saving…';
export const moveLabel = (label: string, dir: 'up' | 'down') => `Move '${label}' ${dir}`;
export const movedAnnouncement = (label: string, position: number, total: number) =>
  `Moved '${label}' to position ${position} of ${total}`;

// Deploy status badge (prd2 Feature 7)
export const ACTIONS_PERMISSION = 'Actions → Read-only (optional, for deploy status)';
export const DEPLOY = {
  deploying: 'Deploying…',
  live: 'Live',
  viewSite: 'View site',
  failed: 'Failed',
  viewRun: 'View run',
  superseded: 'Replaced by a newer deploy',
  unknown: 'Status unknown',
  openActions: 'Open Actions',
  forbiddenHint: 'Add Actions: Read to your token',
} as const;

// Section forms (prd2 Feature 1)
export { SKILL_CATEGORY_LABELS } from '../lib/skills';
export const AVAILABILITY_LABELS = { open: 'Open to opportunities', 'not-looking': 'Not looking', freelance: 'Available for freelance' } as const;
export const ID_LOCKED_HINT = 'The id cannot change.';
export const ICON_HINT = 'e.g. typescript (simpleicons.org) or mdi:database (pictogrammers.com)';
export const WHOLE_NUMBER = 'Enter a whole number';
export const MAX_HIGHLIGHTS = 'Use at most 8 highlights';
export const idTaken = (label: string, noun = 'id') => `This ${noun} is already used by '${label}'`;
export const SLUG_LOCKED_HINT = 'The slug is the page URL and cannot change.';
/** `url` is the base-aware project path, e.g. withBase('/projects/<slug>/'). */
export const slugHint = (url: string) => `Used in the URL: ${url}`;
export const skillNameTaken = (name: string) => `A skill named '${name}' already exists`;

// Navigation (prd2 Feature 1)
export const NAV_LABELS = {
  profile: 'Profile',
  projects: 'Projects',
  skills: 'Skills',
  certifications: 'Certifications',
  experience: 'Experience',
} as const;

// Image upload (prd2 Feature 3)
export const IMAGE_TYPE = 'Use a JPG, PNG or WebP image';
export const IMAGE_TYPE_BADGE = 'Use a JPG, PNG, WebP or SVG image';
export const IMAGE_INPUT_TOO_LARGE = 'Image is too large to process';
export const IMAGE_OUTPUT_TOO_LARGE = 'Image is still larger than 2 MB after resizing. Use a smaller image.';
export const SVG_UNREADABLE = "Couldn't read this SVG. Use a PNG instead.";
export const IMAGE_UNREADABLE = "Couldn't read this image. Use a different file.";
export const UPLOAD_PATH_TYPED = "Upload paths can't be typed; use Upload image";

// CV upload (prd2 Feature 4)
export const CV_INVALID = 'CV must be a PDF of 5 MB or less';
export const UPLOAD_CV = 'Upload CV (PDF)';
export const REMOVE_CV = 'Remove CV';
export const UNDO = 'Undo';
export const CV_WILL_BE_REMOVED = 'CV will be removed when you save';
export const CV_HISTORY_HINT = "Old CV versions stay in the public repository's git history; removing them needs a history rewrite.";
export const CV_HINT = 'https:// URL or /path to a PDF';
export const cvSelected = (name: string, bytes: number) => `${name} (${formatBytes(bytes)}) — new, saved with this profile`;
export const CV_NOT_UPLOADED = '(Your selected CV was not uploaded.)';

// Upload field UI (prd2 Feature 3)
export const UPLOAD_IMAGE = 'Upload image';
export const REPLACE_IMAGE = 'Replace';
export const REMOVE_IMAGE = 'Remove';
export const USE_URL_OR_PATH = 'or use a URL / path';
export const IMAGE_REF_HINT = 'https:// URL or /path inside public/';
export const PROCESSING_IMAGE = 'Processing image…';
export const NEW_IMAGE_SELECTED = 'New image selected — saved with this entry';
export const resizedNote = (width: number, height: number, bytes: number) =>
  `Resized to ${width}×${height} (${formatBytes(bytes)}) — appears on the site after deploy`;
export const IMAGE_NOT_UPLOADED = '(Your selected image was not uploaded.)';

/** 412 KB / 1.2 MB */
export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Save success copy with attachments (prd2 Features 3.7 and 4.5)
export const SAVED_WITH_IMAGE = 'Saved. The new image appears on the site after the next deploy (a few minutes).';
export const SAVED_WITH_CV = 'Saved. The new CV is available on the site after the next deploy (a few minutes).';
export const SAVED_WITH_IMAGE_AND_CV = 'Saved. The new image and CV appear on the site after the next deploy (a few minutes).';
export const CV_REMOVED = 'CV removed. The download link disappears after the next deploy.';
export function savedMessage(attachments: readonly ('image' | 'cv' | '-cv')[] = []): string {
  const image = attachments.includes('image');
  if (attachments.includes('-cv')) return image ? `${CV_REMOVED} The new image appears after the same deploy.` : CV_REMOVED;
  if (attachments.includes('cv')) return image ? SAVED_WITH_IMAGE_AND_CV : SAVED_WITH_CV;
  return image ? SAVED_WITH_IMAGE : SAVED;
}

// Live preview (prd2 Feature 5)
export const PREVIEW = 'Preview';
export const EDIT_TAB = 'Edit';
export const FIX_ERRORS_TO_SAVE = 'Fix errors to save';
/** Save blocked by an error no field shows (review S2): the first message, when there is one. */
export const invalidFormMessage = (first?: string) => (first ? `${FIX_ERRORS_TO_SAVE}: ${first}` : FIX_ERRORS_TO_SAVE);
export const PREVIEW_UNAVAILABLE = 'Preview unavailable';
export const ICONS_AFTER_DEPLOY = 'Icons appear after deploy';
export const PLACEHOLDER = '—';

/** Save/delete/reorder failure copy, identical on every screen (prd2 Feature 1.7). null = say nothing (forced logout). */
export function saveFailureMessage(err: Error): string | null {
  if (err instanceof AuthError) return null;
  if (err instanceof ConflictError) return CONFLICT;
  if (err instanceof RateLimitError) return rateLimitMessage(err.resetAt);
  if (err instanceof PermissionError) return NO_LONGER_WRITE;
  if (err instanceof GitHubApiError) return err.message;
  if (err instanceof ValidationError && err.issues[0]) return `Not saved: ${err.issues[0].message}`;
  return SAVE_FAILED;
}

export function verifyMessage(result: Extract<VerifyResult, { ok: false }>): string {
  switch (result.reason) {
    case 'invalid-format':
      return 'Use a fine-grained token (it starts with github_pat_).';
    case 'invalid-token':
      return "GitHub rejected this token. Check it was copied fully and hasn't expired.";
    case 'wrong-user':
      return `This token belongs to @${result.login ?? 'unknown'}. Only @${SITE.owner} can use this admin.`;
    case 'no-repo-access':
      return `Can't find ${REPO} with this token. Check the repository exists and is included in the token's Repository access.`;
    case 'no-write-access':
      return `This token can't write to ${REPO}. Make sure Repository access includes it and Contents is Read and write.`;
    case 'network':
      return "Couldn't reach GitHub. Check your connection and try again.";
    case 'rate-limited':
      return rateLimitMessage(result.resetAt);
  }
}
