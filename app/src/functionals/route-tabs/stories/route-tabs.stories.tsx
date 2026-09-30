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
