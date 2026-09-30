import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  type FilterFieldDefinition,
  FilterSearchInput,
  FilterToolbarFilterButton,
  FilterToolbarFiltersRow,
  FilterToolbarProvider,
  FilterToolbarQuickAccessFilters,
  useFilterBuilder,
} from '..';
import {
  type ColumnDef,
  DataTable,
} from '@/functionals/table';

type UserRow = {
  email: string;
  enabled: boolean;
  id: number;
  name: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  status: 'active' | 'inactive' | 'pending';
};

const USERS: UserRow[] = [
  {
    id: 1,
    name: 'Emma Mustafa',
    email: 'emma.mustafa@org.net',
    role: 'Viewer',
    status: 'active',
    enabled: true,
  },
  {
    id: 2,
    name: 'James Williams',
    email: 'james.williams@company.com',
    role: 'Editor',
    status: 'inactive',
    enabled: false,
  },
  {
    id: 3,
    name: 'Ali Mansour',
    email: 'ali.mansour@company.com',
    role: 'Admin',
    status: 'pending',
    enabled: true,
  },
  {
    id: 4,
    name: 'Nora Williams',
    email: 'nora.williams@org.net',
    role: 'Viewer',
    status: 'active',
    enabled: true,
  },
  {
    id: 5,
    name: 'Daniel Farouk',
    email: 'daniel.farouk@work.co',
    role: 'Admin',
    status: 'inactive',
    enabled: false,
  },
];

const columns: ColumnDef<UserRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {row.original.status}
      </Badge>
    ),
  },
  { accessorKey: 'role', header: 'Role' },
];

function BasicFiltersStory() {
  const fields = useMemo<FilterFieldDefinition<UserRow>[]>(
    () => [
      {
        id: 'name',
        label: 'Name',
        type: 'text',
        accessor: (item) => item.name,
        placeholder: 'Name',
      },
      {
        id: 'email',
        label: 'Email',
        type: 'text',
        accessor: (item) => item.email,
      },
      {
        id: 'status',
        label: 'Status',
        type: 'enum',
        accessor: (item) => item.status,
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
          { label: 'Pending', value: 'pending' },
        ],
      },
      {
        id: 'role',
        label: 'Role',
        type: 'enum',
        accessor: (item) => item.role,
        options: [
          { label: 'Admin', value: 'Admin' },
          { label: 'Editor', value: 'Editor' },
          { label: 'Viewer', value: 'Viewer' },
        ],
      },
    ],
    [],
  );

  const controller = useFilterBuilder({
    data: USERS,
    fields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  return (
    <FilterToolbarProvider controller={controller}>
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <FilterSearchInput
              filterId="name"
              className="w-full sm:w-[320px]"
            />
            <FilterToolbarFilterButton className="sm:shrink-0" />
          </div>
        </div>
        <FilterToolbarFiltersRow />
      </div>

      <div className="mt-6">
        <DataTable columns={columns} data={controller.filteredData} />
      </div>
    </FilterToolbarProvider>
  );
}

function QuickAccessFiltersStory() {
  const fields = useMemo<FilterFieldDefinition<UserRow>[]>(
    () => [
      {
        id: 'name',
        label: 'Name',
        type: 'text',
        accessor: (item) => item.name,
        placeholder: 'Name',
      },
      {
        id: 'status',
        label: 'Status',
        type: 'enum',
        accessor: (item) => item.status,
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
          { label: 'Pending', value: 'pending' },
        ],
        quickAccess: true,
      },
      {
        id: 'enabled',
        label: 'Enabled',
        type: 'boolean',
        accessor: (item) => item.enabled,
        quickAccess: true,
      },
      {
        id: 'role',
        label: 'Role',
        type: 'enum',
        accessor: (item) => item.role,
        options: [
          { label: 'Admin', value: 'Admin' },
          { label: 'Editor', value: 'Editor' },
          { label: 'Viewer', value: 'Viewer' },
        ],
        // Opt-in search above the options, for lists long enough to need it.
        searchable: true,
      },
    ],
    [],
  );

  const controller = useFilterBuilder({
    data: USERS,
    fields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  return (
    <FilterToolbarProvider controller={controller}>
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <FilterSearchInput
              filterId="name"
              className="w-full sm:w-[320px]"
            />
            <FilterToolbarQuickAccessFilters className="sm:shrink-0" />
            <FilterToolbarFilterButton className="sm:shrink-0" />
          </div>
        </div>
        <FilterToolbarFiltersRow />
      </div>

      <div className="mt-6">
        <DataTable columns={columns} data={controller.filteredData} />
      </div>
    </FilterToolbarProvider>
  );
}

function AdvancedFiltersStory() {
  const fields = useMemo<FilterFieldDefinition<UserRow>[]>(
    () => [
      {
        id: 'name',
        label: 'Name',
        type: 'text',
        accessor: (item) => item.name,
        placeholder: 'Name',
      },
      {
        id: 'email',
        label: 'Email',
        type: 'text',
        accessor: (item) => item.email,
      },
      {
        id: 'status',
        label: 'Status',
        type: 'enum',
        accessor: (item) => item.status,
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
          { label: 'Pending', value: 'pending' },
        ],
      },
      {
        id: 'role',
        label: 'Role',
        type: 'enum',
        accessor: (item) => item.role,
        options: [
          { label: 'Admin', value: 'Admin' },
          { label: 'Editor', value: 'Editor' },
          { label: 'Viewer', value: 'Viewer' },
        ],
      },
      {
        id: 'enabled',
        label: 'Enabled',
        type: 'boolean',
        accessor: (item) => item.enabled,
      },
    ],
    [],
  );

  const controller = useFilterBuilder({
    data: USERS,
    fields,
    pinnedFilterIds: ['name'],
    defaultAdvancedRules: [
      {
        id: 'advanced-role-admin',
        fieldId: 'role',
        operator: 'is',
        value: 'Admin',
      },
    ],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  return (
    <FilterToolbarProvider controller={controller} showAdvancedOption>
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <FilterSearchInput
              filterId="name"
              className="w-full sm:w-[320px]"
            />
            <FilterToolbarFilterButton className="sm:shrink-0" />
          </div>
        </div>
        <FilterToolbarFiltersRow />
      </div>

      <div className="mt-6">
        <DataTable columns={columns} data={controller.filteredData} />
      </div>
    </FilterToolbarProvider>
  );
}

const meta = {
  title: 'Functionals/Filters/FilterToolbar',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const BasicFilters: Story = {
  render: () => <BasicFiltersStory />,
};

export const QuickAccessFilters: Story = {
  render: () => <QuickAccessFiltersStory />,
};

export const AdvancedFilters: Story = {
  render: () => <AdvancedFiltersStory />,
};
