import type { Meta, StoryObj } from '@storybook/react-vite';
import type { LucideIcon } from 'lucide-react';
import { Activity, Check, Gauge, Search, Settings, Shield } from 'lucide-react';
import { Fragment, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button';
import {
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxPanel,
  ComboboxSearch,
  ComboboxSeparator,
} from '../combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';

const meta = {
  title: 'Components/UI/Combobox',
  component: ComboboxPanel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ComboboxPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

type CommandEntry = {
  value: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
};

type CommandGroupData = { value: string; heading: string; items: CommandEntry[] };

const commandGroups: CommandGroupData[] = [
  {
    value: 'navigation',
    heading: 'Navigation',
    items: [
      { value: 'dashboard', label: 'Dashboard', icon: Gauge, shortcut: 'G D' },
      { value: 'entitlements', label: 'Entitlements', icon: Shield, shortcut: 'G E' },
      { value: 'audit-trail', label: 'Audit trail', icon: Activity, shortcut: 'G A' },
    ],
  },
  {
    value: 'actions',
    heading: 'Actions',
    items: [
      { value: 'search-flags', label: 'Search feature flags', icon: Search },
      { value: 'disabled', label: 'Disabled command', icon: Settings, disabled: true },
    ],
  },
];

function CommandList({ search }: { search: string }) {
  return (
    <ComboboxList>
      {(group: CommandGroupData, index: number) => (
        <Fragment key={group.value}>
          {index > 0 && search === '' ? <ComboboxSeparator /> : null}
          <ComboboxGroup items={group.items}>
            <ComboboxLabel>{group.heading}</ComboboxLabel>
            <ComboboxCollection>
              {(entry: CommandEntry) => (
                <ComboboxItem key={entry.value} value={entry} disabled={entry.disabled}>
                  <entry.icon />
                  {entry.label}
                  {entry.shortcut ? (
                    <span className="ml-auto text-xs tracking-widest text-muted-foreground">
                      {entry.shortcut}
                    </span>
                  ) : null}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxGroup>
        </Fragment>
      )}
    </ComboboxList>
  );
}

function CommandPalette({ className }: { className?: string }) {
  const [search, setSearch] = useState('');

  return (
    <ComboboxPanel<CommandEntry>
      className={className}
      items={commandGroups}
      value={null}
      itemToStringLabel={(entry) => entry.label}
      inputValue={search}
      onInputValueChange={(nextSearch, details) => {
        if (details.reason === 'input-change') {
          setSearch(nextSearch);
        }
      }}
    >
      <ComboboxSearch placeholder="Search commands..." />
      <ComboboxEmpty>No result found.</ComboboxEmpty>
      <CommandList search={search} />
    </ComboboxPanel>
  );
}

export const Default: Story = {
  render: () => (
    <div className="w-[420px] rounded-lg border shadow-md">
      <CommandPalette />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByPlaceholderText('Search commands...');

    await expect(canvas.getAllByRole('option')).toHaveLength(5);
    // The first item is highlighted from the start, so Enter picks it.
    await expect(canvas.getAllByRole('option')[0]).toHaveAttribute('data-highlighted');
    await expect(canvas.getByRole('option', { name: /disabled command/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await userEvent.type(search, 'aud');
    await waitFor(() => expect(canvas.getAllByRole('option')).toHaveLength(1));
    await expect(canvas.getByRole('option', { name: /audit trail/i })).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    await waitFor(() => expect(canvas.queryByRole('option')).not.toBeInTheDocument());
    await expect(canvas.getByText('No result found.')).toBeVisible();
  },
};

export const DialogOpen: Story = {
  render: () => (
    <Dialog open>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search for a command to run...</DialogDescription>
        </DialogHeader>
        <CommandPalette />
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};

type Customer = { value: string; label: string };

const customers: Customer[] = [
  { value: 'customer-1', label: 'Acme Corp' },
  { value: 'customer-2', label: 'Globex' },
  { value: 'customer-3', label: 'Initech' },
];

function CustomerPicker() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch('');
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" className="w-[240px] justify-between">
            {selected?.label ?? 'Select a customer'}
          </Button>
        }
      />
      <PopoverContent className="w-[240px] p-0" align="start">
        <ComboboxPanel<Customer>
          items={customers}
          value={null}
          itemToStringLabel={(customer) => customer.label}
          inputValue={search}
          onInputValueChange={(nextSearch, details) => {
            if (details.reason === 'input-change') {
              setSearch(nextSearch);
            }
          }}
          onValueChange={(customer) => {
            if (customer) {
              setSelected(customer);
              setOpen(false);
            }
          }}
        >
          <ComboboxSearch placeholder="Search for a customer" />
          <ComboboxEmpty>No results</ComboboxEmpty>
          <ComboboxList className="p-1 empty:p-0">
            {(customer: Customer) => (
              <ComboboxItem key={customer.value} value={customer}>
                <Check
                  className={
                    customer.value === selected?.value
                      ? 'size-4 opacity-100'
                      : 'size-4 opacity-0'
                  }
                />
                {customer.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPanel>
      </PopoverContent>
    </Popover>
  );
}

/** The pattern the application uses: the list renders inline inside a Popover that owns the surface. */
export const InPopover: Story = {
  render: () => <CustomerPicker />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Select a customer' }));

    const search = await within(document.body).findByPlaceholderText('Search for a customer');
    await waitFor(() => expect(search).toHaveFocus());

    await userEvent.type(search, 'glo');
    await waitFor(() =>
      expect(within(document.body).getAllByRole('option')).toHaveLength(1),
    );

    await userEvent.click(within(document.body).getByRole('option', { name: 'Globex' }));

    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Globex' })).toBeVisible(),
    );
    // The popup stays mounted while it plays its exit animation.
    await waitFor(() =>
      expect(within(document.body).queryByRole('option')).not.toBeInTheDocument(),
    );
  },
};
