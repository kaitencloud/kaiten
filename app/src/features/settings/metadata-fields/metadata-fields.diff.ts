import { sortMetadataFields } from '@/domains/metadata-fields';
import type { MetadataSettingsField } from '@/domains/metadata-fields';

// Re-exported so the feature's public surface (`./schemas`) keeps offering
// `sortMetadataFields` while the single implementation lives in the domain.
export { sortMetadataFields };

/**
 * Schema keys that are purely informational and don't change what's accepted
 * by the JSON Schema validator. Used to detect "cosmetic-only" edits so we can
 * skip the (potentially expensive) dry-run that walks every resource in the
 * org.
 */
const cosmeticSchemaKeys = new Set([
  'description',
  'examples',
  'title',
  'default',
  '$comment',
]);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const stripCosmeticKeys = (schema: Record<string, unknown>): unknown => {
  if (Array.isArray(schema)) {
    return schema.map((entry) =>
      entry && typeof entry === 'object'
        ? stripCosmeticKeys(entry as Record<string, unknown>)
        : entry,
    );
  }
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (cosmeticSchemaKeys.has(key)) continue;
    stripped[key] =
      value && typeof value === 'object'
        ? stripCosmeticKeys(value as Record<string, unknown>)
        : value;
  }
  return stripped;
};

export const hasJsonSchemaChanged = (
  field: MetadataSettingsField,
  nextJsonSchema: Record<string, unknown>,
): boolean =>
  stableStringify(field.jsonSchema) !== stableStringify(nextJsonSchema);

/**
 * Same as `hasJsonSchemaChanged` but ignores schema keys that don't influence
 * what a JSON Schema validator accepts (`description`, `examples`, `title`, …).
 * Used by the page to skip the dry-run fetch when the admin only renamed a
 * label or polished a description.
 */
export const hasStructuralJsonSchemaChanged = (
  field: MetadataSettingsField,
  nextJsonSchema: Record<string, unknown>,
): boolean =>
  stableStringify(stripCosmeticKeys(field.jsonSchema)) !==
  stableStringify(stripCosmeticKeys(nextJsonSchema));

export const getNextDisplayOrder = (
  activeFields: MetadataSettingsField[],
): number =>
  activeFields.length === 0
    ? 0
    : Math.max(...activeFields.map((field) => field.displayOrder)) + 1;

export const getVisibleMetadataFields = (
  fields: MetadataSettingsField[],
  showArchived: boolean,
): MetadataSettingsField[] => {
  const sortedFields = sortMetadataFields(fields);
  const active = sortedFields.filter((field) => !field.archivedAt);
  const archived = sortedFields.filter((field) => field.archivedAt);
  return showArchived ? [...active, ...archived] : active;
};

export const getReorderedActiveFieldIds = (
  activeFields: MetadataSettingsField[],
  activeId: string,
  overId: string,
): string[] | null => {
  const sortedFields = sortMetadataFields(activeFields);
  const oldIndex = sortedFields.findIndex((field) => field.id === activeId);
  const newIndex = sortedFields.findIndex((field) => field.id === overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null;
  }

  const nextFields = [...sortedFields];
  const [movedField] = nextFields.splice(oldIndex, 1);
  nextFields.splice(newIndex, 0, movedField);

  return nextFields.map((field) => field.id);
};
