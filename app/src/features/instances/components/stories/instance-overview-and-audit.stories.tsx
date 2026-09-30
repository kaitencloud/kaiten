import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import {
  getLicensesOptions,
  listCustomersOptions,
} from '@/api-client/@tanstack/react-query.gen';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import {
  listDeploymentZonesOptions,
  listReleasesOptions,
} from '@/api-client/@tanstack/react-query.gen';
import {
  storyAuditEntries,
  storyCustomers,
  storyDeploymentZones,
  storyEntitlementUsages,
  storyInstances,
  storyLicenseEntitlements,
  storyLicenses,
  storyOverviewReleases,
  storyReleases,
} from '@/test-fixtures/p0-storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { buildEntitlementsRows } from '../../utils/instance-detail-entitlements.utils';
import {
  customerQueryOptions,
  instanceLicenseEntitlementsQueryOptions,
  instanceQueryOptions,
  instanceUsageQueryOptions,
  licenseQueryOptions,
} from '../../hooks/instance-detail/instance-detail-query-options';
import { InstanceDetailProvider } from '../instance-detail/instance-detail-context';
import { AuditTrailStatsCards } from '../instance-detail/tabs/audit-trail/audit-trail-stats-cards';
import { AuditTrailChartsSection } from '../instance-detail/tabs/audit-trail/audit-trail-charts-section';
import { AuditDetailDialog } from '../instance-detail/tabs/audit-trail/audit-trail-detail-dialog';
import { InstanceDetailOverviewTab } from '../instance-detail/tabs/overview/instance-detail-overview-tab';

const instance = storyInstances[0];
const entitlementsRows = buildEntitlementsRows(
  storyLicenseEntitlements,
  storyEntitlementUsages,
  'Unknown entitlement',
);

const seedInstanceDetailQueries = (queryClient: QueryClient) => {
  queryClient.setQueryData(
    instanceQueryOptions(instance.slug!).queryKey,
    instance,
  );
  queryClient.setQueryData(
    customerQueryOptions(instance.customerSlug).queryKey,
    storyCustomers[0],
  );
  queryClient.setQueryData(
    licenseQueryOptions(instance.licenseSlug).queryKey,
    storyLicenses[0],
  );
  queryClient.setQueryData(
    instanceUsageQueryOptions(instance.slug!).queryKey,
    storyEntitlementUsages,
  );
  queryClient.setQueryData(
    instanceLicenseEntitlementsQueryOptions(instance.licenseSlug).queryKey,
    { hasMore: false, items: storyLicenseEntitlements },
  );
  queryClient.setQueryData(listDeploymentZonesOptions().queryKey, {
    hasMore: false,
    items: storyDeploymentZones,
  });
  queryClient.setQueryData(
    releaseManagementOverviewQueryOptions.queryKey,
    storyOverviewReleases,
  );
  queryClient.setQueryData(listReleasesOptions().queryKey, {
    hasMore: false,
    items: storyReleases,
  });
  queryClient.setQueryData(listCustomersOptions().queryKey, {
    hasMore: false,
    items: storyCustomers,
  });
  queryClient.setQueryData(getLicensesOptions().queryKey, {
    hasMore: false,
    items: storyLicenses,
  });
};

function InstanceDetailStoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <StorybookRouter
      initialEntries={[`/customers/instances/${instance.slug}`]}
      routePath="/customers/instances/$instanceSlug"
      seed={seedInstanceDetailQueries}
    >
      <div className="min-h-screen p-6">{children}</div>
    </StorybookRouter>
  );
}

const meta = {
  title: 'Features/Instances/OverviewAndAudit',
  component: InstanceDetailOverviewTab,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof InstanceDetailOverviewTab>;

export default meta;
type Story = StoryObj<typeof InstanceDetailOverviewTab>;

export const OverviewCards: Story = {
  render: () => (
    <InstanceDetailStoryFrame>
      <InstanceDetailProvider instanceId={instance.slug!}>
        <InstanceDetailOverviewTab />
      </InstanceDetailProvider>
    </InstanceDetailStoryFrame>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Instance overview tab with instance, license, release and metadata cards, all backed by seeded query data.',
      },
    },
  },
};

export const AuditCharts: Story = {
  render: () => (
    <InstanceDetailStoryFrame>
      <div className="space-y-5">
        <AuditTrailStatsCards entries={storyAuditEntries} />
        <AuditTrailChartsSection
          entitlementsRows={entitlementsRows}
          entries={storyAuditEntries}
          locale="en-US"
        />
      </div>
    </InstanceDetailStoryFrame>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Instance audit-trail stats, activity timeline and value-over-time charts with number and boolean entitlement data.',
      },
    },
  },
};

export const AuditDetail: Story = {
  render: () => (
    <InstanceDetailStoryFrame>
      <div className="flex min-h-[320px] items-center justify-center">
        <AuditDetailDialog
          entry={storyAuditEntries[2]}
          entitlementsRows={entitlementsRows}
          instanceName={instance.name}
        />
      </div>
    </InstanceDetailStoryFrame>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Audit detail dialog trigger for a rejected usage event, including entitlement metadata and payload JSON.',
      },
    },
  },
};
