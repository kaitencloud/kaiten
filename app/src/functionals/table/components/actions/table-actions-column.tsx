import type { RowData } from '@tanstack/react-table';
import i18next from 'i18next';
import type { ReactNode } from 'react';
import type { ColumnDef } from '../../types/data-table.types';

/**
 * Creates a standardized actions column for tables
 * @param renderActions Function that renders the actions component for each row
 * @returns ColumnDef for the actions column
 */
export function createActionsColumn<T extends RowData>(
  renderActions: (item: T) => ReactNode,
): ColumnDef<T> {
  return {
    id: 'actions',
    enableSorting: false,
    header: () => (
      <div className="text-right">
        {i18next.t('Common.actions', { defaultValue: 'Actions' })}
      </div>
    ),
    cell: ({ row }) => renderActions(row.original),
  };
}
