// Shared building blocks of the admin entry forms (projects, profile, skills, certifications, experience).
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Attachment } from '../lib/contentStore';
import { ConflictError, toAppError } from '../lib/errors';
import type { FileChange } from '../lib/githubClient';
import { CONFLICT, EDIT_TAB, PREVIEW, SAVING, saveFailureMessage } from '../messages';
import { StatusBanner } from './StatusBanner';

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

/** Extra files committed with the entry (uploads, CV delete) and the commit-message attachments (prd2 Features 3/4). */
export interface SaveExtras {
  files: FileChange[];
  attachments: Attachment[];
}
export const REQUIRED_MESSAGE = 'Required';

/** Props spread on the control of a field: id/name/aria wiring + the shared input class. */
export type ControlProps = {
  id: string;
  name: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  className: string;
};

/** Label + control + hint + error, wired with aria-invalid/aria-describedby (MVP markup: ids `f-<name>`). */
export function Field({
  name, label, required = false, error, hint, children,
}: { name: string; label: string; required?: boolean; error?: string; hint?: string; children: (c: ControlProps) => ReactNode }) {
  const errorId = `f-${name}-error`;
  const hintId = hint ? `f-${name}-hint` : undefined;
  const describedBy = [error ? errorId : null, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`f-${name}`} className="font-medium">
        {label}
        {required && <span aria-hidden="true">*</span>}
      </label>
      {children({ id: `f-${name}`, name, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, className: 'field-input' })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm font-medium text-danger">
      <span aria-hidden="true">⚠ </span>
      {error}
    </p>
  );
}

/** Focuses the first field (in `order`) that has an error; returns true when there was one. */
export function focusFirstError<F extends string>(form: RefObject<HTMLFormElement | null>, order: readonly F[], errors: FieldErrors<F>): boolean {
  const first = order.find((f) => errors[f]);
  if (!first) return false;
  form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  return true;
}

/** Reports dirty changes to the parent (dirty-form guard, review R13) and "clean" on unmount. */
export function useDirtyReport(dirty: boolean, onDirtyChange?: (dirty: boolean) => void): void {
  const cb = useRef(onDirtyChange);
  useEffect(() => {
    cb.current = onDirtyChange;
  });
  useEffect(() => {
    cb.current?.(dirty);
  }, [dirty]);
  useEffect(() => () => cb.current?.(false), []);
}

/**
 * Single-flight save with the MVP error handling: conflict blocks the form, other errors keep the data.
 * List forms navigate away inside `save`; the profile form stays and is usable again afterwards.
 */
export function useSaveRunner() {
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const run = async (save: () => Promise<void>) => {
    if (inFlight.current || conflict) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await save();
    } catch (e) {
      const err = toAppError(e);
      if (err instanceof ConflictError) setConflict(true);
      else setSaveError(saveFailureMessage(err));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return { saving, conflict, saveError, run };
}

/** Conflict banner (with Reload) and save-error banner above a form. */
export function SaveBanners({
  conflict, saveError, onReload, conflictNotes = [],
}: { conflict: boolean; saveError: string | null; onReload: () => void; conflictNotes?: string[] }) {
  return (
    <>
      {conflict && (
        <StatusBanner
          kind="error"
          action={
            <button type="button" className="btn-primary" onClick={onReload}>
              Reload
            </button>
          }
        >
          {[CONFLICT, ...conflictNotes].join(' ')}
        </StatusBanner>
      )}
      {saveError && <StatusBanner kind="error">{saveError}</StatusBanner>}
    </>
  );
}

export function FormActions({ saving, conflict, onCancel }: { saving: boolean; conflict: boolean; onCancel?: () => void }) {
  return (
    <div className="flex justify-end gap-3">
      {onCancel && (
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      )}
      <button type="submit" className="btn-primary" disabled={saving || conflict}>
        {saving ? SAVING : 'Save'}
      </button>
    </div>
  );
}

/**
 * Form + optional preview (prd2 Feature 5.1): side-by-side from 1024 px (form left, sticky preview right);
 * narrower, "Edit" / "Preview" tabs. Both panels stay mounted (classes toggle visibility), so switching tabs
 * never loses field state or revokes a pending upload's object URL. Without `aside`: MVP single column.
 */
export function FormLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const id = useId();
  const tabRefs = useRef<Record<'edit' | 'preview', HTMLButtonElement | null>>({ edit: null, preview: null });
  if (!aside) return <div className="flex flex-col gap-6">{children}</div>;
  const select = (t: 'edit' | 'preview', focus = false) => {
    setTab(t);
    if (focus) tabRefs.current[t]?.focus();
  };
  const tabButton = (t: 'edit' | 'preview', label: string) => (
    <button
      ref={(el) => {
        tabRefs.current[t] = el;
      }}
      type="button"
      role="tab"
      id={`${id}-tab-${t}`}
      aria-selected={tab === t}
      aria-controls={`${id}-panel-${t}`}
      tabIndex={tab === t ? 0 : -1}
      className={tab === t ? 'btn-primary' : 'btn-secondary'}
      onClick={() => select(t)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          const next = e.key === 'Home' ? 'edit' : e.key === 'End' ? 'preview' : t === 'edit' ? 'preview' : 'edit';
          select(next, true);
        }
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Form view" className="flex gap-2 lg:hidden">
        {tabButton('edit', EDIT_TAB)}
        {tabButton('preview', PREVIEW)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div
          role="tabpanel"
          id={`${id}-panel-edit`}
          aria-labelledby={`${id}-tab-edit`}
          className={`${tab === 'edit' ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col gap-6`}
        >
          {children}
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel-preview`}
          aria-labelledby={`${id}-tab-preview`}
          className={`${tab === 'preview' ? 'block' : 'hidden lg:block'} min-w-0 lg:sticky lg:top-4 lg:self-start`}
        >
          {aside}
        </div>
      </div>
    </div>
  );
}

/** Values-vs-loaded comparison used by every form's dirty flag. */
export const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
