import { useEffect, useMemo, useState } from 'react';
import { compileSchema } from '@/functionals/metadata-fields';
import { useAppForm } from '@/hooks/form';
import type {
  DialogMode,
  MetadataFieldSubmitPayload,
} from './metadata-field-helpers';
import {
  computeMetadataFieldFormWarnings,
  createMetadataFieldFormValidationSchema,
  hasMetadataFieldFormErrors,
  validateMetadataFieldForm,
} from './schemas';
import {
  createMetadataFieldFormState,
  metadataFieldFormStateToValues,
  metadataFieldFormValuesToJsonSchema,
  normalizeMetadataFieldFormValues,
} from './schemas/metadata-fields.schema';
import type {
  MetadataFieldFormState,
  MetadataFieldFormValues,
  MetadataResourceType,
  MetadataSettingsField,
} from './types';

type UseMetadataFieldFormArgs = {
  fields: MetadataSettingsField[];
  initialField?: MetadataSettingsField;
  initialValues: MetadataFieldFormValues;
  isSubmitting: boolean;
  mode: DialogMode;
  onSubmit: (payload: MetadataFieldSubmitPayload) => Promise<void> | void;
  open: boolean;
  resourceType: MetadataResourceType;
};

type MetadataFieldValidationOptions = {
  editingFieldId?: string;
  fields: MetadataSettingsField[];
  resourceType: MetadataResourceType;
};

const serializeSchema = (values: MetadataFieldFormValues) =>
  JSON.stringify(metadataFieldFormValuesToJsonSchema(values), null, 2);

function getMetadataFieldValidationState(
  state: MetadataFieldFormState,
  options: MetadataFieldValidationOptions,
) {
  const values = metadataFieldFormStateToValues(state);
  const errors = validateMetadataFieldForm(values, {
    ...options,
    rawMode: state.rawMode,
  });
  const warnings = computeMetadataFieldFormWarnings(values, options);

  return {
    errors,
    hasErrors: hasMetadataFieldFormErrors(errors),
    showEnumOptions:
      values.primaryType === 'ENUM' || values.primaryType === 'ENUM_LIST',
    values,
    warnings,
  };
}

function parseRawSchemaText(
  rawSchemaText: string,
  setRawError: (message: string | null) => void,
): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSchemaText);
  } catch (error) {
    setRawError(
      error instanceof Error
        ? `Invalid JSON: ${error.message}`
        : 'Invalid JSON.',
    );
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    setRawError('JSON Schema must be an object.');
    return null;
  }
  try {
    compileSchema(parsed as Record<string, unknown>);
  } catch (error) {
    setRawError(
      error instanceof Error
        ? `Invalid JSON Schema: ${error.message}`
        : 'Invalid JSON Schema.',
    );
    return null;
  }
  setRawError(null);
  return parsed as Record<string, unknown>;
}

async function submitMetadataFieldForm({
  onSubmit,
  rawSchemaText,
  setRawError,
  state,
  validationOptions,
}: {
  onSubmit: (payload: MetadataFieldSubmitPayload) => Promise<void> | void;
  rawSchemaText: string;
  setRawError: (message: string | null) => void;
  state: MetadataFieldFormState;
  validationOptions: MetadataFieldValidationOptions;
}) {
  const values = normalizeMetadataFieldFormValues(
    metadataFieldFormStateToValues(state),
  );
  const errors = validateMetadataFieldForm(values, {
    ...validationOptions,
    rawMode: state.rawMode,
  });
  if (hasMetadataFieldFormErrors(errors)) return;

  const jsonSchema = state.rawMode
    ? parseRawSchemaText(rawSchemaText, setRawError)
    : metadataFieldFormValuesToJsonSchema(values);
  if (!jsonSchema) return;

  await Promise.resolve(onSubmit({ jsonSchema, values })).catch(
    () => undefined,
  );
}

export function useMetadataFieldForm({
  fields,
  initialField,
  initialValues,
  isSubmitting,
  mode,
  onSubmit,
  open,
  resourceType,
}: UseMetadataFieldFormArgs) {
  const isEditing = mode === 'edit';
  const validationOptions = useMemo(
    () => ({
      editingFieldId: initialField?.id,
      fields,
      resourceType,
    }),
    [fields, initialField?.id, resourceType],
  );
  const validationSchema =
    createMetadataFieldFormValidationSchema(validationOptions);
  const [showRaw, setShowRaw] = useState(false);
  const [rawSchemaText, setRawSchemaText] = useState(() =>
    serializeSchema(initialValues),
  );
  const [rawError, setRawError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: createMetadataFieldFormState(initialValues),
    validators: {
      onChange: validationSchema,
      onSubmit: validationSchema,
    },
    onSubmit: async ({ value }) => {
      if (isSubmitting) return;
      await submitMetadataFieldForm({
        onSubmit,
        rawSchemaText,
        setRawError,
        state: value,
        validationOptions,
      });
    },
  });

  // What marks a fresh opening: `initialValues` is memoised upstream on the
  // dialog state, so its identity moves exactly when the dialog opens, or when
  // it is re-pointed at another field while already open. Adjusting the state
  // here during render, rather than from the effect below, keeps the reset in
  // the same pass instead of paying for a second one.
  const resetToken = open ? initialValues : null;
  const [prevResetToken, setPrevResetToken] = useState(resetToken);
  if (resetToken !== prevResetToken) {
    setPrevResetToken(resetToken);
    if (open) {
      setShowRaw(false);
      setRawError(null);
      setRawSchemaText(serializeSchema(initialValues));
    }
  }

  // `form` is an external store, so resetting it stays in an effect.
  useEffect(() => {
    if (!open) return;
    form.reset(createMetadataFieldFormState(initialValues));
  }, [form, initialField?.id, initialValues, mode, open]);

  function updateRawSchemaText(text: string) {
    setRawSchemaText(text);
    setRawError(null);
  }

  function toggleRaw() {
    const nextShowRaw = !showRaw;
    if (nextShowRaw) {
      setRawSchemaText(
        serializeSchema(metadataFieldFormStateToValues(form.state.values)),
      );
    }
    setShowRaw(nextShowRaw);
    form.setFieldValue('rawMode', nextShowRaw);
    setRawError(null);
  }

  return {
    form,
    getValidationState: (state: MetadataFieldFormState) =>
      getMetadataFieldValidationState(state, validationOptions),
    keyDisabled: isEditing,
    rawError,
    rawSchemaText,
    showRaw,
    toggleRaw,
    updateRawSchemaText,
  };
}
