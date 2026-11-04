import { type SubmitEvent, useMemo } from 'react';
import { ExperienceSchema, type Experience } from '../../content/schema';
import { TimelineItem } from '../../components/TimelineItem';
import { issuesToFieldErrors, parseLines, parseTags } from '../lib/formUtils';
import { MAX_HIGHLIGHTS } from '../messages';
import { monthOrPlaceholder, orPlaceholder } from '../previewValues';
import { entryLabel } from '../sections';
import { PreviewPane } from './PreviewPane';
import {
  Field, FieldError, FormActions, FormLayout, IdField, REQUIRED_MESSAGE, SaveBanners, duplicateIdError, isSavable, useAutoId, useEntryForm,
  type Checked, type FieldErrors,
} from './formKit';

interface Values {
  type: 'work' | 'education';
  role: string;
  org: string;
  id: string;
  start: string;
  end: string;
  present: boolean;
  location: string;
  highlights: string;
  tags: string;
}
const FIELD_ORDER = ['type', 'role', 'org', 'id', 'start', 'end', 'location', 'highlights', 'tags'] as const;
type FieldName = (typeof FIELD_ORDER)[number];
const MAX_HIGHLIGHT_COUNT = 8;

const toValues = (e?: Experience): Values => ({
  type: e?.type ?? 'work',
  role: e?.role ?? '',
  org: e?.org ?? '',
  id: e?.id ?? '',
  start: e?.start ?? '',
  end: e?.end ?? '',
  present: e ? e.end === null : false,
  location: e?.location ?? '',
  highlights: e?.highlights.join('\n') ?? '',
  tags: e?.tags.join(', ') ?? '',
});

const experienceLabel = (e: Experience) => entryLabel('experience', e);

function toRaw(v: Values) {
  const location = v.location.trim();
  return {
    id: v.id.trim(),
    type: v.type,
    role: v.role,
    org: v.org,
    start: v.start.trim(),
    end: v.present ? null : v.end.trim(),
    ...(location !== '' ? { location: v.location } : {}),
    highlights: parseLines(v.highlights),
    tags: parseTags(v.tags),
  };
}

function previewEntry(v: Values): Experience {
  const raw = toRaw(v);
  const parsed = ExperienceSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return {
    ...raw,
    id: raw.id || 'preview',
    role: orPlaceholder(v.role),
    org: orPlaceholder(v.org),
    start: monthOrPlaceholder(v.start),
    end: v.present ? null : monthOrPlaceholder(v.end),
    highlights: raw.highlights.slice(0, MAX_HIGHLIGHT_COUNT),
  };
}

export function ExperienceForm({
  mode, initial, existing, onSave, onCancel, onReload, onDirtyChange,
}: {
  mode: 'create' | 'edit';
  initial?: Experience;
  existing: Experience[];
  onSave: (entry: Experience) => Promise<void>;
  onCancel: () => void;
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const form = useEntryForm({ initialValues: () => toValues(initial), order: FIELD_ORDER, onDirtyChange });
  const { values, errors, saving, conflict, saveError, formError, formRef } = form;
  const autoId = useAutoId<Values>(mode === 'edit', ['role', 'org'], (v) => `${v.role} ${v.org}`);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => form.set(key, value, autoId.derive);

  /** One check for Save and the preview (review S1). */
  const check = (): Checked<FieldName, Experience> => {
    const raw = toRaw(values);
    const result = ExperienceSchema.safeParse(raw);
    const fieldErrors: FieldErrors<FieldName> = result.success ? {} : (issuesToFieldErrors(result.error.issues) as FieldErrors<FieldName>);
    for (const f of ['role', 'org', 'id', 'start'] as const) if (values[f].trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    if (!values.present && values.end.trim() === '') fieldErrors.end = REQUIRED_MESSAGE;
    if (raw.highlights.length > MAX_HIGHLIGHT_COUNT) fieldErrors.highlights = MAX_HIGHLIGHTS;
    if (mode === 'create' && !fieldErrors.id) {
      const dup = duplicateIdError(existing, raw.id, experienceLabel);
      if (dup) fieldErrors.id = dup;
    }
    return { errors: fieldErrors, data: result.success ? result.data : null };
  };
  const checked = check();
  const submit = (e: SubmitEvent<HTMLFormElement>) => form.submit(e, check, onSave);

  const input = (name: 'role' | 'org' | 'start' | 'location' | 'tags', label: string, opts: { required?: boolean; type?: string; hint?: string } = {}) => (
    <Field name={name} label={label} required={opts.required} error={errors[name]} hint={opts.hint}>
      {(c) => (
        <input
          {...c}
          type={opts.type ?? 'text'}
          placeholder={opts.type === 'month' ? 'YYYY-MM' : undefined}
          value={values[name]}
          onChange={(e) => set(name, e.target.value)}
        />
      )}
    </Field>
  );

  const snapshot = useMemo(() => ({ values }), [values]);
  const previewValid = isSavable(checked);
  const preview = (
    <PreviewPane
      snapshot={snapshot}
      valid={previewValid}
      render={({ values: v }) => (
        <ol className="ml-4">
          <TimelineItem entry={previewEntry(v)} />
        </ol>
      )}
    />
  );

  return (
    <FormLayout aside={preview}>
      <SaveBanners conflict={conflict} saveError={saveError} formError={formError} onReload={onReload} />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="font-medium">Type</legend>
          <div className="flex gap-6">
            {(['work', 'education'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="radio" name="type" value={t} checked={values.type === t} onChange={() => set('type', t)} />
                {t === 'work' ? 'Work' : 'Education'}
              </label>
            ))}
          </div>
        </fieldset>
        {input('role', 'Role', { required: true })}
        {input('org', 'Organization', { required: true })}
        <IdField
          mode={mode}
          value={values.id}
          error={errors.id}
          onChange={(v) => {
            autoId.touch();
            set('id', v);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {input('start', 'Start', { required: true, type: 'month' })}
          <div className="flex flex-col gap-1">
            <label htmlFor="f-end" className="font-medium">
              End
              {!values.present && <span aria-hidden="true">*</span>}
            </label>
            <div className="flex items-center gap-3">
              <input
                id="f-end"
                name="end"
                type="month"
                placeholder="YYYY-MM"
                className="field-input"
                value={values.present ? '' : values.end}
                disabled={values.present}
                aria-invalid={errors.end ? true : undefined}
                aria-required={values.present ? undefined : true}
                aria-describedby={errors.end ? 'f-end-error' : undefined}
                onChange={(e) => set('end', e.target.value)}
              />
              <label className="flex shrink-0 items-center gap-2">
                <input type="checkbox" name="present" checked={values.present} onChange={(e) => set('present', e.target.checked)} />
                Present
              </label>
            </div>
            <FieldError id="f-end-error" error={errors.end} />
          </div>
        </div>
        {input('location', 'Location')}
        <Field name="highlights" label="Highlights (one per line)" error={errors.highlights} hint="Up to 8.">
          {(c) => <textarea {...c} rows={5} value={values.highlights} onChange={(e) => set('highlights', e.target.value)} />}
        </Field>
        {input('tags', 'Tags', { hint: 'Comma-separated, e.g. TypeScript, React' })}
        <FormActions saving={saving} conflict={conflict} onCancel={onCancel} />
      </form>
    </FormLayout>
  );
}
