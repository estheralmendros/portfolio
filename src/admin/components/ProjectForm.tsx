import { type SubmitEvent, useMemo } from 'react';
import { ProjectSchema, type Project } from '../../content/schema';
import { ProjectCard } from '../../components/ProjectCard';
import { ProjectDetail } from '../../components/ProjectDetail';
import { renderMarkdown } from '../../lib/markdown';
import { withBase } from '../../lib/paths';
import { hasDetailPage } from '../../lib/projects';
import { emptyToUndefined, issuesToFieldErrors, parseTags } from '../lib/formUtils';
import type { PendingUpload } from '../lib/imageProcessing';
import { SLUG_LOCKED_HINT, slugHint } from '../messages';
import { httpsOrUndefined, monthOrPlaceholder, opt, orPlaceholder } from '../previewValues';
import {
  Field, FormActions, FormLayout, IdField, REQUIRED_MESSAGE, SaveBanners, duplicateIdError, imageRef, isSavable, useAutoId, useEntryForm,
  useImageUpload, type Checked, type FieldErrors, type SaveExtras,
} from './formKit';
import { ImageField, type ProcessFn } from './ImageField';
import { PreviewPane } from './PreviewPane';

interface Values {
  title: string;
  id: string;
  summary: string;
  description: string;
  tags: string;
  image: string;
  imageAlt: string;
  repoUrl: string;
  demoUrl: string;
  docUrl: string;
  featured: boolean;
  date: string;
}

/** Field order = focus order for the first invalid field. */
const FIELD_ORDER = ['title', 'id', 'summary', 'description', 'tags', 'image', 'imageAlt', 'repoUrl', 'demoUrl', 'docUrl', 'featured', 'date'] as const;
type FieldName = (typeof FIELD_ORDER)[number];
const REQUIRED: FieldName[] = ['title', 'id', 'summary', 'date'];

/** Raw entry for the schema; a pending upload's path is built from the current id (final at Save). */
function toRaw(v: Values, upload: PendingUpload | null) {
  return emptyToUndefined({
    id: v.id.trim(),
    title: v.title,
    summary: v.summary,
    description: v.description,
    tags: parseTags(v.tags),
    image: imageRef('projects', v.image, v.id.trim(), upload),
    imageAlt: v.imageAlt,
    repoUrl: v.repoUrl.trim(),
    demoUrl: v.demoUrl.trim(),
    docUrl: v.docUrl.trim(),
    featured: v.featured,
    date: v.date.trim(),
  });
}

/** Parsed values when valid; otherwise best effort from the raw values ("—" placeholders). */
function previewProject(v: Values, upload: PendingUpload | null): Project {
  const parsed = ProjectSchema.safeParse(toRaw(v, upload));
  if (parsed.success) return parsed.data;
  return {
    id: v.id.trim() || 'preview',
    title: orPlaceholder(v.title),
    summary: orPlaceholder(v.summary),
    description: v.description,
    tags: parseTags(v.tags),
    ...opt('imageAlt', v.imageAlt.trim() === '' ? undefined : v.imageAlt),
    ...opt('repoUrl', httpsOrUndefined(v.repoUrl)),
    ...opt('demoUrl', httpsOrUndefined(v.demoUrl)),
    ...opt('docUrl', httpsOrUndefined(v.docUrl)),
    featured: v.featured,
    date: monthOrPlaceholder(v.date),
  };
}

function toValues(p?: Project): Values {
  return {
    title: p?.title ?? '',
    id: p?.id ?? '',
    summary: p?.summary ?? '',
    description: p?.description ?? '',
    tags: p?.tags.join(', ') ?? '',
    image: p?.image ?? '',
    imageAlt: p?.imageAlt ?? '',
    repoUrl: p?.repoUrl ?? '',
    demoUrl: p?.demoUrl ?? '',
    docUrl: p?.docUrl ?? '',
    featured: p?.featured ?? false,
    date: p?.date ?? '',
  };
}

