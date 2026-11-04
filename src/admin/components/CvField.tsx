// CV field (prd2 Feature 4): path/URL input, "Upload CV (PDF)", "Remove CV" with Undo, and the git-history hint.
// Changes are staged in the form state (CvChange) and committed by the form at Save.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { randomShortId } from '../../lib/uploads';
import { validateCv } from '../lib/cvUpload';
import { CvError } from '../lib/errors';
import { CV_HINT, CV_HISTORY_HINT, CV_INVALID, CV_WILL_BE_REMOVED, REMOVE_CV, UNDO, UPLOAD_CV, cvSelected } from '../messages';
import { FieldError } from './formKit';

/** Pending CV change: a new PDF to upload, or removal of the current CV (Remove CV, until Undo). */
export type CvChange = { kind: 'none' } | { kind: 'upload'; file: File; shortId: string } | { kind: 'remove' };

export function CvField({
  value, onValueChange, change, onChange, error, name = 'cvUrl', label = 'CV',
}: {
  value: string;
  onValueChange: (value: string) => void;
  change: CvChange;
  onChange: (change: CvChange) => void;
  error?: string;
  name?: string;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      await validateCv(file);
      // Upload replaces a pending removal (Feature 4.6).
      if (mounted.current) onChange({ kind: 'upload', file, shortId: randomShortId() });
    } catch (err) {
      if (mounted.current) setUploadError(err instanceof CvError ? err.message : CV_INVALID);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // Remove discards a pending upload; it marks the current CV (if any) for removal.
  const remove = () => {
    setUploadError(null);
    onChange(value.trim() !== '' ? { kind: 'remove' } : { kind: 'none' });
  };

  const type = (v: string) => {
    setUploadError(null);
    if (change.kind !== 'none') onChange({ kind: 'none' });
    onValueChange(v);
  };

  const inputId = `f-${name}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const historyId = `${inputId}-history`;
  const canRemove = change.kind === 'upload' || (change.kind === 'none' && value.trim() !== '');

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="font-medium">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type="text"
        className="field-input"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errorId : null, hintId, historyId].filter(Boolean).join(' ')}
        onChange={(e) => type(e.target.value)}
      />
      <p id={hintId} className="text-sm text-muted">
        {CV_HINT}
      </p>
      <FieldError id={errorId} error={error} />
      <div aria-live="polite" className="text-sm">
        {change.kind === 'upload' && (
          <p className="font-medium text-success">
            <span aria-hidden="true">✓ </span>
            {cvSelected(change.file.name, change.file.size)}
          </p>
        )}
        {change.kind === 'remove' && <p className="font-medium">{CV_WILL_BE_REMOVED}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {UPLOAD_CV}
        </button>
        {canRemove && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={remove}>
            {REMOVE_CV}
          </button>
        )}
        {change.kind === 'remove' && (
          <button type="button" className="btn-secondary" onClick={() => onChange({ kind: 'none' })}>
            {UNDO}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        name={`${name}-file`}
        aria-label="Choose a PDF file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => void onFile(e)}
      />
      {uploadError && (
        <p role="alert" className="text-sm font-medium text-danger">
          <span aria-hidden="true">⚠ </span>
          {uploadError}
        </p>
      )}
      <p id={historyId} className="text-sm text-muted">
        <span aria-hidden="true">ⓘ </span>
        {CV_HISTORY_HINT}
      </p>
    </div>
  );
}
