import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  DataTable,
  DataTableRowExpander,
  DataTableSortHeader,
  TableJsonDialog,
} from '..';
import type { ColumnDef } from '../types/data-table.types';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  // Records where it leads instead of navigating.
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        event.preventDefault();
        mockNavigate({ to });
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }

      const opts =
        typeof options === 'object' && options !== null
          ? (options as { column?: string })
          : {};

      if (key === 'Common.tableSortAriaAsc') {
        return `Sorted ascending: ${opts.column ?? ''}`;
      }

      if (key === 'Common.tableSortAriaDesc') {
        return `Sorted descending: ${opts.column ?? ''}`;
      }

      if (key === 'Common.tableSortAriaNone') {
        return `Not sorted, click to sort: ${opts.column ?? ''}`;
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
  isNavigable: boolean;
  name: string;
};

const columns: ColumnDef<TestRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
];

const rows: TestRow[] = Array.from({ length: 12 }, (_, index) => ({
  id: `${index + 1}`,
  isNavigable: index !== 1,
  name: `Row ${index + 1}`,
}));

const shortRows: TestRow[] = Array.from({ length: 4 }, (_, index) => ({
  id: `${index + 1}`,
  isNavigable: true,
  name: `Short Row ${index + 1}`,
}));

const sortRows: TestRow[] = [
  { id: '1', isNavigable: true, name: 'Zebra' },
  { id: '2', isNavigable: true, name: 'Alpha' },
  { id: '3', isNavigable: true, name: 'Mike' },
];

const sortColumns: ColumnDef<TestRow>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableSortHeader column={column}>Name</DataTableSortHeader>
    ),
  },
];

type MetadataRow = {
  id: string;
  metadata: Record<string, unknown>;
  name: string;
};

const metadataColumns: ColumnDef<MetadataRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    id: 'metadata',
    header: 'Metadata',
    cell: ({ row }) => (
      <TableJsonDialog
        title="Instance metadata"
        triggerAriaLabel="Open instance metadata"
        value={row.original.metadata}
      />
    ),
  },
];

const metadataRows: MetadataRow[] = [
  { id: '1', metadata: { tier: 'gold' }, name: 'Foot Clan Tracking' },
];

