import { extractEnumOptions, inferUiType } from './json-schema';
import type { MetadataFieldDescriptor, MetadataFormField } from './types';

/**
 * Build the descriptive config consumed by `<DynamicForm>`.
 *
 * The output is a pure data structure (no JSX) so it can be:
 *  - introspected by tests (assertions on `uiType`, `options`, etc.),
 *  - persisted / serialized if needed,
 *  - rendered by something other than `<DynamicForm>` (a Storybook story, a
 *    print preview, …) without coupling the helper to a renderer.
 *
 * Archived-field policy: for edit forms you almost always want
 * `partitionFields(rows).active` here — an archived field shouldn't
 * generate an editable input. Use `partitionMetadata(value, rows)` to
 * pull the `archivedLeftovers` out and render them as a read-only
 * "legacy values" panel next to the form.
 */
export function buildFormFieldsFromSchema(
  fields: MetadataFieldDescriptor[],
  /** Optional parent-level required list (the resource schema's "required").
   * If a field's key is in here, the form will surface a required-error. */
  required: string[] = [],
): MetadataFormField[] {
  const requiredSet = new Set(required);
  return fields.map((field) => {
    const uiType = inferUiType(field.jsonSchema);
    const options =
      uiType === 'enum' || uiType === 'enum_list'
        ? extractEnumOptions(field.jsonSchema)
        : undefined;
    return {
      id: field.id,
      key: field.key,
      label: field.label,
      uiType,
      jsonSchema: field.jsonSchema,
      options,
      required: requiredSet.has(field.key),
    } satisfies MetadataFormField;
  });
}
