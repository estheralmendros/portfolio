import { type SubmitEvent, useMemo } from 'react';
import { SkillCategorySchema, SkillSchema, type Skill } from '../../content/schema';
import { SkillsSection } from '../../components/SkillsSection';
import { insertSkill } from '../lib/contentStore';
import { issuesToFieldErrors } from '../lib/formUtils';
import { ICONS_AFTER_DEPLOY, ICON_HINT, SKILL_CATEGORY_LABELS, WHOLE_NUMBER, skillNameTaken } from '../messages';
import { orPlaceholder } from '../previewValues';
import { PreviewPane } from './PreviewPane';
import {
  Field, FormActions, FormLayout, IdField, REQUIRED_MESSAGE, SaveBanners, duplicateIdError, isSavable, useAutoId, useEntryForm,
  type Checked, type FieldErrors,
} from './formKit';

interface Values {
  name: string;
  id: string;
  category: string;
  years: string;
  icon: string;
}
const FIELD_ORDER = ['name', 'id', 'category', 'years', 'icon'] as const;
type FieldName = (typeof FIELD_ORDER)[number];
const REQUIRED: FieldName[] = ['name', 'id', 'category'];

const toValues = (s?: Skill): Values => ({
  name: s?.name ?? '',
  id: s?.id ?? '',
  category: s?.category ?? '',
  years: s?.years === undefined ? '' : String(s.years),
  icon: s?.icon ?? '',
});

function toRaw(v: Values) {
  const years = v.years.trim();
  const icon = v.icon.trim();
  return {
    id: v.id.trim(),
    name: v.name,
    category: v.category,
    ...(years !== '' ? { years: Number(years) } : {}),
    ...(icon !== '' ? { icon } : {}),
  };
}

/** Never collides with a real id, so the draft can be inserted even when its id is taken. */
const DRAFT_ID = '\u0000draft';

/**
 * The full list with the draft in place (edit) or inserted at the top of its category (create).
 * Icons always use the initials fallback: simple-icons is not bundled into the admin (Feature 5.5).
 */
function previewSkills(v: Values, existing: Skill[], editId: string | undefined): Skill[] {
  const parsed = SkillSchema.safeParse(toRaw(v));
  const years = /^\d+$/.test(v.years.trim()) ? Number(v.years.trim()) : undefined;
  const draft: Skill = parsed.success
    ? parsed.data
    : ({ id: DRAFT_ID, name: orPlaceholder(v.name), category: v.category, ...(years !== undefined ? { years } : {}) } as Skill);
  if (editId !== undefined) return existing.map((s) => (s.id === editId ? { ...draft, id: editId } : s));
  return insertSkill(existing, { ...draft, id: DRAFT_ID });
}

export function SkillForm({
  mode, initial, existing, onSave, onCancel, onReload, onDirtyChange,
}: {
  mode: 'create' | 'edit';
  initial?: Skill;
  existing: Skill[];
  onSave: (skill: Skill) => Promise<void>;
  onCancel: () => void;
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const form = useEntryForm({ initialValues: () => toValues(initial), order: FIELD_ORDER, onDirtyChange });
  const { values, errors, saving, conflict, saveError, formError, formRef } = form;
  const autoId = useAutoId<Values>(mode === 'edit', ['name'], (v) => v.name);
  const set = (key: keyof Values, value: string) => form.set(key, value, autoId.derive);

  /** One check for Save and the preview (review S1). */
  const check = (): Checked<FieldName, Skill> => {
    const years = values.years.trim();
    const raw = toRaw(values);
    const result = SkillSchema.safeParse(raw);
    const fieldErrors: FieldErrors<FieldName> = result.success ? {} : (issuesToFieldErrors(result.error.issues) as FieldErrors<FieldName>);
    for (const f of REQUIRED) if (values[f].trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    if (years !== '' && !/^\d+$/.test(years)) fieldErrors.years = WHOLE_NUMBER;
    if (mode === 'create' && !fieldErrors.id) {
      const dup = duplicateIdError(existing, raw.id, (s) => s.name);
      if (dup) fieldErrors.id = dup;
    }
    if (!fieldErrors.name) {
      const name = values.name.trim().toLowerCase();
      const dup = existing.find((s) => s.id !== initial?.id && s.name.trim().toLowerCase() === name);
      if (dup) fieldErrors.name = skillNameTaken(dup.name);
    }
    return { errors: fieldErrors, data: result.success ? result.data : null };
  };
  const checked = check();
  const submit = (e: SubmitEvent<HTMLFormElement>) => form.submit(e, check, onSave);

  const snapshot = useMemo(() => ({ values }), [values]);
  const preview = (
    <PreviewPane
      snapshot={snapshot}
      valid={isSavable(checked)}
      note={ICONS_AFTER_DEPLOY}
      render={({ values: v }) => <SkillsSection skills={previewSkills(v, existing, mode === 'edit' ? initial?.id : undefined)} icons={{}} />}
    />
  );

  return (
    <FormLayout aside={preview}>
      <SaveBanners conflict={conflict} saveError={saveError} formError={formError} onReload={onReload} />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field name="name" label="Name" required error={errors.name}>
          {(c) => <input {...c} type="text" value={values.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <IdField
          mode={mode}
          value={values.id}
          error={errors.id}
          onChange={(v) => {
            autoId.touch();
            set('id', v);
          }}
        />
        <Field name="category" label="Category" required error={errors.category}>
          {(c) => (
            <select {...c} value={values.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Choose a category</option>
              {SkillCategorySchema.options.map((cat) => (
                <option key={cat} value={cat}>
                  {SKILL_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field name="years" label="Years" error={errors.years}>
          {(c) => <input {...c} type="text" inputMode="numeric" value={values.years} onChange={(e) => set('years', e.target.value)} />}
        </Field>
        <Field name="icon" label="Icon" error={errors.icon} hint={ICON_HINT}>
          {(c) => <input {...c} type="text" value={values.icon} onChange={(e) => set('icon', e.target.value)} />}
        </Field>
        <FormActions saving={saving} conflict={conflict} onCancel={onCancel} />
      </form>
    </FormLayout>
  );
}
