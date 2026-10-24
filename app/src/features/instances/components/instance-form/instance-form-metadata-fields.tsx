import { Suspense, useMemo } from 'react';
import {
  buildFormFieldsFromSchema,
  DynamicForm,
  type DynamicFormValue,
  type MetadataFieldDescriptor,
  partitionMetadata,
  validateDynamicForm,
} from '@/functionals/metadata-fields';

type InstanceMetadataFieldsProps = {
  form: any;
  metadataFields: MetadataFieldDescriptor[];
};

/**
 * One input per active MetadataField, typed from its JSON Schema.
 *
 * Instance metadata is tolerant: the SaaS auto-reports keys no field declares,
 * and archived fields leave values behind. Neither is editable here, but both
 * are folded back into the form value on every change -- the PUT full-replaces
 * metadata, so a key this form dropped would be a key the instance loses.
 */
export const InstanceMetadataFields = ({
  form,
  metadataFields,
}: InstanceMetadataFieldsProps) => {
  const formFields = useMemo(
    () => buildFormFieldsFromSchema(metadataFields),
    [metadataFields],
  );

  return (
    <Suspense fallback={null}>
      <form.AppField name="metadata">
        {(field: any) => {
          const value = (field.state.value ?? {}) as DynamicFormValue;
          const { knownActive, archivedLeftovers, unknown } = partitionMetadata(
            value,
            metadataFields,
          );
          const preserved = { ...archivedLeftovers, ...unknown };

          return (
            <DynamicForm
              fields={formFields}
              value={knownActive}
              onChange={(next) => field.handleChange({ ...preserved, ...next })}
              // Tolerant, like the resource: unknown keys are legitimate here,
              // so only the declared fields' own schemas are enforced.
              errors={validateDynamicForm(formFields, knownActive, 'tolerant')}
            />
          );
        }}
      </form.AppField>
    </Suspense>
  );
};
