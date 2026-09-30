import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DataTable, DataTableRowExpander, dataTableSortableHeader } from '..';
import type { ColumnDef } from '../types/data-table.types';

const meta = {
  title: 'Functionals/DataTable',
  component: DataTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof DataTable>;

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

const users: User[] = [
  { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Admin' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'User' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', role: 'User' },
  { id: 4, name: 'Alice Brown', email: 'alice@example.com', role: 'Admin' },
  { id: 5, name: 'Charlie Wilson', email: 'charlie@example.com', role: 'User' },
];

const paginatedUsers: User[] = Array.from({ length: 50 }, (_, index) => {
  const id = index + 1;
  const role = id % 3 === 0 ? 'Editor' : id % 2 === 0 ? 'Admin' : 'User';

  return {
    id,
    name: `User ${id}`,
    email: `user-${id}@example.com`,
    role,
  };
});

const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
];

const sortableColumns: ColumnDef<User>[] = [
  {
    accessorKey: 'id',
    header: dataTableSortableHeader('ID'),
  },
  {
    accessorKey: 'name',
    header: dataTableSortableHeader('Name'),
  },
  {
    accessorKey: 'email',
    header: dataTableSortableHeader('Email'),
  },
  {
    accessorKey: 'role',
    header: dataTableSortableHeader('Role'),
  },
];

const columnsWithMeta: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    meta: {
      headerClassName: 'w-[25%] whitespace-normal',
      cellClassName: 'whitespace-normal',
    },
  },
  {
    accessorKey: 'email',
    header: 'Email payload',
    meta: {
      headerClassName: 'w-[55%] whitespace-normal',
      cellClassName: 'whitespace-normal break-all',
    },
  },
  {
    accessorKey: 'role',
    header: 'Role',
    meta: {
      headerClassName: 'w-[20%] whitespace-normal',
      cellClassName: 'whitespace-normal',
    },
  },
];

export const Default: Story = {
  render: () => <DataTable<User> columns={columns} data={users} />,
};

export const Empty: Story = {
  render: () => <DataTable<User> columns={columns} data={[]} />,
};

type Service = {
  id: string;
  name: string;
  version: string;
  versions?: Service[];
};

const services: Service[] = [
  {
    id: 'api',
    name: 'API',
    version: '2026.8.0',
    versions: [
      { id: 'api-2026-8-0', name: 'API', version: '2026.8.0' },
      { id: 'api-2026-7-0', name: 'API', version: '2026.7.0' },
    ],
  },
  { id: 'kitchen-display', name: 'Kitchen Display', version: '1.2.0' },
  {
    id: 'web-app',
    name: 'Web App',
    version: '2026.8.0',
    versions: [
      { id: 'web-app-2026-8-0', name: 'Web App', version: '2026.8.0' },
      { id: 'web-app-2026-7-0', name: 'Web App', version: '2026.7.0' },
    ],
  },
];

const serviceColumns: ColumnDef<Service>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) =>
      row.depth > 0 ? (
        <span className="ps-8 text-muted-foreground">{row.original.name}</span>
      ) : (
        <div className="flex items-start gap-2">
          <DataTableRowExpander
            row={row}
            label={`Versions of ${row.original.name}`}
          />
          <span>{row.original.name}</span>
        </div>
      ),
  },
  {
    accessorKey: 'version',
    header: 'Version',
  },
];

export const WithSubRows: Story = {
  name: 'Interactive / Sub-rows',
  render: () => (
    <DataTable<Service>
      columns={serviceColumns}
      data={services}
      getRowId={(service) => service.id}
      getSubRows={(service) => service.versions}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A row with children (`getSubRows`) starts collapsed; `DataTableRowExpander` in its first cell shows and hides them. Rows without children keep the toggle\'s room so the names line up.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: 'Versions of API' });

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByText('2026.7.0')).not.toBeInTheDocument();

    await userEvent.click(toggle);

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('2026.7.0')).toBeInTheDocument();

    await userEvent.click(toggle);

    await expect(canvas.queryByText('2026.7.0')).not.toBeInTheDocument();
  },
};

