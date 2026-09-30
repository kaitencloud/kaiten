import type { ReactNode } from 'react';

/**
 * The minimum shape of a MetadataField row that the helpers need. We don't
 * import the SDK type directly to keep this module agnostic of where the
 * fields come from (REST DTO, GraphQL DTO, fixture…). Whoever calls the
 * helpers just needs to project their data into this shape.
 */
export type MetadataFieldDescriptor = {
  id: string;
  key: string;
  label: string;
  jsonSchema: Record<string, unknown>;
  displayOrder: number;
  archivedAt?: string | null;
};

/**
 * Tags the UI shape implied by a json_schema, mapped from the schema's
 * `type` / `enum` / `items` / `format`. Used by all three helpers to switch
 * column renderers, filter widgets and form inputs.
 *
 * Maps to the 6 UI types called out in the epic + this ticket's AC1.
 */
export type MetadataUiType =
  | 'string' // {type:"string"} without enum
  | 'enum' // {type:"string", enum:[...]}
  | 'date' // {type:"string", format:"date"}
  | 'number' // {type:"number"} or {type:"integer"}
  | 'boolean' // {type:"boolean"}
  | 'enum_list' // {type:"array", items:{type:"string", enum:[...]}}
  | 'unsupported'; // shape we don't model (object, array-of-object, …);
// the form renders a read-only raw-JSON view so the value isn't lost.

export type MetadataFormField = {
  id: string;
  key: string;
  label: string;
  uiType: MetadataUiType;
  jsonSchema: Record<string, unknown>;
  /** Pre-extracted options for enum / enum_list. */
  options?: Array<{ label: string; value: string }>;
  /** Surfaced to ajv `required` introspection (`required: [...]` on parent). */
  required?: boolean;
};

/**
 * Result of `useDynamicMetadataForm`. Generic enough that consumers can wire
 * it into their existing form pattern.
 */
export type DynamicFormValue = Record<string, unknown>;
export type DynamicFormErrors = Record<string, string[]>;

export type MetadataFieldRenderer<TItem> = (
  value: unknown,
  row: TItem,
) => ReactNode;
