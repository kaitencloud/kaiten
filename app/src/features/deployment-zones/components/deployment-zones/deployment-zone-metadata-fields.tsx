import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  buildFormFieldsFromSchema,
  DynamicForm,
  partitionMetadata,
  validateDynamicForm,
  type DynamicFormErrors,
  type DynamicFormValue,
  type MetadataFieldDescriptor,
} from '@/functionals/metadata-fields';

export const sanitizeTypedMetadataValue = (
  value: Record<string, unknown> | null | undefined,
  metadataFields: MetadataFieldDescriptor[],
): Record<string, unknown> | undefined => {
  const { knownActive } = partitionMetadata(value, metadataFields);
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(knownActive)) {
    if (val === undefined || val === null || val === '') continue;
    sanitized[key] = val;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

type TypedMetadataFieldProps = {
  metadataFields: MetadataFieldDescriptor[];
  formFields: ReturnType<typeof buildFormFieldsFromSchema>;
  value: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown> | undefined) => void;
};

export function TypedMetadataField({
  metadataFields,
  formFields,
  value,
  onChange,
}: TypedMetadataFieldProps) {
  const { t } = useTranslation();

  const { knownActive, archivedLeftovers, unknown } = useMemo(
    () => partitionMetadata(value, metadataFields),
    [value, metadataFields],
  );
  const extras = useMemo(
    () => ({ ...archivedLeftovers, ...unknown }),
    [archivedLeftovers, unknown],
  );
  // DZ writes are strict (additionalProperties:false on the composed
  // backend schema), so the form mirrors that on the client side to
  // catch invalid values before the round-trip. Required-by-schema
  // checks live inside `validateDynamicForm`.
  const errors: DynamicFormErrors = useMemo(
    () =>
      validateDynamicForm(
        formFields,
        knownActive as DynamicFormValue,
        'strict',
      ),
    [formFields, knownActive],
  );

  const handleChange = (next: DynamicFormValue) => {
    // DZ writes are strict. The active-fields query cannot distinguish
    // archived keys from unknown keys, so the write payload only carries
    // active values; archived values are preserved by the server merge.
    onChange(sanitizeTypedMetadataValue(next, metadataFields));
  };

  return (
    <div className="space-y-3">
      <Label>{t('Features.Releases.Form.metadata')}</Label>
      <DynamicForm
        fields={formFields}
        value={knownActive as DynamicFormValue}
        onChange={handleChange}
        errors={errors}
      />
      {Object.keys(extras).length > 0 ? (
        <div className="rounded-md border border-warning-subtle-foreground/30 bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
          <p className="font-medium">
            {t(
              'Features.Releases.Form.extraMetadataTitle',
              'Extra metadata stored on this zone',
            )}
          </p>
          <p className="mt-1">
            {t(
              'Features.Releases.Form.extraMetadataHint',
              'These keys aren’t covered by an active schema. Unknown keys are omitted from the strict write payload; archived keys are preserved server-side.',
            )}
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-warning-subtle p-2 font-mono text-[11px]">
            {JSON.stringify(extras, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

type RawMetadataFieldProps = {
  featuresError: string | null;
  featuresJson: string;
  onChange: (value: string) => void;
  label: string;
  help: string;
};

export function RawMetadataField({
  featuresError,
  featuresJson,
  onChange,
  label,
  help,
}: RawMetadataFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="features">{label}</Label>
      <textarea
        id="features"
        aria-label={label}
        value={featuresJson}
        onChange={(event) => onChange(event.target.value)}
        placeholder='{"region": "eu-west-1", "cluster": "prod"}'
        className={`flex min-h-[100px] w-full rounded-md border ${
          featuresError ? 'border-destructive' : 'border-input'
        } bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
      />
      {featuresError ? (
        <span className="text-sm text-destructive-subtle-foreground">
          {featuresError}
        </span>
      ) : null}
      <span className="text-xs text-muted-foreground">{help}</span>
    </div>
  );
}
