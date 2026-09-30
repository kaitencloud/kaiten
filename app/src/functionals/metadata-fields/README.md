# `functionals/metadata-fields`

Helpers that turn a list of metadata field descriptors (the typed metadata an
organization declares for a resource, each with a JSON Schema) into table
columns, filter fields and form inputs. They are independent of the resource:
the page that uses them passes in an accessor that reads the resource's metadata.
The deployment zone, instance and metadata settings screens use them.

Import from `@/functionals/metadata-fields`. The rules that apply to every
functional are in [functionals.md](../../../docs/01-architecture/functionals.md).

## What it exports

| Export | Role |
| --- | --- |
| `buildColumnsFromSchema(fields, metadataAccessor)` | `ColumnDef[]` for [`table`](../table/README.md), one column per field |
| `buildFiltersFromSchema(fields, metadataAccessor)` | `FilterFieldDefinition[]` for [`filters`](../filters/README.md) |
| `buildFormFieldsFromSchema(fields, required?)` | Plain descriptors of the form fields (`MetadataFormField[]`) |
| `DynamicForm` | Controlled component that renders those descriptors |
| `validateDynamicForm(fields, values, mode?)` | Validates values with ajv and returns errors keyed by field key |
| `useDynamicMetadataForm(fields, initial?, mode?)` | Holds the values and derives the errors, for small forms |
| `renderMetadataValue(field, value)` | Renders one value the way its schema says (boolean as a check, number formatted, enum label, date) |
| `partitionFields`, `partitionMetadata` | Split fields into active and archived, and a resource's metadata into known, archived and unknown keys |
| `inferUiType`, `extractEnumOptions`, `compileSchema`, `composeMetadataSchema`, `ajv` | JSON Schema helpers |

A field descriptor (`MetadataFieldDescriptor`, `types.ts`) is `id`, `key`, `label`,
`jsonSchema`, `displayOrder` and an optional `archivedAt`. The module does not
import the API types: the caller maps its data to this shape.

Every builder produces one entry per descriptor it receives, archived or not. The
caller decides: pass `partitionFields(fields).active` to hide archived fields, and
use `partitionMetadata` to show the values of archived and undeclared keys
separately.

## JSON Schema is the source of truth

The `jsonSchema` of a field is standard
[JSON Schema 2020-12](https://json-schema.org/specification.html): no DSL and no
translation layer. One shared ajv instance (`Ajv2020` with `ajv-formats`, in
`json-schema.ts`) validates it, and `compileSchema` caches compiled schemas by
content.

`inferUiType(schema)` reduces a schema to a UI type:

| JSON Schema | UI type |
| --- | --- |
| `{type: "string"}` | `string` |
| `{type: "string", enum: [...]}` | `enum` |
| `{type: "string", format: "date"}` | `date` |
| `{type: "number"}` or `{type: "integer"}` | `number` |
| `{type: "boolean"}` | `boolean` |
| `{type: "array", items: {type: "string", enum: [...]}}` | `enum_list` |
| any other declared shape (an object, an array of objects, …) | `unsupported` |

A missing or empty schema has no constraint and reads as `string`. The mapping is
also the contract of the form builder: shapes outside the table are deliberately
not editable. `DynamicForm` shows an `unsupported` field as read-only JSON, so the
value is never lost.

`enum_list` fields rely on the `enum_list` field type and the `contains_any` and
`contains_all` operators of [`filters`](../filters/README.md).

## `DynamicForm`

`buildFormFieldsFromSchema` returns data with no JSX; `DynamicForm` renders it.
The component is controlled: the parent owns `value` and receives the next
object through `onChange`, so it works with any form state.

| UI type | Input |
| --- | --- |
| `string` | text `Input` |
| `number` | number `Input` |
| `boolean` | three-way `Select` (not set, yes, no), so an untouched optional field is not sent as `false` |
| `date` | `DatePicker` |
| `enum` | `Select` |
| `enum_list` | `FilterMultiSelect`, reused from `filters` |
| `unsupported` | read-only JSON |

The first entry of a schema's `examples` is the placeholder of text and number
inputs, and its `description` is shown under the field.

```tsx
// app/src/features/deployment-zones/components/deployment-zones/deployment-zone-metadata-fields.tsx (abridged)
const errors = validateDynamicForm(formFields, knownActive, 'strict');

<DynamicForm
  fields={formFields}
  value={knownActive}
  onChange={handleChange}
  errors={errors}
/>;
```

Validation composes the fields into one resource-level schema
(`composeMetadataSchema`) and compiles it. In `'strict'` mode (the default) an
undeclared key is an error (`additionalProperties: false`); in `'tolerant'` mode it
is accepted. A field listed in the `required` argument of
`buildFormFieldsFromSchema` and left empty reports `Required`. Errors are keyed by
field key; in strict mode an undeclared key is reported under its own name
(`errors.<key>`).

### Why it does not use TanStack Form and Zod

The default form convention of the app is TanStack Form with Zod. `DynamicForm`
deviates on purpose: its fields are derived from a JSON Schema at runtime, which
does not map onto static fields and a fixed Zod schema. Validation goes through
ajv against the composed schema.
