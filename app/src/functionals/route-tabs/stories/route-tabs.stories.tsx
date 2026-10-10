import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { RouteTabs, type RouteTab } from '../route-tabs';

const meta = {
  title: 'Functionals/RouteTabs',
  component: RouteTabs,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RouteTabs>;

export default meta;
type Story = StoryObj<typeof RouteTabs>;

const customerRouteTabs: RouteTab[] = [
  {
    id: 'customers',
    label: 'Customers',
    to: '/customers',
  },
  {
    id: 'instances',
    label: 'Instances',
    to: '/customers/instances',
  },
];

const webhookRouteTabs: RouteTab[] = [
  {
    id: 'events',
    label: 'Events',
    to: '/integrations/webhooks',
  },
  {
    id: 'history',
    label: 'History',
    to: '/integrations/webhooks/history',
  },
];

// One route, told apart by its search: every invoice is the bare path.
const viewRouteTabs: RouteTab[] = [
  {
    id: 'all',
    label: 'All',
    to: '/invoices',
  },
  {
    id: 'held',
    label: 'Held',
    search: { view: 'held' },
    to: '/invoices',
  },
];

function RouteTabsStoryFrame({
  initialEntry,
  routePath,
  tabs,
}: {
  initialEntry: string;
  routePath: string;
  tabs: ComponentProps<typeof RouteTabs>['tabs'];
}) {
  return (
    <StorybookRouter initialEntries={[initialEntry]} routePath={routePath}>
      <div className="max-w-3xl">
        <RouteTabs tabs={tabs} />
      </div>
    </StorybookRouter>
  );
}

export const ParentRouteActive: Story = {
  render: () => (
    <RouteTabsStoryFrame
      initialEntry="/customers"
      routePath="/customers"
      tabs={customerRouteTabs}
    />
  ),
};

export const NestedRouteActive: Story = {
  render: () => (
    <RouteTabsStoryFrame
      initialEntry="/customers/instances/acme-production"
      routePath="/customers/instances/$instanceSlug"
      tabs={customerRouteTabs}
    />
  ),
};

export const SecondaryWorkflow: Story = {
  render: () => (
    <RouteTabsStoryFrame
      initialEntry="/integrations/webhooks/history"
      routePath="/integrations/webhooks/history"
      tabs={webhookRouteTabs}
    />
  ),
};

export const SearchTabDefault: Story = {
  render: () => (
    <RouteTabsStoryFrame
      initialEntry="/invoices"
      routePath="/invoices"
      tabs={viewRouteTabs}
    />
  ),
};

export const SearchTabActive: Story = {
  render: () => (
    <RouteTabsStoryFrame
      initialEntry="/invoices?view=held"
      routePath="/invoices"
      tabs={viewRouteTabs}
    />
  ),
};

// Each tab can show a count next to its label, a 0 included.
export const WithCounts: Story = {
  render: () => (
    <RouteTabsStoryFrame
      initialEntry="/invoices?view=held"
      routePath="/invoices"
      tabs={[
        { count: 12, id: 'all', label: 'All', to: '/invoices' },
        {
          count: 3,
          id: 'overdue',
          label: 'Overdue',
          search: { view: 'overdue' },
          to: '/invoices',
        },
        {
          count: 0,
          id: 'held',
          label: 'Held',
          search: { view: 'held' },
          to: '/invoices',
        },
      ]}
    />
  ),
};
