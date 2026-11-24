import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useFilterBuilder } from '@/functionals/filters';
import {
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
  FilterTableLayout,
} from '..';
import { getChoosableColumns } from '../logic/column-chooser';
import { tableColumnsStorageKey } from '../logic/column-visibility-storage';
import type { ColumnDef } from '../types/data-table.types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const identity = vi.hoisted(() => ({ organizationId: 'org_a' }));

vi.mock('@/lib/session-identity', () => ({
  getSessionIdentity: () => ({
    organizationId: identity.organizationId,
    userId: 'user_1',
  }),
}));

type Zone = {
  name: string;
  region: string;
  tier: string;
};

const ZONES: Zone[] = [
  { name: 'Paris', region: 'eu-west-3', tier: 'gold' },
  { name: 'Virginia', region: 'us-east-1', tier: 'silver' },
];

const regionColumn: ColumnDef<Zone> = {
  accessorKey: 'region',
  header: dataTableSortableHeader('Region'),
};
const tierColumn: ColumnDef<Zone> = { id: 'metadata.tier', header: 'Tier', accessorFn: (zone) => zone.tier };

const COLUMNS: ColumnDef<Zone>[] = [
  { accessorKey: 'name', header: dataTableSortableHeader('Name') },
  regionColumn,
  tierColumn,
  createActionsColumn<Zone>(() => <button type="button">Edit</button>),
];

const FILTER_FIELDS = [
  {
    id: 'name',
    label: 'Name',
    type: 'text' as const,
    accessor: (zone: Zone) => zone.name,
  },
  {
    id: 'region',
    label: 'Region',
    type: 'text' as const,
    accessor: (zone: Zone) => zone.region,
  },
];

function ZonesTable({
  columns = COLUMNS,
  tableId = 'zones',
}: {
  columns?: ColumnDef<Zone>[];
  tableId?: string;
}) {
  const controller = useFilterBuilder({
    data: ZONES,
    fields: FILTER_FIELDS,
    pinnedFilterIds: ['name'],
  });

  return (
    <FilterTableLayout columnChooser={tableId} controller={controller}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId="name" />
        </FilterTableLayout.ToolbarRow>
      </FilterTableLayout.Toolbar>
      <FilterTableLayout.Content>
        <DataTable
          columns={columns}
          data={controller.filteredData}
          getPath={(zone) => `/zones/${zone.name}`}
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}

const STORAGE_KEY = tableColumnsStorageKey('org_a', 'zones');

const headers = () =>
  screen
    .getAllByRole('columnheader')
    .map((header) => header.textContent?.trim());

const columnsButton = () =>
  screen.getByRole('button', { name: /Functionals\.TableColumns\.button/ });

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(columnsButton());
  return within(await screen.findByRole('menu'));
}

