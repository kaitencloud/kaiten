import type { FilterFieldDefinition } from '@/functionals/filters';
import { extractEnumOptions, inferUiType } from './json-schema';
import type { MetadataFieldDescriptor, MetadataUiType } from './types';

const FILTER_TYPE_BY_UI: Record<
  MetadataUiType,
  FilterFieldDefinition<unknown>['type']
> = {
  string: 'text',
  enum: 'enum',
  enum_list: 'enum_list', // requires the filters module extension (this same ticket)
  date: 'date',
  number: 'number',
  boolean: 'boolean',
  // Unsupported schemas can't be filtered meaningfully — render as plain
  // text and let the user search the JSON-stringified value if they need
  // to. Hiding the filter entirely is the right call upstream (the page
  // should partition out unsupported descriptors before calling us).
  unsupported: 'text',
};

/**
 * Build a list of `FilterFieldDefinition<T>` from metadata field descriptors.
 * Each descriptor produces one filter field whose `accessor` reads the
 * resource's metadata jsonb via `metadataAccessor`.
 *
 * Archived-field policy: same as `buildColumnsFromSchema` — the caller
 * decides. Filtering by an archived field's column is occasionally useful
 * (locate resources still carrying a legacy value), so passing archived
 * descriptors through is supported. Call `partitionFields(rows).active`
 * upstream if you want to hide them.
 *
 * The filter type is inferred from the JSON Schema 2020-12 shape:
 *  - `{type:"string"}` (no enum) → text contains
 *  - `{type:"string", enum:[…]}` → single-select
 *  - `{type:"array", items:{enum:[…]}}` → multi-select (enum_list)
 *  - `{type:"number"|"integer"}` → range
 *  - `{type:"boolean"}` → true/false
 *  - `{type:"string", format:"date"}` → date
 */
export function buildFiltersFromSchema<T>(
  fields: MetadataFieldDescriptor[],
  metadataAccessor: (row: T) => Record<string, unknown> | null | undefined,
): FilterFieldDefinition<T>[] {
  return fields.map((field) => {
    const uiType = inferUiType(field.jsonSchema);
    const filterType = FILTER_TYPE_BY_UI[uiType];
    const options =
      uiType === 'enum' || uiType === 'enum_list'
        ? extractEnumOptions(field.jsonSchema)
        : undefined;

    return {
      id: `metadata.${field.key}`,
      label: field.label,
      type: filterType,
      accessor: (row: T) => {
        const metadata = metadataAccessor(row);
        return metadata ? metadata[field.key] : undefined;
      },
      options,
      normalFilterable: true,
      advancedFilterable: true,
    } satisfies FilterFieldDefinition<T>;
  });
}
