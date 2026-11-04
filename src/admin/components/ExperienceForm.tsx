import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import { ExperienceSchema, type Experience } from '../../content/schema';
import { TimelineItem } from '../../components/TimelineItem';
import { slugify } from '../../lib/slugify';
import { issuesToFieldErrors, parseLines, parseTags } from '../lib/formUtils';
import { ID_LOCKED_HINT, MAX_HIGHLIGHTS, idTaken } from '../messages';
import { monthOrPlaceholder, orPlaceholder } from '../previewValues';
import { entryLabel } from '../sections';
import { PreviewPane } from './PreviewPane';
import {
  Field, FieldError, FormActions, FormLayout, REQUIRED_MESSAGE, SaveBanners, differs, focusFirstError, useDirtyReport, useSaveRunner,
  type FieldErrors,
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
  const [loaded] = useState(() => toValues(initial));
  const [values, setValues] = useState(loaded);
  const [idTouched, setIdTouched] = useState(mode === 'edit');
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const { saving, conflict, saveError, run } = useSaveRunner();
  const formRef = useRef<HTMLFormElement>(null);
  useDirtyReport(differs(values, loaded), onDirtyChange);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => {
      const next = { ...v, [key]: value };
      if ((key === 'role' || key === 'org') && !idTouched) next.id = slugify(`${next.role} ${next.org}`);
      return next;
    });

  const validate = (): Experience | null => {
    const raw = toRaw(values);
    const highlights = raw.highlights;
    const result = ExperienceSchema.safeParse(raw);
    const fieldErrors: FieldErrors<FieldName> = result.success ? {} : (issuesToFieldErrors(result.error.issues) as FieldErrors<FieldName>);
    for (const f of ['role', 'org', 'id', 'start'] as const) if (values[f].trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    if (!values.present && values.end.trim() === '') fieldErrors.end = REQUIRED_MESSAGE;
    if (highlights.length > MAX_HIGHLIGHT_COUNT) fieldErrors.highlights = MAX_HIGHLIGHTS;
    if (mode === 'create' && !fieldErrors.id) {
      const dup = existing.find((x) => x.id === raw.id);
      if (dup) fieldErrors.id = idTaken(experienceLabel(dup));
    }
    setErrors(fieldErrors);
    if (focusFirstError(formRef, FIELD_ORDER, fieldErrors)) return null;
    return result.success ? result.data : null;
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || conflict) return;
    const entry = validate();
    if (entry) void run(() => onSave(entry));
  };

  const input = (name: 'role' | 'org' | 'id' | 'start' | 'location' | 'tags', label: string, opts: { required?: boolean; type?: string; hint?: string } = {}) => (
    <Field name={name} label={label} required={opts.required} error={errors[name]} hint={opts.hint}>
      {(c) => (
        <input
          {...c}
          type={opts.type ?? 'text'}
          placeholder={opts.type === 'month' ? 'YYYY-MM' : undefined}
          value={values[name]}
          readOnly={name === 'id' && mode === 'edit'}
          onChange={(e) => {
            if (name === 'id') setIdTouched(true);
            set(name, e.target.value);
          }}
        />
      )}
    </Field>
  );

  const snapshot = useMemo(() => ({ values }), [values]);
  const previewValid = ExperienceSchema.safeParse(toRaw(values)).success && parseLines(values.highlights).length <= MAX_HIGHLIGHT_COUNT;
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
      <SaveBanners conflict={conflict} saveError={saveError} onReload={onReload} />
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
        {input('id', 'Id', { required: true, hint: mode === 'edit' ? ID_LOCKED_HINT : undefined })}
        <div className="grid gap-4 sm:grid-cols-2">
          {input('start', 'Start', { required: true, type: 'month' })}
          <div className="flex flex-col gap-1">
            <label htmlFor="f-end" className="font-medium">
              End
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
