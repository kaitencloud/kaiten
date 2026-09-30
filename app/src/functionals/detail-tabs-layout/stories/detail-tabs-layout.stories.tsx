import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { DetailCard } from '@/functionals/detail-card';
import { Page } from '@/functionals/page';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import type { DetailTabsNavItem } from '../detail-tabs-nav';
import { DetailTabsLayout } from '../detail-tabs-layout';
import { DetailTabsNav } from '../detail-tabs-nav';

const meta = {
  title: 'Functionals/DetailTabsLayout',
  component: DetailTabsLayout,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DetailTabsLayout>;

export default meta;
type Story = StoryObj<typeof DetailTabsLayout>;

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

function DetailTabsStoryFrame({
  activeTab,
  children,
  initialEntry = '/customers/acme-corp',
  routePath = '/customers/$customerSlug',
}: {
  activeTab: string;
  children: ReactNode;
  initialEntry?: string;
  routePath?: string;
}) {
  return (
    <StorybookRouter initialEntries={[initialEntry]} routePath={routePath}>
      <DetailTabsLayout
        topContent={
          <Page.Header>
            <Page.Leading>
              <Page.Heading>
                <Page.TitleRow>
                  <Page.Title>Acme Corp</Page.Title>
                  <Badge variant="default">Active</Badge>
                </Page.TitleRow>
                <Page.Subtitle>
                  Customer detail layout with sticky tab navigation.
                </Page.Subtitle>
              </Page.Heading>
            </Page.Leading>
          </Page.Header>
        }
        tabsContent={
          <DetailTabsNav activeTab={activeTab} items={detailTabs} />
        }
      >
        {children}
      </DetailTabsLayout>
    </StorybookRouter>
  );
}

export const Overview: Story = {
  render: () => (
    <DetailTabsStoryFrame activeTab="overview">
      <div className="grid gap-4 md:grid-cols-2">
        <DetailCard>
          <DetailCard.Header>
            <DetailCard.Title>Contract</DetailCard.Title>
            <DetailCard.Description>
              Current commercial status and owner.
            </DetailCard.Description>
          </DetailCard.Header>
          <DetailCard.Content>
            <DetailCard.Rows>
              <DetailCard.Row label="Plan" value="Enterprise Pro" />
              <DetailCard.Row label="Owner" value="Alex Morgan" />
              <DetailCard.Row label="Renewal" value="Sep 18, 2026" />
            </DetailCard.Rows>
          </DetailCard.Content>
        </DetailCard>
        <DetailCard>
          <DetailCard.Header>
            <DetailCard.Title>Usage</DetailCard.Title>
            <DetailCard.Description>
              Rollup for the selected customer.
            </DetailCard.Description>
          </DetailCard.Header>
          <DetailCard.Content>
            <DetailCard.Rows>
              <DetailCard.Row label="Instances" value="14" />
              <DetailCard.Row label="Feature flags" value="38" />
              <DetailCard.Row label="Alerts" value="3" />
            </DetailCard.Rows>
          </DetailCard.Content>
        </DetailCard>
      </div>
    </DetailTabsStoryFrame>
  ),
};

export const LongScrollableContent: Story = {
  render: () => (
    <DetailTabsStoryFrame
      activeTab="instances"
      initialEntry="/customers/acme-corp/instances"
      routePath="/customers/$customerSlug/instances"
    >
      <div className="grid gap-3">
        {Array.from({ length: 12 }, (_, index) => (
          <DetailCard key={`instance-${index + 1}`}>
            <DetailCard.Header className="min-h-0">
              <DetailCard.Title className="text-base">
                Instance {index + 1}
              </DetailCard.Title>
              <DetailCard.Description>
                Sticky tabs remain visible while the content area scrolls.
              </DetailCard.Description>
            </DetailCard.Header>
          </DetailCard>
        ))}
      </div>
    </DetailTabsStoryFrame>
  ),
};
