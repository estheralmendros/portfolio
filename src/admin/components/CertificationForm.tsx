import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import { CertificationSchema, type Certification } from '../../content/schema';
import { CertificationCard } from '../../components/CertificationCard';
import { currentYearMonth } from '../../lib/dates';
import { slugify } from '../../lib/slugify';
import { buildUploadPath } from '../../lib/uploads';
import { useLastCommitSha } from '../adminContext';
import { emptyToUndefined, issuesToFieldErrors } from '../lib/formUtils';
import { checkTypedImageRef, finalizeUpload, type PendingUpload } from '../lib/imageProcessing';
import { resolvePreviewImage } from '../lib/previewImage';
import { ID_LOCKED_HINT, IMAGE_NOT_UPLOADED, idTaken } from '../messages';
import { httpsOrUndefined, monthOrPlaceholder, opt, orPlaceholder } from '../previewValues';
import {
  Field, FormActions, FormLayout, REQUIRED_MESSAGE, SaveBanners, differs, focusFirstError, useDirtyReport, useSaveRunner,
  type FieldErrors, type SaveExtras,
} from './formKit';
import { ImageField, type ProcessFn } from './ImageField';
import { PreviewPane } from './PreviewPane';

interface Values {
  name: string;
  id: string;
  issuer: string;
  issued: string;
  expires: string;
  credentialId: string;
  credentialUrl: string;
  badge: string;
}
const FIELD_ORDER = ['name', 'id', 'issuer', 'issued', 'expires', 'credentialId', 'credentialUrl', 'badge'] as const;
type FieldName = (typeof FIELD_ORDER)[number];
const REQUIRED: FieldName[] = ['name', 'id', 'issuer', 'issued'];

const toValues = (c?: Certification): Values => ({
  name: c?.name ?? '',
  id: c?.id ?? '',
  issuer: c?.issuer ?? '',
  issued: c?.issued ?? '',
  expires: c?.expires ?? '',
  credentialId: c?.credentialId ?? '',
  credentialUrl: c?.credentialUrl ?? '',
  badge: c?.badge ?? '',
});

function toRaw(v: Values, upload: PendingUpload | null) {
  return emptyToUndefined({
    id: v.id.trim(),
    name: v.name,
    issuer: v.issuer,
    issued: v.issued.trim(),
    expires: v.expires.trim(),
    credentialId: v.credentialId,
    credentialUrl: v.credentialUrl.trim(),
    badge: upload ? buildUploadPath('certifications', v.id.trim(), upload.image.ext, upload.shortId) : v.badge.trim(),
  });
}

function previewCertification(v: Values, upload: PendingUpload | null): Certification {
  const parsed = CertificationSchema.safeParse(toRaw(v, upload));
  if (parsed.success) return parsed.data;
  return {
    id: v.id.trim() || 'preview',
    name: orPlaceholder(v.name),
    issuer: orPlaceholder(v.issuer),
    issued: monthOrPlaceholder(v.issued),
    ...opt('expires', v.expires.trim() === '' ? undefined : monthOrPlaceholder(v.expires)),
    ...opt('credentialId', v.credentialId.trim() === '' ? undefined : v.credentialId),
    ...opt('credentialUrl', httpsOrUndefined(v.credentialUrl)),
  };
}

export function CertificationForm({
  mode, initial, existing, onSave, onCancel, onReload, onDirtyChange, processImage,
}: {
  mode: 'create' | 'edit';
  initial?: Certification;
  existing: Certification[];
  /** Called with `extras` only when a badge upload is committed with the entry. */
  onSave: (certification: Certification, extras?: SaveExtras) => Promise<void>;
  onCancel: () => void;
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  processImage?: ProcessFn;
}) {
  const [loaded] = useState(() => toValues(initial));
  const [values, setValues] = useState(loaded);
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const commitRef = useLastCommitSha();
  const [idTouched, setIdTouched] = useState(mode === 'edit');
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const { saving, conflict, saveError, run } = useSaveRunner();
  const formRef = useRef<HTMLFormElement>(null);
  useDirtyReport(differs(values, loaded) || upload !== null, onDirtyChange);

  const set = (key: keyof Values, value: string) =>
    setValues((v) => ({ ...v, [key]: value, ...(key === 'name' && !idTouched ? { id: slugify(value) } : {}) }));

  const validate = (): Certification | null => {
    const result = CertificationSchema.safeParse(toRaw(values, upload));
    const fieldErrors: FieldErrors<FieldName> = result.success ? {} : (issuesToFieldErrors(result.error.issues) as FieldErrors<FieldName>);
    for (const f of REQUIRED) if (values[f].trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    if (upload) delete fieldErrors.badge; // built from the id: the name/id errors cover it (Feature 3 step 5a)
    else {
      const typed = checkTypedImageRef(values.badge, initial?.badge);
      if (typed) fieldErrors.badge = typed;
    }
    if (mode === 'create' && !fieldErrors.id) {
      const dup = existing.find((c) => c.id === values.id.trim());
      if (dup) fieldErrors.id = idTaken(dup.name);
    }
    setErrors(fieldErrors);
    if (focusFirstError(formRef, FIELD_ORDER, fieldErrors)) return null;
    return result.success ? result.data : null;
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || conflict) return;
    const cert = validate();
    if (!cert) return;
    const pending = upload;
    void run(async () => {
      if (!pending) return onSave(cert);
      const { path, file } = await finalizeUpload('certifications', cert.id, pending);
      await onSave({ ...cert, badge: path }, { files: [file], attachments: ['image'] });
    });
  };

  const snapshot = useMemo(() => ({ values, upload }), [values, upload]);
  const previewValid = CertificationSchema.safeParse(toRaw(values, upload)).success && (upload !== null || !checkTypedImageRef(values.badge, initial?.badge));
  const preview = (
    <PreviewPane
      snapshot={snapshot}
      valid={previewValid}
      render={({ values: v, upload: up }) => (
        <CertificationCard
          certification={previewCertification(v, up)}
          badge={resolvePreviewImage(up ? undefined : v.badge, { objectUrl: up?.objectUrl, commitRef })}
          now={currentYearMonth()}
        />
      )}
    />
  );

  const input = (name: FieldName, label: string, type = 'text', hint?: string) => (
    <Field name={name} label={label} required={REQUIRED.includes(name)} error={errors[name]} hint={hint}>
      {(c) => (
        <input
          {...c}
          type={type}
          placeholder={type === 'month' ? 'YYYY-MM' : undefined}
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

  return (
    <FormLayout aside={preview}>
      <SaveBanners conflict={conflict} saveError={saveError} onReload={onReload} conflictNotes={upload ? [IMAGE_NOT_UPLOADED] : []} />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {input('name', 'Name')}
        {input('id', 'Id', 'text', mode === 'edit' ? ID_LOCKED_HINT : undefined)}
        {input('issuer', 'Issuer')}
        <div className="grid gap-4 sm:grid-cols-2">
          {input('issued', 'Issued', 'month')}
          {input('expires', 'Expires', 'month')}
        </div>
        {input('credentialId', 'Credential ID')}
        {input('credentialUrl', 'Credential URL', 'url')}
        <ImageField
          name="badge"
          label="Badge"
          kind="badge"
          alt={`${values.name} badge`}
          value={values.badge}
          onValueChange={(v) => set('badge', v)}
          pending={upload}
          onPendingChange={setUpload}
          error={errors.badge}
          process={processImage}
        />
        <FormActions saving={saving} conflict={conflict} onCancel={onCancel} />
      </form>
    </FormLayout>
  );
}
