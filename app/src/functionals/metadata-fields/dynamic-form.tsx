import { useCallback, useMemo, useState } from 'react';
import { DynamicFormField } from './dynamic-form-field';
import { compileSchema, composeMetadataSchema } from './json-schema';
import type { ComposedSchemaMode } from './json-schema';
import type {
  DynamicFormErrors,
  DynamicFormValue,
  MetadataFormField,
} from './types';

export type DynamicFormProps = {
  fields: MetadataFormField[];
  value: DynamicFormValue;
  onChange: (next: DynamicFormValue) => void;
  /**
   * Errors keyed by field key. Computed by the consumer (so the same form
   * can be wired into TanStack Form / Hook Form / standalone validation),
   * or via the exposed `validate(values, fields)` helper for callers that
   * want a simple ajv-driven validation.
   */
  errors?: DynamicFormErrors;
};

/**
 * Data-driven renderer that takes the descriptive fields built by
 * `buildFormFieldsFromSchema` and produces the right input per UI type.
 *
 * Intentionally controlled: parent owns `value`. This makes the component
 * trivially testable and lets a caller wire it into whatever form
 * library the page already uses (TanStack Form is the current default).
 */
export function DynamicForm({
  fields,
  value,
  onChange,
  errors,
}: DynamicFormProps) {
  const update = useCallback(
    (key: string, next: unknown) => {
      onChange({ ...value, [key]: next });
    },
    [value, onChange],
  );

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <DynamicFormField
          key={field.id}
          field={field}
          value={value[field.key]}
          errors={errors?.[field.key]}
          onChange={(next) => update(field.key, next)}
        />
      ))}
    </div>
  );
}

/**
 * Validate a values object against the composed resource schema (mirrors the
 * backend's `validator.BuildResourceSchema` + `ValidateMetadata`).
 *
 * Behavioral notes:
 *  - Strict mode rejects extra/unknown keys (`additionalProperties: false`),
 *    matching the backend's DZ contract.
 *  - Required-but-missing fields are reported as `'Required'` to keep the UX
 *    string short instead of bubbling ajv's `must have required property…`.
 *  - Optional + undefined/empty fields are stripped before ajv runs so they
 *    don't trigger type errors.
 *  - Ajv errors are mapped to per-field arrays via their `instancePath`
 *    (`/region`) — extra keys fall under `__root__` so callers can surface
 *    them as a form-level error.
 */
export function validateDynamicForm(
  fields: MetadataFormField[],
  values: DynamicFormValue,
  mode: ComposedSchemaMode = 'strict',
): DynamicFormErrors {
  const errors: DynamicFormErrors = {};

  // Required check is done explicitly so we can return a friendlier label
  // than ajv's default "must have required property X".
  const requiredKeys = fields.flatMap((f) => (f.required ? [f.key] : []));
  for (const key of requiredKeys) {
    const v = values[key];
    if (v === undefined || v === '') {
      errors[key] = ['Required'];
    }
  }

  // Drop optional+empty values before composing; we don't want ajv to flag
  // `undefined` for a field that the user simply hasn't filled.
  const sanitized: DynamicFormValue = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    sanitized[key] = value;
  }

  const composed = composeMetadataSchema(fields, mode, requiredKeys);
  const validate = compileSchema(composed);

  if (!validate(sanitized)) {
    for (const err of validate.errors ?? []) {
      // We've already reported missing-required fields with a friendly
      // "Required" label above — skip ajv's verbose version.
      if (err.keyword === 'required') continue;

      const path = err.instancePath || '';
      // ajv reports unknown-key errors as instancePath="" with keyword
      // "additionalProperties" and params.additionalProperty=<key>.
      const extra = (err.params as { additionalProperty?: string } | undefined)
        ?.additionalProperty;
      const bucket = extra ?? (path.replace(/^\//, '') || '__root__');
      if (errors[bucket]?.includes('Required')) continue; // don't dilute the friendly label
      errors[bucket] = errors[bucket] ?? [];
      errors[bucket].push(err.message ?? 'invalid');
    }
  }

  return errors;
}

/**
 * Convenience hook that holds form state + computes errors on every change.
 * Lightweight wrapper for tests and small forms; pages with complex flows
 * can call `validateDynamicForm` directly from their own state.
 */
export function useDynamicMetadataForm(
  fields: MetadataFormField[],
  initial: DynamicFormValue = {},
  mode: ComposedSchemaMode = 'strict',
) {
  const [values, setValues] = useState<DynamicFormValue>(initial);
  const errors = useMemo(
    () => validateDynamicForm(fields, values, mode),
    [fields, values, mode],
  );
  return { values, setValues, errors };
}
