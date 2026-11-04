import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import { AvailabilitySchema, ProfileSchema, type Profile } from '../../content/schema';
import { ContactSection } from '../../components/ContactSection';
import { HeroSection } from '../../components/HeroSection';
import { buildUploadPath } from '../../lib/uploads';
import { useLastCommitSha } from '../adminContext';
import { cvDeleteChange, cvFileChange, cvUrlFor, isUploadedCvUrl } from '../lib/cvUpload';
import { issuesToFieldErrors } from '../lib/formUtils';
import type { FileChange } from '../lib/githubClient';
import type { Attachment } from '../lib/contentStore';
import { checkTypedImageRef, finalizeUpload, type PendingUpload } from '../lib/imageProcessing';
import { resolvePreviewImage } from '../lib/previewImage';
import { AVAILABILITY_LABELS, CV_NOT_UPLOADED, IMAGE_NOT_UPLOADED } from '../messages';
import { orPlaceholder } from '../previewValues';
import { CvField, type CvChange } from './CvField';
import {
  Field, FormActions, FormLayout, REQUIRED_MESSAGE, SaveBanners, differs, focusFirstError, useDirtyReport, useSaveRunner,
  type FieldErrors, type SaveExtras,
} from './formKit';
import { ImageField, type ProcessFn } from './ImageField';
import { PreviewPane } from './PreviewPane';

interface Values {
  name: string;
  title: string;
  bio: string;
  photo: string;
  location: string;
  availability: Profile['availability'];
  currentJobRole: string;
  currentJobCompany: string;
  email: string;
  linkedin: string;
  github: string;
  cvUrl: string;
}
const FIELD_ORDER = ['name', 'title', 'bio', 'photo', 'location', 'availability', 'currentJobRole', 'currentJobCompany', 'email', 'linkedin', 'github', 'cvUrl'] as const;
type FieldName = (typeof FIELD_ORDER)[number];
const REQUIRED: FieldName[] = ['name', 'title', 'bio', 'location', 'email', 'linkedin', 'github'];
/** Zod paths that differ from the form field name. */
const PATH_TO_FIELD: Record<string, FieldName> = {
  'socials.email': 'email', 'socials.linkedin': 'linkedin', 'socials.github': 'github',
  'currentJob.role': 'currentJobRole', 'currentJob.company': 'currentJobCompany',
};
/** The profile photo's upload slug (Feature 3 step 4). */
const PHOTO_SLUG = 'profile';

const toValues = (p: Profile): Values => ({
  name: p.name,
  title: p.title,
  bio: p.bio,
  photo: p.photo ?? '',
  location: p.location,
  availability: p.availability,
  currentJobRole: p.currentJob?.role ?? '',
  currentJobCompany: p.currentJob?.company ?? '',
  email: p.socials.email,
  linkedin: p.socials.linkedin,
  github: p.socials.github,
  cvUrl: p.cvUrl ?? '',
});

/** Raw profile for the schema (key order = serialization order); pending uploads/removal applied. */
function toRaw(v: Values, upload: PendingUpload | null, cv: CvChange) {
  const photo = upload ? buildUploadPath('profile', PHOTO_SLUG, upload.image.ext, upload.shortId) : v.photo.trim();
  const cvUrl = cv.kind === 'upload' ? cvUrlFor(cv.shortId) : cv.kind === 'remove' ? '' : v.cvUrl.trim();
  return {
    name: v.name,
    title: v.title,
    bio: v.bio,
    ...(photo !== '' ? { photo } : {}),
    location: v.location,
    availability: v.availability,
    // Omitted when both are empty; one empty is a field error (validate).
    ...(v.currentJobRole.trim() !== '' || v.currentJobCompany.trim() !== ''
      ? { currentJob: { role: v.currentJobRole, company: v.currentJobCompany } }
      : {}),
    socials: { email: v.email.trim(), linkedin: v.linkedin.trim(), github: v.github.trim() },
    ...(cvUrl !== '' ? { cvUrl } : {}),
  };
}