export const Clickable: Story = {
  render: () => (
    <DataTable<User>
      columns={columns}
      data={users}
      onClickRow={(row) => {
        alert(`Clicked on ${row.original.name}`);
      }}
    />
  ),
};

export const Paginated: Story = {
  render: () => (
    <DataTable<User> columns={columns} data={paginatedUsers} />
  ),
};

export const PaginatedWithPageSizeSelector: Story = {
  render: () => (
    <DataTable<User>
      columns={columns}
      data={paginatedUsers}
      pagination={{ showPageSizeSelector: true }}
    />
  ),
};

export const SimpleVariant: Story = {
  render: () => (
    <DataTable<User>
      columns={columns}
      data={paginatedUsers}
      variant="simple"
    />
  ),
};

export const SimpleVariantWithoutPagination: Story = {
  render: () => (
    <DataTable<User>
      columns={columns}
      data={paginatedUsers}
      variant="simple"
      pagination={false}
    />
  ),
};

export const SimpleVariantFixedTable: Story = {
  render: () => (
    <DataTable<User>
      columns={columnsWithMeta}
      data={paginatedUsers.map((user) => ({
        ...user,
        email: `${user.email}-with-extra-context-${user.id}-for-wrapping`,
      }))}
      variant="simple"
      tableClassName="table-fixed"
    />
  ),
};

export const SimpleVariantStickyFixedBody: Story = {
  render: () => (
    <DataTable<User>
      className="h-[18rem]"
      columns={columns}
      data={paginatedUsers}
      variant="simple"
      bodyScrollable
    />
  ),
};

export const Sortable: Story = {
  render: () => (
    <DataTable<User> columns={sortableColumns} data={users} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Each header is rendered through `dataTableSortableHeader`, exposing a button that toggles ascending → descending → unsorted on click. Hover or focus reveals the neutral sort indicator on un-sorted columns.',
      },
    },
  },
};

export const InteractiveSort: Story = {
  name: 'Interactive / Sort by header',
  render: () => (
    <DataTable<User> columns={sortableColumns} data={users} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: clicking the Name header sorts ascending (Alice first), clicking again sorts descending (John first), and a third click clears the sort to restore the original order. Anchors the header click → tri-state cycle behaviour.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const firstDataCell = (): HTMLElement => {
      // Row index 0 is the header row, row index 1 is the first data row.
      const dataRow = canvas.getAllByRole('row')[1];
      if (!dataRow) {
        throw new Error('Expected at least one data row');
      }
      return dataRow;
    };

    // Initial order: rows are rendered in the order of the data array,
    // so John Doe sits at the top.
    await expect(within(firstDataCell()).getByText('John Doe')).toBeInTheDocument();

    const nameHeader = canvas.getByRole('button', { name: /name/i });

    // First click → ascending sort, Alice Brown moves to the top.
    await userEvent.click(nameHeader);
    await expect(
      within(firstDataCell()).getByText('Alice Brown'),
    ).toBeInTheDocument();

    // Second click → descending sort, John Doe is back at the top.
    await userEvent.click(canvas.getByRole('button', { name: /name/i }));
    await expect(
      within(firstDataCell()).getByText('John Doe'),
    ).toBeInTheDocument();

    // Third click → sorting removed (enableSortingRemoval), original order
    // is restored with John Doe still first.
    await userEvent.click(canvas.getByRole('button', { name: /name/i }));
    await expect(
      within(firstDataCell()).getByText('John Doe'),
    ).toBeInTheDocument();
  },
};

export const InteractivePagination: Story = {
  name: 'Interactive / Pagination',
  render: () => (
    <DataTable<User> columns={columns} data={paginatedUsers} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: clicking Next advances the page and swaps the visible row range. Serves as a regression anchor for the pagination primitives.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('User 10')).toBeInTheDocument();
    await expect(canvas.queryByText('User 11')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /next/i }));

    await expect(canvas.getByText('User 11')).toBeInTheDocument();
    await expect(canvas.queryByText('User 10')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /previous/i }));

    await expect(canvas.getByText('User 10')).toBeInTheDocument();
    await expect(canvas.queryByText('User 11')).not.toBeInTheDocument();
  },
};
