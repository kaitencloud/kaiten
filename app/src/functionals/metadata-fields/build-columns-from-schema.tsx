import type { RowData } from '@tanstack/react-table';
import type { ColumnDef } from '@/functionals/table';
import { renderMetadataValue } from './render-metadata-value';
import type { MetadataFieldDescriptor } from './types';

/**
 * Build a TanStack `ColumnDef<T>[]` from a list of metadata field
 * descriptors. The column cell renderer is selected purely from the JSON
 * Schema shape — see `inferUiType`.
 *
 * `metadataAccessor` extracts the resource's metadata jsonb from a row.
 * Returning `undefined`/`null` is fine; the cell will render an em-dash.
 *
 * Archived-field policy: the caller decides. This helper produces one
 * column per descriptor it receives, regardless of `archivedAt`. Pages
 * that should hide archived columns (the default for the admin grid)
 * call `partitionFields(rows).active` first. See `partition.ts`.
 */
export function buildColumnsFromSchema<T extends RowData>(
  fields: MetadataFieldDescriptor[],
  metadataAccessor: (row: T) => Record<string, unknown> | null | undefined,
): ColumnDef<T>[] {
  return fields.map((field) => {
    const baseId = `metadata.${field.key}`;

    const accessorFn = (row: T): unknown => {
      const metadata = metadataAccessor(row);
      return metadata ? metadata[field.key] : undefined;
    };

    return {
      id: baseId,
      header: field.label,
      accessorFn,
      cell: (ctx) => renderMetadataValue(field, ctx.getValue()),
    } satisfies ColumnDef<T>;
  });
}
