// Shared building blocks of the admin entry forms (projects, profile, skills, certifications, experience).
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject, type SubmitEvent } from 'react';
import { slugify } from '../../lib/slugify';
import { buildUploadPath, type UploadCollection } from '../../lib/uploads';
import { useLastCommitSha } from '../adminContext';
import type { Attachment } from '../lib/contentStore';
import { ConflictError, toAppError } from '../lib/errors';
import type { FileChange } from '../lib/githubClient';
import { checkTypedImageRef, finalizeUpload, type PendingUpload } from '../lib/imageProcessing';
import { resolvePreviewImage } from '../lib/previewImage';
import {
  CANCEL, CONFLICT, EDIT_TAB, FORM_VIEW, ID_LOCKED_HINT, IMAGE_NOT_UPLOADED, PREVIEW, RELOAD, SAVE, SAVING, idTaken, invalidFormMessage,
  saveFailureMessage,
} from '../messages';
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
  'aria-required'?: true;
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
      {children({ id: `f-${name}`, name, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required ? true : undefined, className: 'field-input' })}
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
  const el = form.current?.querySelector<HTMLElement>(`[name="${first}"]`);
  // A control inside a collapsed <details> (the image URL/path section) can't take focus until it is open.
  const details = el?.closest('details');
  if (details && !details.open) details.open = true;
  el?.focus();
  return true;
}

/** Field errors + the parsed entry (null when it would not save), computed by one pure function per form. */
export interface Checked<F extends string, T> {
  errors: FieldErrors<F>;
  data: T | null;
}

/** True when a `Checked` result would save: the preview's "Fix errors to save" and Save use the same rule. */
export const isSavable = <F extends string, T>(c: Checked<F, T>): boolean => c.data !== null && Object.keys(c.errors).length === 0;

/**
 * The shared entry-form skeleton (review S1): loaded/values/errors state, dirty reporting, the single-flight save
 * runner and submit = check → show errors → focus the first one (or a banner when none can be focused) → save.
 */
