import { type SubmitEvent, useMemo } from 'react';
import { CertificationSchema, type Certification } from '../../content/schema';
import { CertificationCard } from '../../components/CertificationCard';
import { currentYearMonth } from '../../lib/dates';
import { emptyToUndefined, issuesToFieldErrors } from '../lib/formUtils';
import type { PendingUpload } from '../lib/imageProcessing';
import { httpsOrUndefined, monthOrPlaceholder, opt, orPlaceholder } from '../previewValues';
import {
  Field, FormActions, FormLayout, IdField, REQUIRED_MESSAGE, SaveBanners, duplicateIdError, imageRef, isSavable, useAutoId, useEntryForm,
  useImageUpload, type Checked, type FieldErrors, type SaveExtras,
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
    badge: imageRef('certifications', v.badge, v.id.trim(), upload),
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
  const image = useImageUpload('certifications', initial?.badge);
  const { upload } = image;
  const form = useEntryForm({
    initialValues: () => toValues(initial),
    order: FIELD_ORDER,
    extraDirty: upload !== null,
    busy: image.busy,
    onDirtyChange,
  });
  const { values, errors, saving, conflict, saveError, formError, formRef } = form;
  const autoId = useAutoId<Values>(mode === 'edit', ['name'], (v) => v.name);
  const set = (key: keyof Values, value: string) => form.set(key, value, autoId.derive);

  /** One check for Save and the preview (review S1). */
  const check = (): Checked<FieldName, Certification> => {
    const result = CertificationSchema.safeParse(toRaw(values, upload));
    const fieldErrors: FieldErrors<FieldName> = result.success ? {} : (issuesToFieldErrors(result.error.issues) as FieldErrors<FieldName>);
    for (const f of REQUIRED) if (values[f].trim() === '') fieldErrors[f] = REQUIRED_MESSAGE;
    image.checkErrors(fieldErrors, 'badge', values.badge);
    if (mode === 'create' && !fieldErrors.id) {
      const dup = duplicateIdError(existing, values.id.trim(), (c) => c.name);
      if (dup) fieldErrors.id = dup;
    }
    return { errors: fieldErrors, data: result.success ? result.data : null };
  };
  const checked = check();

  const submit = (e: SubmitEvent<HTMLFormElement>) =>
    form.submit(e, check, async (cert) => {
      const file = await image.finalize(cert.id);
      if (!file) return onSave(cert);
      await onSave({ ...cert, badge: file.path }, { files: [file.file], attachments: ['image'] });
    });

  const snapshot = useMemo(() => ({ values, upload }), [values, upload]);
  const previewValid = isSavable(checked);
  const preview = (
    <PreviewPane
      snapshot={snapshot}
      valid={previewValid}
      render={({ values: v, upload: up }) => (
        <CertificationCard
          certification={previewCertification(v, up)}
          badge={image.previewImage(v.badge, up)}
          now={currentYearMonth()}
        />
      )}
    />
  );

  const input = (name: Exclude<FieldName, 'id' | 'badge'>, label: string, type = 'text', hint?: string) => (
    <Field name={name} label={label} required={REQUIRED.includes(name)} error={errors[name]} hint={hint}>
      {(c) => (
        <input
          {...c}
          type={type}
          placeholder={type === 'month' ? 'YYYY-MM' : undefined}
          value={values[name]}
          onChange={(e) => set(name, e.target.value)}
        />
      )}
    </Field>
  );

  return (
    <FormLayout aside={preview}>
      <SaveBanners conflict={conflict} saveError={saveError} formError={formError} onReload={onReload} conflictNotes={image.conflictNotes} />
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {input('name', 'Name')}
        <IdField
          mode={mode}
          value={values.id}
          error={errors.id}
          onChange={(v) => {
            autoId.touch();
            set('id', v);
          }}
        />
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
          {...image.fieldProps}
          error={errors.badge}
          process={processImage}
        />
        <FormActions saving={saving} conflict={conflict} busy={image.busy} onCancel={onCancel} />
      </form>
    </FormLayout>
  );
}