export function ProjectForm({
  mode, initial, existing, onSave, onCancel, onReload, onDirtyChange, processImage,
}: {
  mode: 'create' | 'edit';
  initial?: Project;
  existing: Project[];
  /** Called with `extras` only when files are committed with the entry (an image upload). */
  onSave: (project: Project, extras?: SaveExtras) => Promise<void>;
  onCancel: () => void;
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Injectable image processing (tests; the real one needs a canvas). */
  processImage?: ProcessFn;
}) {
  const image = useImageUpload('projects', initial?.image);
  const { upload } = image;
  const form = useEntryForm({
    initialValues: () => toValues(initial),
    order: FIELD_ORDER,
    extraDirty: upload !== null,
    busy: image.busy,
    onDirtyChange,
  });
  const { values, errors, saving, conflict, saveError, formError, formRef } = form;
  const autoId = useAutoId<Values>(mode === 'edit', ['title'], (v) => v.title);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => form.set(key, value, autoId.derive);

  /** One check for Save and the preview (review S1): schema, required fields, image rules, duplicate slug. */
  const check = (): Checked<FieldName, Project> => {
    const result = ProjectSchema.safeParse(toRaw(values, upload));
    const fieldErrors: FieldErrors<FieldName> = result.success ? {} : (issuesToFieldErrors(result.error.issues) as FieldErrors<FieldName>);
    for (const f of REQUIRED) if (String(values[f]).trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    image.checkErrors(fieldErrors, 'image', values.image);
    if (mode === 'create' && !fieldErrors.id) {
      const dup = duplicateIdError(existing, values.id.trim(), (p) => p.title, 'slug');
      if (dup) fieldErrors.id = dup;
    }
    return { errors: fieldErrors, data: result.success ? result.data : null };
  };
  const checked = check();

  const submit = (e: SubmitEvent<HTMLFormElement>) =>
    form.submit(e, check, async (project) => {
      // Save-time path from the final id (Feature 3 step 5a); the validated entry already holds the same path.
      const file = await image.finalize(project.id);
      if (!file) return onSave(project);
      await onSave({ ...project, image: file.path }, { files: [file.file], attachments: ['image'] });
    });

  const snapshot = useMemo(() => ({ values, upload }), [values, upload]);
  const previewValid = isSavable(checked);

  const text = (name: FieldName & keyof Values, label: string, hint?: string, type = 'text') => (
    <Field name={name} label={label} required={REQUIRED.includes(name)} error={errors[name]} hint={hint}>
      {(c) => <input {...c} type={type} value={values[name] as string} onChange={(e) => set(name, e.target.value)} />}
    </Field>
  );

  const preview = (
    <PreviewPane
      snapshot={snapshot}
      valid={previewValid}
      render={({ values: v, upload: up }) => {
        const p = previewProject(v, up);
        const img = image.previewImage(v.image, up);
        const detail = hasDetailPage(p);
        return (
          <>
            <ProjectCard project={p} image={img} hasDetail={detail} />
            {detail && (
              <div className="mt-6 border-t border-line">
                <ProjectDetail project={p} image={img} html={renderMarkdown(p.description)} />
              </div>
            )}
          </>
        );
      }}
    />
  );

  return (
    <FormLayout aside={preview}>
      <SaveBanners conflict={conflict} saveError={saveError} formError={formError} onReload={onReload} conflictNotes={image.conflictNotes} />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {text('title', 'Title')}
        <IdField
          mode={mode}
          label="Slug"
          value={values.id}
          error={errors.id}
          lockedHint={SLUG_LOCKED_HINT}
          createHint={slugHint(withBase('/projects/<slug>/'))}
          onChange={(v) => {
            autoId.touch();
            set('id', v);
          }}
        />
        {text('summary', 'Summary')}
        <Field name="description" label="Description" error={errors.description} hint="Markdown. Leave empty for no detail page.">
          {(c) => <textarea {...c} rows={8} value={values.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        {text('tags', 'Tags', 'Comma-separated, e.g. React, TypeScript')}
        <ImageField
          name="image"
          label="Image"
          kind="project"
          alt={values.imageAlt}
          value={values.image}
          onValueChange={(v) => set('image', v)}
          {...image.fieldProps}
          onRemove={() => set('imageAlt', '')}
          error={errors.image}
          process={processImage}
        />
        {text('imageAlt', 'Image alt text')}
        {text('repoUrl', 'Repo URL', undefined, 'url')}
        {text('demoUrl', 'Demo URL', undefined, 'url')}
        {text('docUrl', 'Documentation URL', undefined, 'url')}
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="featured" checked={values.featured} onChange={(e) => set('featured', e.target.checked)} />
            Featured
          </label>
          <div className="min-w-48">
            <Field name="date" label="Date" required error={errors.date}>
              {(c) => <input {...c} type="month" placeholder="YYYY-MM" value={values.date} onChange={(e) => set('date', e.target.value)} />}
            </Field>
          </div>
        </div>
        <FormActions saving={saving} conflict={conflict} busy={image.busy} onCancel={onCancel} />
      </form>
    </FormLayout>
  );
}