/** Parsed values when valid; otherwise best effort ("—" placeholders, links only when well-formed). */
function previewProfile(v: Values, upload: PendingUpload | null, cv: CvChange): Profile {
  const raw = toRaw(v, upload, cv);
  const parsed = ProfileSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const { photo: _photo, cvUrl, currentJob, ...rest } = raw;
  return {
    ...rest,
    ...(currentJob ? { currentJob: { role: orPlaceholder(currentJob.role), company: orPlaceholder(currentJob.company) } } : {}),
    name: orPlaceholder(v.name),
    title: orPlaceholder(v.title),
    bio: orPlaceholder(v.bio),
    location: orPlaceholder(v.location),
    ...(cvUrl !== undefined && /^\/(?!\/)|^https:\/\//.test(cvUrl) ? { cvUrl } : {}),
  };
}

/** Single object (no list, no id): saved as `content(profile): update profile` (+ attachments). */
export function ProfileForm({
  initial, onSave, onReload, onDirtyChange, processImage,
}: {
  initial: Profile;
  /** Called with `extras` only when files are committed or deleted with the profile (photo, CV). */
  onSave: (profile: Profile, extras?: SaveExtras) => Promise<void>;
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  processImage?: ProcessFn;
}) {
  const [loaded] = useState(() => toValues(initial));
  const [values, setValues] = useState(loaded);
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [cv, setCv] = useState<CvChange>({ kind: 'none' });
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const { saving, conflict, saveError, run } = useSaveRunner();
  const formRef = useRef<HTMLFormElement>(null);
  const commitRef = useLastCommitSha();
  useDirtyReport(differs(values, loaded) || upload !== null || cv.kind !== 'none', onDirtyChange);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  const validate = (): Profile | null => {
    const result = ProfileSchema.safeParse(toRaw(values, upload, cv));
    const fieldErrors: FieldErrors<FieldName> = {};
    if (!result.success) {
      for (const [path, message] of Object.entries(issuesToFieldErrors(result.error.issues))) {
        const field = PATH_TO_FIELD[path] ?? (path as FieldName);
        fieldErrors[field] ??= message;
      }
    }
    for (const f of REQUIRED) if (values[f].trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    const jobFields = ['currentJobRole', 'currentJobCompany'] as const;
    if (jobFields.some((f) => values[f].trim() !== '')) {
      for (const f of jobFields) if (values[f].trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    }
    if (!upload) {
      const typed = checkTypedImageRef(values.photo, initial.photo);
      if (typed) fieldErrors.photo = typed;
    }
    setErrors(fieldErrors);
    if (focusFirstError(formRef, FIELD_ORDER, fieldErrors)) return null;
    return result.success ? result.data : null;
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || conflict) return;
    const profile = validate();
    if (!profile) return;
    const photo = upload;
    const cvChange = cv;
    void run(async () => {
      const files: FileChange[] = [];
      const attachments: Attachment[] = [];
      let saved = profile;
      if (photo) {
        const { path, file } = await finalizeUpload('profile', PHOTO_SLUG, photo);
        saved = { ...saved, photo: path };
        files.push(file);
        attachments.push('image');
      }
      if (cvChange.kind === 'upload') {
        files.push(await cvFileChange(cvChange.file));
        attachments.push('cv');
      } else if (saved.cvUrl === undefined && isUploadedCvUrl(initial.cvUrl)) {
        // The uploaded CV is unlinked: delete the file in the same commit (Feature 4, Remove CV).
        files.push(cvDeleteChange());
        attachments.push('-cv');
      }
      await (files.length > 0 ? onSave(saved, { files, attachments }) : onSave(saved));
    });
  };

  const input = (name: Exclude<FieldName, 'availability' | 'bio' | 'photo' | 'cvUrl'>, label: string, type = 'text', hint?: string) => (
    <Field name={name} label={label} required={REQUIRED.includes(name)} error={errors[name]} hint={hint}>
      {(c) => <input {...c} type={type} value={values[name]} onChange={(e) => set(name, e.target.value)} />}
    </Field>
  );

  const snapshot = useMemo(() => ({ values, upload, cv }), [values, upload, cv]);
  const previewValid = ProfileSchema.safeParse(toRaw(values, upload, cv)).success && (upload !== null || !checkTypedImageRef(values.photo, initial.photo));
  const conflictNotes = [...(upload ? [IMAGE_NOT_UPLOADED] : []), ...(cv.kind === 'upload' ? [CV_NOT_UPLOADED] : [])];

  const preview = (
    <PreviewPane
      snapshot={snapshot}
      valid={previewValid}
      render={({ values: v, upload: up, cv: c }) => {
        const p = previewProfile(v, up, c);
        const photo = resolvePreviewImage(up ? undefined : v.photo, { objectUrl: up?.objectUrl, commitRef });
        return (
          <>
            <HeroSection profile={p} photo={photo} />
            <ContactSection socials={p.socials} />
          </>
        );
      }}
    />
  );

  return (
    <FormLayout aside={preview}>
      <SaveBanners conflict={conflict} saveError={saveError} onReload={onReload} conflictNotes={conflictNotes} />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {input('name', 'Name')}
        {input('title', 'Title')}
        <Field name="bio" label="Bio" required error={errors.bio}>
          {(c) => <textarea {...c} rows={6} value={values.bio} onChange={(e) => set('bio', e.target.value)} />}
        </Field>
        <ImageField
          name="photo"
          label="Photo"
          kind="profile"
          alt={values.name}
          value={values.photo}
          onValueChange={(v) => set('photo', v)}
          pending={upload}
          onPendingChange={setUpload}
          error={errors.photo}
          process={processImage}
        />
        {input('location', 'Location')}
        <Field name="availability" label="Availability" error={errors.availability}>
          {(c) => (
            <select {...c} value={values.availability} onChange={(e) => set('availability', e.target.value as Values['availability'])}>
              {AvailabilitySchema.options.map((a) => (
                <option key={a} value={a}>
                  {AVAILABILITY_LABELS[a]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {input('currentJobRole', 'Current role', 'text', 'Optional. With Availability "Not looking", the site shows "<role> @ <company>".')}
        {input('currentJobCompany', 'Current company')}
        {input('email', 'Email', 'email')}
        {input('linkedin', 'LinkedIn URL', 'url')}
        {input('github', 'GitHub URL', 'url')}
        <CvField value={values.cvUrl} onValueChange={(v) => set('cvUrl', v)} change={cv} onChange={setCv} error={errors.cvUrl} />
        <FormActions saving={saving} conflict={conflict} />
      </form>
    </FormLayout>
  );
}
