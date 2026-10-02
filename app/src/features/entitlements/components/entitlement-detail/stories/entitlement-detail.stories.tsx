import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse } from 'msw/http';
import {
  handleGetEntitlementsUsageMetrics,
  handleGetInstances,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListCustomers,
} from '@/api-client/msw.gen';
import {
  storyCustomers,
  storyEntitlements,
  storyEntitlementUsages,
  storyInstances,
  storyLicenseEntitlements,
  storyLicenses,
} from '@/test-fixtures/storybook-fixtures';
import { onePage } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { EntitlementDetailOverview } from '../entitlement-detail-overview';
import { EntitlementDetailPageContent } from '../entitlement-detail-page-content';

const entitlement = storyEntitlements[0];

const meta = {
  title: 'Features/Entitlements/EntitlementDetailPageContent',
  component: EntitlementDetailPageContent,
  parameters: {
    layout: 'fullscreen',
    msw: {
      // The first license grants the entitlement and the first instance
      // reports its usage; the others have neither.
      handlers: [
        handleGetLicenses(onePage(storyLicenses)),
        handleGetInstances(onePage(storyInstances)),
        handleListCustomers(onePage(storyCustomers)),
        handleGetLicenseEntitlements(({ params }) =>
          HttpResponse.json({
            hasMore: false,
            items:
              params.licenseSlug === storyLicenses[0].slug
                ? storyLicenseEntitlements
                : [],
          }),
        ),
        handleGetEntitlementsUsageMetrics(({ params }) =>
          HttpResponse.json(
            params.instanceSlug === storyInstances[0].slug
              ? storyEntitlementUsages
              : [],
          ),
        ),
      ],
    },
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
