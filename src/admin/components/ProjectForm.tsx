import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import { ProjectSchema, type Project } from '../../content/schema';
import { ProjectCard } from '../../components/ProjectCard';
import { ProjectDetail } from '../../components/ProjectDetail';
import { hasDetailPage } from '../../components/ProjectsSection';
import { renderMarkdown } from '../../lib/markdown';
import { slugify } from '../../lib/slugify';
import { buildUploadPath } from '../../lib/uploads';
import { useLastCommitSha } from '../adminContext';
import { emptyToUndefined, issuesToFieldErrors, parseTags } from '../lib/formUtils';
import { checkTypedImageRef, finalizeUpload, type PendingUpload } from '../lib/imageProcessing';
import { resolvePreviewImage } from '../lib/previewImage';
import { IMAGE_NOT_UPLOADED } from '../messages';
import { httpsOrUndefined, monthOrPlaceholder, opt, orPlaceholder } from '../previewValues';
import {
  Field, FormActions, FormLayout, REQUIRED_MESSAGE, SaveBanners, differs, focusFirstError, useDirtyReport, useSaveRunner,
  type FieldErrors, type SaveExtras,
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
  featured: boolean;
  date: string;
}

/** Field order = focus order for the first invalid field. */
const FIELD_ORDER = ['title', 'id', 'summary', 'description', 'tags', 'image', 'imageAlt', 'repoUrl', 'demoUrl', 'featured', 'date'] as const;
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
    image: upload ? buildUploadPath('projects', v.id.trim(), upload.image.ext, upload.shortId) : v.image.trim(),
    imageAlt: v.imageAlt,
    repoUrl: v.repoUrl.trim(),
    demoUrl: v.demoUrl.trim(),
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
  const [loaded] = useState<Values>(() => toValues(initial));
  const [values, setValues] = useState<Values>(loaded);
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const { saving, conflict, saveError, run } = useSaveRunner();
  const formRef = useRef<HTMLFormElement>(null);
  const commitRef = useLastCommitSha();
  useDirtyReport(differs(values, loaded) || upload !== null, onDirtyChange);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (key === 'title' && !slugTouched) next.id = slugify(String(value));
      return next;
    });

  /** The id/title errors cover an upload path built from a bad id; a typed `src/` path is blocked (step 5b). */
  const imageErrors = (fieldErrors: FieldErrors<FieldName>) => {
    if (upload) {
      delete fieldErrors.image;
      return;
    }
    const typed = checkTypedImageRef(values.image, initial?.image);
    if (typed) fieldErrors.image = typed;
  };

  const validate = (): Project | null => {
    const result = ProjectSchema.safeParse(toRaw(values, upload));
    const fieldErrors: FieldErrors<FieldName> = result.success ? {} : (issuesToFieldErrors(result.error.issues) as FieldErrors<FieldName>);
    for (const f of REQUIRED) if (String(values[f]).trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    imageErrors(fieldErrors);
    if (mode === 'create' && !fieldErrors.id) {
      const dup = existing.find((p) => p.id === values.id.trim());
      if (dup) fieldErrors.id = `This slug is already used by '${dup.title}'`;
    }
    setErrors(fieldErrors);
    if (focusFirstError(formRef, FIELD_ORDER, fieldErrors)) return null;
    return result.success ? result.data : null;
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || conflict) return;
    const project = validate();
    if (!project) return;
    const pending = upload;
    void run(async () => {
      if (!pending) return onSave(project);
      // Save-time path from the final id (Feature 3 step 5a); the validated entry already holds the same path.
      const { path, file } = await finalizeUpload('projects', project.id, pending);
      await onSave({ ...project, image: path }, { files: [file], attachments: ['image'] });
    });
  };

  const snapshot = useMemo(() => ({ values, upload }), [values, upload]);
  const previewValid = ProjectSchema.safeParse(toRaw(values, upload)).success && (upload !== null || !checkTypedImageRef(values.image, initial?.image));

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
        const image = resolvePreviewImage(up ? undefined : v.image, { objectUrl: up?.objectUrl, commitRef });
        const detail = hasDetailPage(p);
        return (
          <>
            <ProjectCard project={p} image={image} hasDetail={detail} />
            {detail && (
              <div className="mt-6 border-t border-line">
                <ProjectDetail project={p} image={image} html={renderMarkdown(p.description)} />
              </div>
            )}
          </>
        );
      }}
    />
  );

  return (
    <FormLayout aside={preview}>
      <SaveBanners conflict={conflict} saveError={saveError} onReload={onReload} conflictNotes={upload ? [IMAGE_NOT_UPLOADED] : []} />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {text('title', 'Title')}
        <Field
          name="id"
          label="Slug"
          required
          error={errors.id}
          hint={mode === 'edit' ? 'The slug is the page URL and cannot change.' : 'Used in the URL: /portfolio/projects/<slug>/'}
        >
          {(c) => (
            <input
              {...c}
              type="text"
              value={values.id}
              readOnly={mode === 'edit'}
              onChange={(e) => {
                setSlugTouched(true);
                set('id', e.target.value);
              }}
            />
          )}
        </Field>
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
          pending={upload}
          onPendingChange={setUpload}
          onRemove={() => set('imageAlt', '')}
          error={errors.image}
          process={processImage}
        />
        {text('imageAlt', 'Image alt text')}
        {text('repoUrl', 'Repo URL', undefined, 'url')}
        {text('demoUrl', 'Demo URL', undefined, 'url')}
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
        <FormActions saving={saving} conflict={conflict} onCancel={onCancel} />
      </form>
    </FormLayout>
  );
}
