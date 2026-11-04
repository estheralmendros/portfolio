// Image field with upload (prd2 Feature 3): thumbnail, Upload/Replace, Remove, and a collapsible
// "or use a URL / path" input (MVP behaviour). A selected file becomes a PendingUpload in the form state;
// the JSON value is left unchanged until Save, where the form builds the path from the final id.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { isUploadPath, randomShortId } from '../../lib/uploads';
import { useLastCommitSha } from '../adminContext';
import { ImageError } from '../lib/errors';
import { acceptedTypes, processImage, type ImageKind, type PendingUpload, type ProcessedImage } from '../lib/imageProcessing';
import { resolvePreviewImage } from '../lib/previewImage';
import {
  IMAGE_REF_HINT, IMAGE_UNREADABLE, NEW_IMAGE_SELECTED, PROCESSING_IMAGE, REMOVE_IMAGE, REPLACE_IMAGE, UPLOAD_IMAGE, USE_URL_OR_PATH,
  resizedNote,
} from '../messages';
import { FieldError } from './formKit';

export type ProcessFn = (file: File, kind: ImageKind) => Promise<ProcessedImage>;

export function ImageField({
  name, label, kind, alt, value, onValueChange, pending, onPendingChange, onRemove, error, hint = IMAGE_REF_HINT, process = processImage,
}: {
  /** Form field name (`image`, `photo`, `badge`): the text input is `#f-<name>` for focus-first-error. */
  name: string;
  label: string;
  kind: ImageKind;
  alt: string;
  value: string;
  onValueChange: (value: string) => void;
  pending: PendingUpload | null;
  onPendingChange: (pending: PendingUpload | null) => void;
  /** Extra clean-up on Remove (projects also clear imageAlt). */
  onRemove?: () => void;
  error?: string;
  hint?: string;
  /** Injectable for tests (the real one needs a canvas). */
  process?: ProcessFn;
}) {
  const commitRef = useLastCommitSha();
  const fileRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [open, setOpen] = useState(() => !!error || (value.trim() !== '' && !isUploadPath(value.trim())));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The object URL lives as long as its PendingUpload: revoked on replace, Remove, typing and unmount.
  const objectUrl = pending?.objectUrl;
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  // A new validation error opens the URL/path section (adjusting state during render, not in an effect).
  const [shownError, setShownError] = useState(error);
  if (error !== shownError) {
    setShownError(error);
    if (error) setOpen(true);
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      const image = await process(file, kind);
      const url = URL.createObjectURL(image.blob);
      if (!mounted.current) {
        URL.revokeObjectURL(url);
        return;
      }
      onPendingChange({ image, shortId: randomShortId(), objectUrl: url });
    } catch (err) {
      if (mounted.current) setUploadError(err instanceof ImageError ? err.message : IMAGE_UNREADABLE);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const remove = () => {
    setUploadError(null);
    onPendingChange(null);
    onValueChange('');
    onRemove?.();
  };

  const type = (v: string) => {
    setUploadError(null);
    if (pending) onPendingChange(null);
    onValueChange(v);
  };

  const thumb = resolvePreviewImage(value, { objectUrl, commitRef });
  const hasImage = pending !== null || value.trim() !== '';
  const inputId = `f-${name}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="font-medium">
        {label}
      </label>
      <div className="flex items-start gap-4">
        {thumb ? (
          <img src={thumb.src} alt={alt} className="h-20 w-20 shrink-0 rounded-md border border-line object-cover" />
        ) : (
          <div aria-hidden="true" className="h-20 w-20 shrink-0 rounded-md border border-dashed border-line-strong" />
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {hasImage ? REPLACE_IMAGE : UPLOAD_IMAGE}
            </button>
            {hasImage && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={remove}>
                {REMOVE_IMAGE}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            name={`${name}-file`}
            aria-label={`Choose ${label.toLowerCase()} file`}
            accept={acceptedTypes(kind).join(',')}
            hidden
            onChange={(e) => void onFile(e)}
          />
          <div aria-live="polite" className="text-sm">
            {busy && <p>{PROCESSING_IMAGE}</p>}
            {pending && !busy && (
              <>
                <p className="font-medium text-success">
                  <span aria-hidden="true">✓ </span>
                  {NEW_IMAGE_SELECTED}
                </p>
                <p className="text-muted">{resizedNote(pending.image.width, pending.image.height, pending.image.blob.size)}</p>
              </>
            )}
          </div>
          {uploadError && (
            <p role="alert" className="text-sm font-medium text-danger">
              <span aria-hidden="true">⚠ </span>
              {uploadError}
            </p>
          )}
        </div>
      </div>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="flex flex-col gap-1">
        <summary className="w-fit cursor-pointer text-sm font-medium">{USE_URL_OR_PATH}</summary>
        <div className="mt-2 flex flex-col gap-1">
          <input
            id={inputId}
            name={name}
            type="text"
            className="field-input"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={[error ? errorId : null, hintId].filter(Boolean).join(' ')}
            onChange={(e) => type(e.target.value)}
          />
          <p id={hintId} className="text-sm text-muted">
            {hint}
          </p>
        </div>
      </details>
      <FieldError id={errorId} error={error} />
    </div>
  );
}
