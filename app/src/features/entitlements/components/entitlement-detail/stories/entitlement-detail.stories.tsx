import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import {
  getEntitlementsUsageMetricsOptions,
  getInstancesOptions,
  getLicenseEntitlementsOptions,
  getLicensesOptions,
  listCustomersOptions,
} from '@/api-client/@tanstack/react-query.gen';
import {
  storyCustomers,
  storyEntitlements,
  storyEntitlementUsages,
  storyInstances,
  storyLicenseEntitlements,
  storyLicenses,
} from '@/test-fixtures/storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { EntitlementDetailOverview } from '../entitlement-detail-overview';
import { EntitlementDetailPageContent } from '../entitlement-detail-page-content';

const entitlement = storyEntitlements[0];

const seedEntitlementDetailQueries = (queryClient: QueryClient) => {
  queryClient.setQueryData(getLicensesOptions().queryKey, {
    hasMore: false,
    items: storyLicenses,
  });
  queryClient.setQueryData(getInstancesOptions().queryKey, {
    hasMore: false,
    items: storyInstances,
  });
  queryClient.setQueryData(listCustomersOptions().queryKey, {
    hasMore: false,
    items: storyCustomers,
  });

  for (const license of storyLicenses) {
    queryClient.setQueryData(
      getLicenseEntitlementsOptions({
        path: { licenseSlug: license.slug! },
      }).queryKey,
      {
        hasMore: false,
        items:
          license.slug === storyLicenses[0].slug
            ? storyLicenseEntitlements
            : [],
      },
    );
  }

  for (const instance of storyInstances) {
    queryClient.setQueryData(
      getEntitlementsUsageMetricsOptions({
        path: { instanceSlug: instance.slug! },
      }).queryKey,
      instance.slug === storyInstances[0].slug ? storyEntitlementUsages : [],
    );
  }
};

const meta = {
  title: 'Features/Entitlements/EntitlementDetailPageContent',
  component: EntitlementDetailPageContent,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EntitlementDetailPageContent>;

export default meta;
type Story = StoryObj<typeof EntitlementDetailPageContent>;

export const Overview: Story = {
  render: () => (
    <StorybookRouter
      initialEntries={[`/entitlements/${entitlement.slug}`]}
      routePath="/entitlements/$entitlementSlug"
      seed={seedEntitlementDetailQueries}
    >
      <EntitlementDetailPageContent
        entitlement={entitlement}
        entitlementSlug={entitlement.slug!}
      >
        <EntitlementDetailOverview />
      </EntitlementDetailPageContent>
    </StorybookRouter>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Entitlement detail overview with header, stats, tabs, general card and linked licenses.',
      },
    },
  },
};
