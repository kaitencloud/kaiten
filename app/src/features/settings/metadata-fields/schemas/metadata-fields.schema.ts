import { z } from 'zod';
import { extractEnumOptions, inferUiType } from '@/functionals/metadata-fields';
import type {
  MetadataResourceType,
  MetadataSettingsField,
} from '@/domains/metadata-fields';

// Zod is the source of truth for the metadata-field form (app convention:
// validate with Zod, derive the value types via `z.infer`). The primary-type
// enum doubles as the runtime option list rendered in the form. The resource
// type is owned by `@/domains/metadata-fields` (single source of truth).
export const metadataPrimaryTypes = [
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'ENUM',
  'ENUM_LIST',
  'DATE',
] as const;
export const metadataPrimaryTypeSchema = z.enum(metadataPrimaryTypes);
export type MetadataPrimaryType = z.infer<typeof metadataPrimaryTypeSchema>;

// A field key becomes a JSON metadata property name *and* a filter/column id
// across the app, so it must be a clean identifier: start with a letter, then
// letters/digits/underscores only. This notably rejects spaces — the backend
// only enforces required + length, so this format guard lives on the client.
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Shape + field-level rules for the create/edit/duplicate form. Cross-field and
 * context-dependent rules (native-key collision, active-key uniqueness, enum
 * options presence) need the field list / resource type, so they live in the
 * `.superRefine` built by `validateMetadataFieldForm`.
 */
export const metadataFieldFormValuesSchema = z.object({
  description: z.string(),
  enumOptionsText: z.string(),
  key: z
    .string()
    .trim()
    .min(1, 'Key is required.')
    .regex(
      KEY_PATTERN,
      'Use letters, numbers and underscores only (no spaces), starting with a letter.',
    ),
  label: z.string().trim().min(1, 'Label is required.'),
  primaryType: metadataPrimaryTypeSchema,
});

export type MetadataFieldFormValues = z.infer<
  typeof metadataFieldFormValuesSchema
>;

export const metadataFieldFormStateSchema =
  metadataFieldFormValuesSchema.extend({
    rawMode: z.boolean(),
  });

export type MetadataFieldFormState = z.infer<
  typeof metadataFieldFormStateSchema
>;

export const createMetadataFieldFormState = (
  values: MetadataFieldFormValues,
): MetadataFieldFormState => ({
  ...values,
  rawMode: false,
});

export const metadataFieldFormStateToValues = ({
  rawMode: _rawMode,
  ...values
}: MetadataFieldFormState): MetadataFieldFormValues => values;

export const normalizeMetadataFieldFormValues = (
  values: MetadataFieldFormValues,
): MetadataFieldFormValues => ({
  ...values,
  key: values.key.trim(),
  label: values.label.trim(),
});

/**
 * Resource columns that the admin must *not* shadow with a metadata key —
 * doing so would collide with the column's accessor in the dynamic tables
 * and produce confusing results (e.g. a metadata `name` overwrites the row
 * label in `buildColumnsFromSchema`).
 *
 * NOTE — keep in sync with the corresponding Go DTOs:
 *   - `api/internal/modules/deploymentzones/schema/schema.go`
 *   - `api/internal/modules/instances/schema/schema.go`
 *
 * A snapshot test in `__tests__/metadata-fields.schema.test.ts` pins the
 * lists so adding a column on the backend without updating here is loud.
 */
const commonNativeKeys = [
  'id',
  'name',
  'slug',
  'description',
  'metadata',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
];

const resourceNativeKeys: Record<MetadataResourceType, string[]> = {
  DEPLOYMENT_ZONE: ['type', 'releaseId'],
  INSTANCE: [
    'customerId',
    'customerSlug',
    'licenseId',
    'licenseSlug',
    'deploymentZoneId',
    'startLicenseDate',
    'endLicenseDate',
    'platform',
  ],
};

/**
 * Map a UI type (the lowercase token returned by `inferUiType`) to the
 * `MetadataPrimaryType` exposed on the admin form. Exported so the page
 * component reuses the same lookup table instead of duplicating it with a
 * `.toUpperCase()` heuristic that would drift the day we add an alias.
 */
export const primaryTypeByUiType: Record<string, MetadataPrimaryType | null> = {
  boolean: 'BOOLEAN',
  date: 'DATE',
  enum: 'ENUM',
  enum_list: 'ENUM_LIST',
  number: 'NUMBER',
  string: 'STRING',
  unsupported: null,
};

/**
 * Parse the textarea content into a deduplicated list of enum values.
 *
 * Splitting on newlines is the documented contract — an option per line.
 * Whitespace is trimmed; blank lines are skipped; duplicates collapse on
 * the first occurrence. Commas are intentionally *not* a separator because
 * enum values are allowed to contain them (e.g. `"Acme, Inc."`).
 */
export const parseEnumOptions = (enumOptionsText: string): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const line of enumOptionsText.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
};

export const createMetadataFieldFormValues = (): MetadataFieldFormValues => ({
  description: '',
  enumOptionsText: '',
  key: '',
  label: '',
  primaryType: 'STRING',
});

export const metadataFieldFormValuesFromField = (
  field: MetadataSettingsField,
): MetadataFieldFormValues => {
  const uiType = inferUiType(field.jsonSchema);
  const primaryType = primaryTypeByUiType[uiType] ?? 'STRING';
  const description =
    typeof field.jsonSchema.description === 'string'
      ? field.jsonSchema.description
      : '';

  return {
    description,
    enumOptionsText: extractEnumOptions(field.jsonSchema)
      .map((option) => option.value)
      .join('\n'),
    key: field.key,
    label: field.label,
    primaryType,
  };
};

export const metadataPrimaryTypeToJsonSchema = (
  primaryType: MetadataPrimaryType,
  enumOptionsText = '',
  description = '',
): Record<string, unknown> => {
  const enumOptions = parseEnumOptions(enumOptionsText);
  const schema: Record<string, unknown> =
    primaryType === 'STRING'
      ? { type: 'string' }
      : primaryType === 'NUMBER'
        ? { type: 'number' }
        : primaryType === 'BOOLEAN'
          ? { type: 'boolean' }
          : primaryType === 'DATE'
            ? { type: 'string', format: 'date' }
            : primaryType === 'ENUM'
              ? { type: 'string', enum: enumOptions }
              : {
                  type: 'array',
                  items: { type: 'string', enum: enumOptions },
                  uniqueItems: true,
                };

  const trimmedDescription = description.trim();
  if (trimmedDescription) {
    schema.description = trimmedDescription;
  }

  return schema;
};

export const metadataFieldFormValuesToJsonSchema = (
  values: MetadataFieldFormValues,
): Record<string, unknown> =>
  metadataPrimaryTypeToJsonSchema(
    values.primaryType,
    values.enumOptionsText,
    values.description,
  );

export { commonNativeKeys, resourceNativeKeys };