describe('DataTable', () => {
  it('keeps default variant styles and pagination enabled by default', () => {
    const { container } = render(
      <DataTable<TestRow> columns={columns} data={rows} />,
    );

    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass('rounded-xl', 'border', 'bg-background');
    expect(screen.getByText('Showing 1-10 of 12 records')).toBeInTheDocument();
    // The page size selector is on by default: the reader picks the density.
    expect(screen.getByText('Rows per page')).toBeInTheDocument();
  });

  it('shows rows per page selector when explicitly enabled', () => {
    render(
      <DataTable<TestRow>
        columns={columns}
        data={rows}
        pagination={{ showPageSizeSelector: true }}
      />,
    );

    expect(screen.getByText('Rows per page')).toBeInTheDocument();
  });

  it('hides pagination when all rows fit in a single page', () => {
    render(<DataTable<TestRow> columns={columns} data={shortRows} />);

    expect(
      screen.queryByText('Showing 1-4 of 4 records'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument();
  });

  it('applies tableClassName to the table element', () => {
    const { container } = render(
      <DataTable<TestRow>
        columns={columns}
        data={rows}
        tableClassName="table-fixed"
      />,
    );

    const table = container.querySelector('[data-slot="table"]');

    expect(table).toHaveClass('table-fixed');
  });

  it('applies simple variant styles', () => {
    const { container } = render(
      <DataTable<TestRow> columns={columns} data={rows} variant="simple" />,
    );

    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass('bg-transparent', 'border-0', 'rounded-none');
    expect(root).not.toHaveClass('rounded-xl');
  });

  it('disables pagination when pagination is false', () => {
    render(
      <DataTable<TestRow> columns={columns} data={rows} pagination={false} />,
    );

    expect(screen.queryByText('Rows per page')).not.toBeInTheDocument();
  });

  it('renders a custom empty message when emptyMessage is provided', () => {
    render(
      <DataTable<TestRow>
        columns={columns}
        data={[]}
        emptyMessage="Nothing here"
      />,
    );

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('applies header and cell classes from column meta', () => {
    const columnsWithMeta: ColumnDef<TestRow>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        meta: {
          cellClassName: 'cell-meta-class',
          headerClassName: 'header-meta-class',
        },
      },
    ];

    render(<DataTable<TestRow> columns={columnsWithMeta} data={rows} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveClass(
      'header-meta-class',
    );

    expect(screen.getByText('Row 1').closest('td')).toHaveClass(
      'cell-meta-class',
    );
  });

  it('applies row classes from getRowClassName', () => {
    render(
      <DataTable<TestRow>
        columns={columns}
        data={rows}
        getRowClassName={(row) =>
          row.id === '1'
            ? 'bg-destructive-subtle text-destructive-subtle-foreground'
            : undefined
        }
      />,
    );

    expect(screen.getByText('Row 1').closest('tr')).toHaveClass(
      'bg-destructive-subtle',
      'text-destructive-subtle-foreground',
    );
    expect(screen.getByText('Row 2').closest('tr')).not.toHaveClass(
      'bg-destructive-subtle',
    );
  });

  it('applies a scrollable body with sticky header when bodyScrollable is enabled and parent sets a fixed height', () => {
    const { container } = render(
      <DataTable<TestRow>
        className="h-[320px]"
        columns={columns}
        data={rows}
        bodyScrollable
      />,
    );

    const tableContainer = container.querySelector(
      '[data-slot="table-container"]',
    );
    const root = container.firstElementChild as HTMLElement;
    const headerCell = screen.getByRole('columnheader', { name: 'Name' });

    expect(tableContainer).toHaveClass('overflow-y-auto');
    expect(tableContainer).toHaveClass('h-full');
    expect(root).toHaveClass('h-[320px]');
    expect(headerCell).toHaveClass('sticky', 'top-0');
  });

  it('enables keyboard row navigation only when explicitly enabled', () => {
    const onClickRow = vi.fn();

    render(
      <DataTable<TestRow>
        columns={columns}
        data={rows}
        onClickRow={onClickRow}
        isRowClickable={(row) => row.isNavigable}
        enableRowKeyboardNavigation
      />,
    );

    const navigableRow = screen.getByText('Row 1').closest('tr');
    const nonNavigableRow = screen.getByText('Row 2').closest('tr');

    expect(navigableRow).toHaveAttribute('role', 'button');
    expect(navigableRow).toHaveAttribute('tabindex', '0');
    expect(nonNavigableRow).not.toHaveAttribute('role', 'button');

    if (!navigableRow || !nonNavigableRow) {
      throw new Error('Expected data rows were not rendered');
    }

    fireEvent.keyDown(navigableRow, { key: 'Enter' });
    fireEvent.keyDown(navigableRow, { key: ' ' });
    fireEvent.keyDown(nonNavigableRow, { key: 'Enter' });

    expect(onClickRow).toHaveBeenCalledTimes(2);
  });

  it('does not bind keyboard navigation when enableRowKeyboardNavigation is false', () => {
    const onClickRow = vi.fn();

    render(
      <DataTable<TestRow>
        columns={columns}
        data={rows}
        onClickRow={onClickRow}
      />,
    );

    const row = screen.getByText('Row 1').closest('tr');

    expect(row).not.toHaveAttribute('role', 'button');

    if (!row) {
      throw new Error('Expected data row was not rendered');
    }

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClickRow).not.toHaveBeenCalled();
  });

  it('ignores clicks that bubble up from a dialog opened in a cell', async () => {
    const user = userEvent.setup();
    const onClickRow = vi.fn();

    render(
      <DataTable<MetadataRow>
        columns={metadataColumns}
        data={metadataRows}
        onClickRow={onClickRow}
      />,
    );

    fireEvent.click(screen.getByText('Foot Clan Tracking'));
    expect(onClickRow).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Open instance metadata' }),
    );

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');

    if (!overlay) {
      throw new Error('Expected the dialog overlay to be rendered');
    }

    fireEvent.click(overlay);
    fireEvent.click(screen.getByText(/"tier": "gold"/));

    expect(onClickRow).toHaveBeenCalledTimes(1);
  });

  it('ignores key presses that bubble up from a dialog opened in a keyboard-navigable row', async () => {
    const user = userEvent.setup();
    const onClickRow = vi.fn();

    render(
      <DataTable<MetadataRow>
        columns={metadataColumns}
        data={metadataRows}
        onClickRow={onClickRow}
        enableRowKeyboardNavigation
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open instance metadata' }),
    );

    fireEvent.keyDown(screen.getByText(/"tier": "gold"/), { key: 'Enter' });

    expect(onClickRow).not.toHaveBeenCalled();
  });

  describe('with a path per row', () => {
    type CustomerRow = {
      id: string;
      name: string;
      slug?: string;
      status: string;
    };

    const customerColumns: ColumnDef<CustomerRow>[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'status', header: 'Status' },
    ];

    const customerRows: CustomerRow[] = [
      { id: '1', name: 'Acme', slug: 'acme', status: 'Active' },
      { id: '2', name: 'Draft Co', status: 'Pending' },
    ];

    const getCustomerPath = (customer: CustomerRow) =>
      customer.slug ? `/customers/${customer.slug}` : undefined;

    beforeEach(() => {
      mockNavigate.mockReset();
    });

    it('makes the name cell a real link to the row', () => {
      render(
        <DataTable<CustomerRow>
          columns={customerColumns}
          data={customerRows}
          getPath={getCustomerPath}
        />,
      );

      expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute(
        'href',
        '/customers/acme',
      );
      expect(
        screen.queryByRole('link', { name: 'Draft Co' }),
      ).not.toBeInTheDocument();
    });

    it('follows the path from anywhere else on the row', () => {
      render(
        <DataTable<CustomerRow>
          columns={customerColumns}
          data={customerRows}
          getPath={getCustomerPath}
        />,
      );

      fireEvent.click(screen.getByText('Active'));
      fireEvent.click(screen.getByText('Pending'));

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/customers/acme' });
    });

    it('opens the row in a new tab on a modified or middle click', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(
        <DataTable<CustomerRow>
          columns={customerColumns}
          data={customerRows}
          getPath={getCustomerPath}
        />,
      );
      const cell = screen.getByText('Active');

      fireEvent.click(cell, { metaKey: true });
      fireEvent.click(cell, { ctrlKey: true });
      fireEvent(cell, new MouseEvent('auxclick', { bubbles: true, button: 1 }));

      expect(open).toHaveBeenCalledTimes(3);
      expect(open).toHaveBeenCalledWith(
        '/customers/acme',
        '_blank',
        'noopener',
      );
      expect(mockNavigate).not.toHaveBeenCalled();
      open.mockRestore();
    });

    it('lets the link alone navigate when it is the one clicked', () => {
      render(
        <DataTable<CustomerRow>
          columns={customerColumns}
          data={customerRows}
          getPath={getCustomerPath}
        />,
      );

      fireEvent.click(screen.getByRole('link', { name: 'Acme' }));

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/customers/acme' });
    });

    it('puts the link in another column when told to', () => {
      render(
        <DataTable<CustomerRow>
          columns={customerColumns}
          data={customerRows}
          getPath={getCustomerPath}
          linkColumnId="status"
        />,
      );

      expect(screen.getByRole('link', { name: 'Active' })).toHaveAttribute(
        'href',
        '/customers/acme',
      );
      expect(
        screen.queryByRole('link', { name: 'Acme' }),
      ).not.toBeInTheDocument();
    });
  });

  it('applies initialSorting when provided', () => {
    const { container } = render(
      <DataTable<TestRow>
        columns={sortColumns}
        data={sortRows}
        initialSorting={[{ id: 'name', desc: true }]}
        pagination={false}
      />,
    );

    const tbody = container.querySelector('tbody');
    const texts = Array.from(tbody?.querySelectorAll('tr') ?? []).map(
      (row) => row.cells[0]?.textContent ?? '',
    );
    expect(texts).toEqual(['Zebra', 'Mike', 'Alpha']);
  });

  it('cycles sort order when DataTableSortHeader is clicked', () => {
    const { container } = render(
      <DataTable<TestRow>
        columns={sortColumns}
        data={sortRows}
        pagination={false}
      />,
    );

    function getNameColumnTexts() {
      const tbody = container.querySelector('tbody');

      if (!tbody) {
        return [];
      }

      return Array.from(tbody.querySelectorAll('tr')).map(
        (row) => row.cells[0]?.textContent ?? '',
      );
    }

    expect(getNameColumnTexts()).toEqual(['Zebra', 'Alpha', 'Mike']);

    const sortButton = screen.getByRole('button', {
      name: 'Not sorted, click to sort: Name',
    });
    fireEvent.click(sortButton);
    expect(getNameColumnTexts()).toEqual(['Alpha', 'Mike', 'Zebra']);

    fireEvent.click(sortButton);
    expect(getNameColumnTexts()).toEqual(['Zebra', 'Mike', 'Alpha']);

    fireEvent.click(sortButton);
    expect(getNameColumnTexts()).toEqual(['Zebra', 'Alpha', 'Mike']);
  });
  describe('with sub-rows', () => {
    type TreeRow = {
      children?: TreeRow[];
      id: string;
      name: string;
    };

    const treeColumns: ColumnDef<TreeRow>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <>
            <DataTableRowExpander
              row={row}
              label={`Children of ${row.original.name}`}
            />
            {row.original.name}
          </>
        ),
      },
    ];

    const buildParent = (index: number, children?: string[]): TreeRow => ({
      children: children?.map((name) => ({ id: `${index}/${name}`, name })),
      id: `${index}`,
      name: `Parent ${index}`,
    });

    const getTreeRowProps = {
      getRowId: (row: TreeRow) => row.id,
      getSubRows: (row: TreeRow) => row.children,
    };

    it('lists a row\'s children only once it is expanded', async () => {
      const user = userEvent.setup();

      render(
        <DataTable<TreeRow>
          columns={treeColumns}
          data={[buildParent(1, ['Child A', 'Child B']), buildParent(2)]}
          {...getTreeRowProps}
        />,
      );

      const toggle = screen.getByRole('button', {
        name: 'Children of Parent 1',
      });

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Child A')).not.toBeInTheDocument();
      // A row without children gets no toggle of its own.
      expect(
        screen.queryByRole('button', { name: 'Children of Parent 2' }),
      ).not.toBeInTheDocument();

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Child A')).toBeInTheDocument();
      expect(screen.getByText('Child B')).toBeInTheDocument();

      await user.click(toggle);

      expect(screen.queryByText('Child A')).not.toBeInTheDocument();
    });

    it('keeps children on their parent\'s page, counting parents only', async () => {
      const user = userEvent.setup();
      const parents = Array.from({ length: 12 }, (_, index) =>
        buildParent(index + 1, index === 9 ? ['Child A', 'Child B'] : []),
      );

      render(
        <DataTable<TreeRow>
          columns={treeColumns}
          data={parents}
          {...getTreeRowProps}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Children of Parent 10' }),
      );

      expect(screen.getByText('Child B')).toBeInTheDocument();
      expect(screen.queryByText('Parent 11')).not.toBeInTheDocument();
      expect(
        screen.getByText('Showing 1-10 of 12 records'),
      ).toBeInTheDocument();
    });

    it('keeps a row expanded when new data still holds it', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <DataTable<TreeRow>
          columns={treeColumns}
          data={[buildParent(1, ['Child A']), buildParent(2)]}
          {...getTreeRowProps}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Children of Parent 1' }),
      );

      // A refetch: new objects, in another order.
      rerender(
        <DataTable<TreeRow>
          columns={treeColumns}
          data={[buildParent(2), buildParent(1, ['Child A'])]}
          {...getTreeRowProps}
        />,
      );

      expect(screen.getByText('Child A')).toBeInTheDocument();
    });

    it('leaves the row alone when its toggle is clicked', async () => {
      const user = userEvent.setup();
      const onClickRow = vi.fn();

      render(
        <DataTable<TreeRow>
          columns={treeColumns}
          data={[buildParent(1, ['Child A'])]}
          onClickRow={onClickRow}
          {...getTreeRowProps}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Children of Parent 1' }),
      );

      expect(screen.getByText('Child A')).toBeInTheDocument();
      expect(onClickRow).not.toHaveBeenCalled();
    });
  });
});