describe('the column chooser of a list', () => {
  beforeEach(() => {
    identity.organizationId = 'org_a';
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows every column until the person chooses', () => {
    render(<ZonesTable />);

    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('lists the columns that may be hidden, named as their headers, checked', async () => {
    const user = userEvent.setup();
    render(<ZonesTable />);

    const menu = await openMenu(user);
    const items = menu.getAllByRole('menuitemcheckbox');

    // The name carries the row's link and the actions are the row's: neither is listed.
    expect(items.map((item) => item.textContent)).toEqual(['Region', 'Tier']);
    for (const item of items) {
      expect(item).toHaveAttribute('aria-checked', 'true');
    }
    expect(
      menu.getByRole('menuitem', { name: 'Functionals.TableColumns.reset' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('hides and shows a column, leaving the menu open', async () => {
    const user = userEvent.setup();
    render(<ZonesTable />);

    const menu = await openMenu(user);
    await user.click(menu.getByRole('menuitemcheckbox', { name: 'Region' }));

    expect(headers()).toEqual(['Name', 'Tier', 'Actions']);
    expect(
      menu.getByRole('menuitemcheckbox', { name: 'Region' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryAllByText('eu-west-3')).toHaveLength(0);

    await user.click(menu.getByRole('menuitemcheckbox', { name: 'Region' }));

    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
    expect(screen.getByText('eu-west-3')).toBeInTheDocument();
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ZonesTable />);

    columnsButton().focus();
    await user.keyboard('{Enter}');
    const menu = within(await screen.findByRole('menu'));
    const region = menu.getByRole('menuitemcheckbox', { name: 'Region' });
    region.focus();
    await user.keyboard(' ');

    expect(region).toHaveAttribute('aria-checked', 'false');
    expect(headers()).toEqual(['Name', 'Tier', 'Actions']);
  });

  it('keeps the choice for the table and the organization, across a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ZonesTable />);

    const menu = await openMenu(user);
    await user.click(menu.getByRole('menuitemcheckbox', { name: 'Tier' }));
    unmount();

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual(
      { hidden: ['metadata.tier'] },
    );

    render(<ZonesTable />);
    expect(headers()).toEqual(['Name', 'Region', 'Actions']);
    // The button says a column is hidden.
    expect(columnsButton()).toHaveAccessibleName(
      'Functionals.TableColumns.buttonWithHidden',
    );
  });

  it('does not carry the choice to another table or another organization', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hidden: ['region'] }),
    );

    const { unmount } = render(<ZonesTable tableId="other" />);
    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
    unmount();

    identity.organizationId = 'org_b';
    render(<ZonesTable />);
    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
  });

  it('puts every column back on Reset', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hidden: ['region', 'metadata.tier'] }),
    );
    const user = userEvent.setup();
    render(<ZonesTable />);
    expect(headers()).toEqual(['Name', 'Actions']);

    const menu = await openMenu(user);
    await user.click(
      menu.getByRole('menuitem', { name: 'Functionals.TableColumns.reset' }),
    );

    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores a stored column the table no longer has, and shows a new one', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hidden: ['metadata.retired', 'region'] }),
    );
    const owner: ColumnDef<Zone> = {
      id: 'metadata.owner',
      header: 'Owner',
      cell: () => 'ops',
    };

    render(<ZonesTable columns={[...COLUMNS.slice(0, 3), owner, COLUMNS[3]!]} />);

    expect(headers()).toEqual(['Name', 'Tier', 'Owner', 'Actions']);
  });

  it('never hides the name or the actions, whatever is stored', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hidden: ['name', 'actions'] }),
    );

    render(<ZonesTable />);

    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
  });

  it('shows every column when the storage holds something unreadable', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');

    render(<ZonesTable />);

    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
  });

  it('keeps working when the browser refuses its storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const user = userEvent.setup();
    render(<ZonesTable />);
    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);

    const menu = await openMenu(user);
    await user.click(menu.getByRole('menuitemcheckbox', { name: 'Region' }));

    // The choice holds for the page, unsaved.
    expect(headers()).toEqual(['Name', 'Tier', 'Actions']);
  });

  it('keeps the filter of a hidden column', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hidden: ['region'] }),
    );
    const user = userEvent.setup();
    render(<ZonesTable />);

    await user.click(screen.getByRole('button', { name: /Common\.filter/ }));

    expect(
      await screen.findByRole('option', { name: 'Region' }),
    ).toBeInTheDocument();
  });
});

describe('a table outside a layout with a column chooser', () => {
  it('has no Columns button and shows every column', () => {
    window.localStorage.setItem(
      tableColumnsStorageKey('org_a', 'zones'),
      JSON.stringify({ hidden: ['region'] }),
    );

    render(<DataTable columns={COLUMNS} data={ZONES} />);

    expect(headers()).toEqual(['Name', 'Region', 'Tier', 'Actions']);
    expect(
      screen.queryByRole('button', { name: /Functionals\.TableColumns/ }),
    ).toBeNull();
  });
});

describe('getChoosableColumns', () => {
  it('lists the columns with a header text, but the link column and the unhideable ones', () => {
    expect(
      getChoosableColumns<Zone>(
        [
          ...COLUMNS,
          { id: 'icon', header: () => null },
          { id: 'pinned', header: 'Pinned', enableHiding: false },
          { accessorKey: 'tier', header: '' },
        ],
        'name',
      ),
    ).toEqual([
      { id: 'region', label: 'Region' },
      { id: 'metadata.tier', label: 'Tier' },
    ]);
  });
});
