import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { TableLinkedItemsDialog } from '..';
import type { ColumnDef } from '../types/data-table.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }

      if (key === 'Common.tableShowingRecords') {
        const values = (options ?? {}) as {
          end: number;
          start: number;
          total: number;
        };
        return `Showing ${values.start}-${values.end} of ${values.total} records`;
      }

      const translations: Record<string, string> = {
        'Common.firstPage': 'First page',
        'Common.lastPage': 'Last page',
        'Common.next': 'Next',
        'Common.noResults': 'No results',
        'Common.previous': 'Previous',
        'Common.rowsPerPage': 'Rows per page',
      };

      return translations[key] ?? key;
    },
  }),
}));

type TestRow = {
  id: string;
  name: string;
};

const columns: ColumnDef<TestRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
];

const rows: TestRow[] = [
  {
    id: '1',
    name: 'Billing API',
  },
  {
    id: '2',
    name: 'Support CLI',
  },
];

describe('TableLinkedItemsDialog', () => {
  it('opens a dialog and renders a simple table for linked items', async () => {
    const user = userEvent.setup();

    render(
      <TableLinkedItemsDialog
        columns={columns}
        data={rows}
        description="List of related items"
        title="Linked items"
        triggerLabel="2 items"
      />,
    );

    await user.click(screen.getByRole('button', { name: '2 items' }));

    expect(await screen.findByText('Linked items')).toBeInTheDocument();
    expect(screen.getByText('List of related items')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('Billing API')).toBeInTheDocument();
    expect(screen.getByText('Support CLI')).toBeInTheDocument();
    expect(
      screen.queryByText('Showing 1-2 of 2 records'),
    ).not.toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const scrollContainer = dialog.querySelector('[data-slot="dialog-body"]');

    expect(dialog).toHaveClass('max-h-[90vh]', 'flex', 'flex-col', 'overflow-hidden');
    expect(scrollContainer).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  });
});