export function useEntryForm<V, F extends string>({
  initialValues, order, extraDirty = false, busy = false, onDirtyChange,
}: {
  initialValues: () => V;
  /** Field order = focus order for the first invalid field. */
  order: readonly F[];
  /** Pending changes outside `values` (uploads, CV change). */
  extraDirty?: boolean;
  /** Blocks submit (an image still processing, review W7); FormActions disables Save with the same flag. */
  busy?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [loaded] = useState(initialValues);
  const [values, setValues] = useState<V>(loaded);
  const [errors, setErrors] = useState<FieldErrors<F>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const runner = useSaveRunner();
  const formRef = useRef<HTMLFormElement>(null);
  useDirtyReport(differs(values, loaded) || extraDirty, onDirtyChange);

  const set = <K extends keyof V>(key: K, value: V[K], derive?: (next: V, key: keyof V) => V) =>
    setValues((v) => {
      const next = { ...v, [key]: value };
      return derive ? derive(next, key) : next;
    });

  /** The form's submit: `check` validates the current values, `save` commits the parsed entry. */
  const submit = <T,>(e: SubmitEvent<HTMLFormElement>, check: () => Checked<F, T>, save: (data: T) => Promise<void>) => {
    e.preventDefault();
    if (runner.saving || runner.conflict || busy) return;
    const { errors: fieldErrors, data } = check();
    setErrors(fieldErrors);
    if (focusFirstError(formRef, order, fieldErrors)) {
      setFormError(null);
      return;
    }
    if (data === null) {
      // An error on a path the form has no field for: say so instead of a silent no-op (review S2).
      setFormError(invalidFormMessage(Object.values<string | undefined>(fieldErrors).find(Boolean)));
      return;
    }
    setFormError(null);
    void runner.run(() => save(data));
  };

  return { values, set, errors, formError, formRef, submit, ...runner };
}

/**
 * Auto-derived id (review S1): the id follows `source` until the user edits it; locked from the start in edit mode.
 * `derive` is passed to `useEntryForm().set`; `touch` is called by the id input.
 */
export function useAutoId<V extends { id: string }>(locked: boolean, sourceKeys: readonly (keyof V)[], source: (v: V) => string) {
  const [touched, setTouched] = useState(locked);
  return {
    derive: (next: V, key: keyof V): V => (!touched && sourceKeys.includes(key) ? { ...next, id: slugify(source(next)) } : next),
    touch: () => setTouched(true),
  };
}

/** The id input of the list forms: required, read-only with a "cannot change" hint when editing. */
export function IdField({
  mode, value, error, onChange, label = 'Id', lockedHint = ID_LOCKED_HINT, createHint,
}: {
  mode: 'create' | 'edit';
  value: string;
  error?: string;
  onChange: (value: string) => void;
  label?: string;
  lockedHint?: string;
  createHint?: string;
}) {
  return (
    <Field name="id" label={label} required error={error} hint={mode === 'edit' ? lockedHint : createHint}>
      {(c) => <input {...c} type="text" value={value} readOnly={mode === 'edit'} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/** "This id is already used by '<label>'" for a new entry whose id is taken (review S1). */
export function duplicateIdError<T extends { id: string }>(existing: readonly T[], id: string, label: (entry: T) => string, noun?: string): string | undefined {
  const dup = existing.find((x) => x.id === id);
  return dup ? idTaken(label(dup), noun) : undefined;
}

/**
 * Image upload wiring shared by the project, certification and profile forms (prd2 Feature 3, review S1/W7):
 * the pending upload, the processing busy state, the JSON value, the typed-path rule, preview image and Save-time file.
 */
export function useImageUpload(collection: UploadCollection, loadedValue: string | undefined) {
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [busy, setBusy] = useState(false);
  const commitRef = useLastCommitSha();
  return {
    upload,
    busy,
    /** Props for <ImageField>. */
    fieldProps: { pending: upload, onPendingChange: setUpload, onBusyChange: setBusy },
    /** Conflict-banner note when a selected image was not committed. */
    conflictNotes: upload ? [IMAGE_NOT_UPLOADED] : [],
    /** Applies the image rules to `errors`: an upload's path errors are covered by the id/title; a typed `src/` path is blocked. */
    checkErrors: <F extends string>(errors: FieldErrors<F>, field: F, typed: string, up: PendingUpload | null = upload) => {
      if (up) {
        delete errors[field];
        return;
      }
      const message = checkTypedImageRef(typed, loadedValue);
      if (message) errors[field] = message;
    },
    /** The preview image for a (debounced) snapshot. */
    previewImage: (typed: string, up: PendingUpload | null) => resolvePreviewImage(up ? undefined : typed, { objectUrl: up?.objectUrl, commitRef }),
    /** Save-time path + file from the final slug (Feature 3 step 5a); null without an upload. */
    finalize: (slug: string) => (upload ? finalizeUpload(collection, slug, upload) : Promise.resolve(null)),
  };
}

/** The JSON image value for the schema: the upload path built from the current slug, or the typed ref. */
export const imageRef = (collection: UploadCollection, typed: string, slug: string, up: PendingUpload | null): string =>
  up ? buildUploadPath(collection, slug, up.image.ext, up.shortId) : typed.trim();

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
  conflict, saveError, onReload, conflictNotes = [], formError = null,
}: { conflict: boolean; saveError: string | null; onReload: () => void; conflictNotes?: string[]; formError?: string | null }) {
  return (
    <>
      {conflict && (
        <StatusBanner
          kind="error"
          action={
            <button type="button" className="btn-primary" onClick={onReload}>
              {RELOAD}
            </button>
          }
        >
          {[CONFLICT, ...conflictNotes].join(' ')}
        </StatusBanner>
      )}
      {saveError && <StatusBanner kind="error">{saveError}</StatusBanner>}
      {formError && <StatusBanner kind="error">{formError}</StatusBanner>}
    </>
  );
}

export function FormActions({
  saving, conflict, onCancel, busy = false,
}: { saving: boolean; conflict: boolean; onCancel?: () => void; /** e.g. an image still processing (review W7) */ busy?: boolean }) {
  return (
    <div className="flex justify-end gap-3">
      {onCancel && (
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {CANCEL}
        </button>
      )}
      <button type="submit" className="btn-primary" disabled={saving || conflict || busy}>
        {saving ? SAVING : SAVE}
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
  const wide = useMediaQuery(WIDE_LAYOUT);
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
  // Side by side (from lg) both panels are visible, so the tab semantics are dropped (review S8b). The tree keeps
  // its shape either way, so a resize never remounts the form (field state, a pending upload's processing).
  const panel = (t: 'edit' | 'preview') =>
    wide ? {} : { role: 'tabpanel', id: `${id}-panel-${t}`, 'aria-labelledby': `${id}-tab-${t}` };
  return (
    <div className="flex flex-col gap-4">
      {!wide && (
        <div role="tablist" aria-label={FORM_VIEW} className="flex gap-2 lg:hidden">
          {tabButton('edit', EDIT_TAB)}
          {tabButton('preview', PREVIEW)}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div {...panel('edit')} className={`${tab === 'edit' ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col gap-6`}>
          {children}
        </div>
        <div {...panel('preview')} className={`${tab === 'preview' ? 'block' : 'hidden lg:block'} min-w-0 lg:sticky lg:top-4 lg:self-start`}>
          {aside}
        </div>
      </div>
    </div>
  );
}

/** The Tailwind `lg` breakpoint: from here the form and preview sit side by side. */
const WIDE_LAYOUT = '(min-width: 1024px)';

/** matchMedia as external state; false when matchMedia is unavailable (jsdom), i.e. the tabbed layout. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** Values-vs-loaded comparison used by every form's dirty flag. */
export const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
