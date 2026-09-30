import type { MetadataFieldDescriptor } from './types';

/**
 * Split a list of MetadataField descriptors into active and archived
 * subsets. Every consumer of `buildColumnsFromSchema` /
 * `buildFiltersFromSchema` / `buildFormFieldsFromSchema` has to decide
 * which of the two it wants — sometimes both, sometimes only the active
 * ones (CRUD admin grid), sometimes only the archived ones (legacy-values
 * surface). Centralising the partition keeps the convention explicit.
 *
 * Order within each subset is preserved.
 */
export type PartitionedFields = {
  active: MetadataFieldDescriptor[];
  archived: MetadataFieldDescriptor[];
};

export const partitionFields = (
  fields: MetadataFieldDescriptor[],
): PartitionedFields => {
  const active: MetadataFieldDescriptor[] = [];
  const archived: MetadataFieldDescriptor[] = [];
  for (const field of fields) {
    if (field.archivedAt) archived.push(field);
    else active.push(field);
  }
  return { active, archived };
};

/**
 * Split a resource's metadata payload into three buckets relative to a
 * known schema:
 *
 *  - `knownActive`  — keys declared and currently active. The "real" form
 *                     values, validated against the JSON Schema.
 *  - `archivedLeftovers` — keys declared but archived. Survives writes
 *                     thanks to the server-side merge; the admin UI
 *                     typically renders them in a read-only "legacy" panel.
 *  - `unknown`     — keys not declared at all. On strict resources (DZ)
 *                     this would be a server-side 422; on tolerant ones
 *                     (Instance) it's free-form jsonb.
 *
 * Useful for the form/page split: pass `knownActive` to `<DynamicForm>` and
 * render `archivedLeftovers` separately. Centralising the bucket logic
 * means consumers can't accidentally drop keys by misclassifying them.
 */
export type PartitionedMetadata = {
  knownActive: Record<string, unknown>;
  archivedLeftovers: Record<string, unknown>;
  unknown: Record<string, unknown>;
};

export const partitionMetadata = (
  metadata: Record<string, unknown> | null | undefined,
  fields: MetadataFieldDescriptor[],
): PartitionedMetadata => {
  const result: PartitionedMetadata = {
    knownActive: {},
    archivedLeftovers: {},
    unknown: {},
  };
  if (!metadata) return result;

  const activeKeys = new Set<string>();
  const archivedKeys = new Set<string>();
  for (const field of fields) {
    if (field.archivedAt) archivedKeys.add(field.key);
    else activeKeys.add(field.key);
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (activeKeys.has(key)) {
      result.knownActive[key] = value;
    } else if (archivedKeys.has(key)) {
      result.archivedLeftovers[key] = value;
    } else {
      result.unknown[key] = value;
    }
  }
  return result;
};
