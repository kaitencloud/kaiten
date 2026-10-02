import type { Meta, StoryObj } from '@storybook/react-vite';
import { Activity, Shield, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DetailCard } from '@/functionals/detail-card';
import type { DetailTabsNavItem } from '../detail-tabs-nav';
import { Page } from '@/functionals/page';
import { StatCard } from '@/functionals/stat-card';
import { dataModelIcons } from '@/lib/data-model-icons';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { DetailEntityLayout } from '../detail-entity-layout';

const meta = {
  title: 'Functionals/DetailEntityLayout',
  component: DetailEntityLayout,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DetailEntityLayout>;

export default meta;
type Story = StoryObj<typeof DetailEntityLayout>;

const CustomerIcon = dataModelIcons.customer;
const InstanceIcon = dataModelIcons.instance;

const detailTabs: DetailTabsNavItem[] = [
  {
    label: 'Overview',
    to: '/customers/acme-corp',
    value: 'overview',
  },
  {
    label: 'Instances',
    to: '/customers/acme-corp/instances',
    value: 'instances',
  },
  {
    label: 'Audit trail',
    to: '/customers/acme-corp/audit',
    value: 'audit',
  },
];

const EntityHeaderStats = ({ dense = false }: { dense?: boolean }) => (
  <StatCard.Row dense={dense} columnsClassName="md:grid-cols-3">
    <StatCard>
      <StatCard.Label>Usage</StatCard.Label>
      <StatCard.Icon>
        <Activity />
      </StatCard.Icon>
      <StatCard.Value>82%</StatCard.Value>
      <StatCard.Helper>Stable over 7 days</StatCard.Helper>
    </StatCard>
    <StatCard>
      <StatCard.Label>Customers</StatCard.Label>
      <StatCard.Icon>
        <CustomerIcon />
      </StatCard.Icon>
      <StatCard.Value>24</StatCard.Value>
      <StatCard.Helper>8 enterprise plans</StatCard.Helper>
    </StatCard>
    <StatCard>
      <StatCard.Label>Risk</StatCard.Label>
      <StatCard.Icon>
        <Shield />
      </StatCard.Icon>
      <StatCard.Value className="text-success-subtle-foreground">Low</StatCard.Value>
      <StatCard.Helper>No blocker</StatCard.Helper>
    </StatCard>
  </StatCard.Row>
);

const header = (
  <Page.Header>
    <Page.Leading>
      <Page.Icon>
        <InstanceIcon className="size-8 text-primary-subtle-foreground" />
      </Page.Icon>
      <Page.Heading>
        <Page.TitleRow>
          <Page.Title>Acme production</Page.Title>
          <Badge variant="default">Healthy</Badge>
        </Page.TitleRow>
        <Page.Subtitle>
          Shared entity detail shell with header, stats and route tabs.
        </Page.Subtitle>
      </Page.Heading>
    </Page.Leading>
    <Page.Actions>
      <Button variant="destructive" className="gap-2">
        <Trash2 className="size-4" />
        Delete
      </Button>
    </Page.Actions>
  </Page.Header>
);

const overviewCards = (
  <div className="grid gap-4 lg:grid-cols-3">
    <DetailCard className="lg:col-span-2">
      <DetailCard.Header>
        <DetailCard.Title>Overview</DetailCard.Title>
        <DetailCard.Description>
          Primary metadata for the selected entity.
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row label="Customer" value="Acme Corp" />
          <DetailCard.Row label="Region" value="EU West" />
          <DetailCard.Row label="Release" value="2026.04.1" />
        </DetailCard.Rows>
      </DetailCard.Content>
    </DetailCard>
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>Entitlements</DetailCard.Title>
        <DetailCard.Description>
          Limits that need regular review.
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row label="Enabled" value="24" />
          <DetailCard.Row label="Near limit" value="2" />
          <DetailCard.Row label="Exhausted" value="0" />
        </DetailCard.Rows>
      </DetailCard.Content>
    </DetailCard>
  </div>
);

function EntityLayoutStoryFrame({
  children,
  stats,
}: {
  children: ReactNode;
  stats?: ReactNode;
}) {
  return (
    <StorybookRouter
      initialEntries={['/customers/acme-corp']}
      routePath="/customers/$customerSlug"
    >
      <DetailEntityLayout>
        <DetailEntityLayout.Top>{header}{stats}</DetailEntityLayout.Top>
        <DetailEntityLayout.Body>
          <DetailEntityLayout.Tabs activeTab="overview" items={detailTabs} />
          <DetailEntityLayout.Content>{children}</DetailEntityLayout.Content>
        </DetailEntityLayout.Body>
      </DetailEntityLayout>
    </StorybookRouter>
  );
}

export const WithStats: Story = {
  render: () => (
    <EntityLayoutStoryFrame
      stats={<EntityHeaderStats />}
    >
      {overviewCards}
    </EntityLayoutStoryFrame>
  ),
};

export const WithDenseStats: Story = {
  render: () => (
    <EntityLayoutStoryFrame stats={<EntityHeaderStats dense />}>
      {overviewCards}
    </EntityLayoutStoryFrame>
  ),
};

export const WithoutStats: Story = {
  render: () => (
    <EntityLayoutStoryFrame>{overviewCards}</EntityLayoutStoryFrame>
  ),
};
