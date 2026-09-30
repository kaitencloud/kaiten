import type { Meta, StoryObj } from '@storybook/react-vite';
import { Activity, Server, Shield, Trash2, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DetailCard } from '@/functionals/detail-card';
import type { DetailTabsNavItem } from '@/functionals/detail-tabs-layout';
import { Page } from '@/functionals/page';
import {
  StatsCardsRow,
  type StatsCardsRowItem,
} from '@/functionals/stats-cards-row';
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

const entityHeaderStats: StatsCardsRowItem[] = [
  {
    id: 'usage',
    label: 'Usage',
    value: '82%',
    helper: 'Stable over 7 days',
    Icon: Activity,
  },
  {
    id: 'customers',
    label: 'Customers',
    value: '24',
    helper: '8 enterprise plans',
    Icon: Users,
  },
  {
    id: 'risk',
    label: 'Risk',
    value: 'Low',
    helper: 'No blocker',
    Icon: Shield,
    valueClassName: 'text-success-subtle-foreground',
  },
];

const header = (
  <Page.Header>
    <Page.Leading>
      <Page.Icon>
        <Server className="size-8 text-primary-subtle-foreground" />
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
      <DetailEntityLayout
        activeTab="overview"
        header={header}
        stats={stats}
        tabs={detailTabs}
      >
        {children}
      </DetailEntityLayout>
    </StorybookRouter>
  );
}

export const WithStats: Story = {
  render: () => (
    <EntityLayoutStoryFrame
      stats={
        <StatsCardsRow
          items={entityHeaderStats}
          columnsClassName="md:grid-cols-3"
        />
      }
    >
      {overviewCards}
    </EntityLayoutStoryFrame>
  ),
};

export const WithoutStats: Story = {
  render: () => (
    <EntityLayoutStoryFrame>{overviewCards}</EntityLayoutStoryFrame>
  ),
};
