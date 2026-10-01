import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, Gauge, PackageCheck, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/functionals/stat-card';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { ReleaseManagementPageShell } from '../release-management-page-shell';
import { ReleaseManagementTabs } from '../release-management-tabs';

const meta = {
  title: 'Functionals/ReleaseManagement',
  component: ReleaseManagementPageShell,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ReleaseManagementPageShell>;

export default meta;
type Story = StoryObj<typeof ReleaseManagementPageShell>;

const releaseStats = (
  <StatCard.Row columnsClassName="md:grid-cols-3">
    <StatCard>
      <StatCard.Label>Releases</StatCard.Label>
      <StatCard.Icon>
        <CalendarDays />
      </StatCard.Icon>
      <StatCard.Value>18</StatCard.Value>
      <StatCard.Helper>4 promoted this month</StatCard.Helper>
    </StatCard>
    <StatCard>
      <StatCard.Label>Components</StatCard.Label>
      <StatCard.Icon>
        <PackageCheck />
      </StatCard.Icon>
      <StatCard.Value>42</StatCard.Value>
      <StatCard.Helper>31 deployed</StatCard.Helper>
    </StatCard>
    <StatCard>
      <StatCard.Label>Zones</StatCard.Label>
      <StatCard.Icon>
        <Gauge />
      </StatCard.Icon>
      <StatCard.Value>6</StatCard.Value>
      <StatCard.Helper>5 production-ready</StatCard.Helper>
    </StatCard>
  </StatCard.Row>
);

function ReleaseManagementStoryFrame({
  children,
  initialEntry = '/releases',
  routePath = '/releases',
}: {
  children: ReactNode;
  initialEntry?: string;
  routePath?: string;
}) {
  return (
    <StorybookRouter initialEntries={[initialEntry]} routePath={routePath}>
      {children}
    </StorybookRouter>
  );
}

const releaseContent = (
  <Card className="mt-6 h-full min-h-[320px]">
    <CardHeader>
      <CardTitle>Release candidates</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-3">
      {['2026.04.1', '2026.04.0', '2026.03.3'].map((version) => (
        <div
          key={version}
          className="flex items-center justify-between rounded-md border p-3 text-sm"
        >
          <span className="font-medium">{version}</span>
          <span className="text-muted-foreground">Ready for promotion</span>
        </div>
      ))}
    </CardContent>
  </Card>
);

export const TabsOnly: Story = {
  render: () => (
    <ReleaseManagementStoryFrame
      initialEntry="/releases/components"
      routePath="/releases/components"
    >
      <div className="p-6">
        <ReleaseManagementTabs />
      </div>
    </ReleaseManagementStoryFrame>
  ),
};

export const PageShell: Story = {
  render: () => (
    <ReleaseManagementStoryFrame>
      <ReleaseManagementPageShell
        iconKey="release"
        title="Releases"
        subtitle="Promote versions through deployment zones and linked components."
        stats={releaseStats}
        content={releaseContent}
      >
        <Button className="fixed right-6 bottom-6 gap-2">
          <Plus className="size-4" />
          New release
        </Button>
      </ReleaseManagementPageShell>
    </ReleaseManagementStoryFrame>
  ),
};

export const ComponentsSection: Story = {
  render: () => (
    <ReleaseManagementStoryFrame
      initialEntry="/releases/components"
      routePath="/releases/components"
    >
      <ReleaseManagementPageShell
        iconKey="component"
        title="Components"
        subtitle="Catalog of deployable components and versions."
        content={releaseContent}
      />
    </ReleaseManagementStoryFrame>
  ),
};
