import {
  handleGetCustomer,
  handleGetEntitlementsUsageMetrics,
  handleGetInstance,
  handleGetLicense,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListCustomers,
  handleListDeploymentZones,
  handleListEntitlements,
  handleListReleases,
} from '@/api-client/msw.gen';
import type {
  MetadataResourceType,
  MetadataSettingsField,
} from '@/domains/metadata-fields';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import {
  storyCustomers,
  storyDeploymentZones,
  storyEntitlements,
  storyEntitlementUsages,
  storyInstanceMetadataFields,
  storyInstances,
  storyLicenseEntitlements,
  storyLicenses,
  storyOverviewReleases,
  storyReleases,
} from './storybook-fixtures';

/**
 * Handlers the stories share, for `parameters.msw.handlers` (see
 * `.storybook/msw.ts`). A REST endpoint takes its generated handler from
 * `@/api-client/msw.gen` directly, with `onePage` for a list.
 */

/** The body of a list endpoint that holds every item on its first page. */
export const onePage = <T>(items: T[]) => ({
  body: { hasMore: false, items },
});

/**
 * The active metadata fields of each resource type, as the GraphQL
 * `MetadataFields` query serves them. A type left out declares no field: the
 * forms and tables then fall back to raw-JSON metadata.
 */
export const metadataFieldsHandler = (
  fields: Partial<Record<MetadataResourceType, MetadataSettingsField[]>> = {},
) =>
  graphqlOperationHandler({
    MetadataFields: (variables) => ({
      metadataFields: {
        hasMore: false,
        nextCursor: null,
        items: fields[variables?.resourceType as MetadataResourceType] ?? [],
      },
    }),
  });

/**
 * Everything the detail page of the first story instance reads: the instance with
 * its customer and license, the usage and the grants, the catalogues, the zones and
 * releases, and the instance metadata fields. For a story that renders a part of the
 * page under `InstanceDetailProvider`.
 */
export const instanceDetailHandlers = [
  handleGetInstance({ body: storyInstances[0] }),
  handleGetCustomer({ body: storyCustomers[0] }),
  handleGetLicense({ body: storyLicenses[0] }),
  handleGetEntitlementsUsageMetrics({ body: storyEntitlementUsages }),
  handleGetLicenseEntitlements(onePage(storyLicenseEntitlements)),
  handleListEntitlements(onePage(storyEntitlements)),
  handleListDeploymentZones(onePage(storyDeploymentZones)),
  handleListReleases(onePage(storyReleases)),
  handleListCustomers(onePage(storyCustomers)),
  handleGetLicenses(onePage(storyLicenses)),
  graphqlOperationHandler({
    GetReleaseManagementOverview: () => ({
      releases: {
        hasMore: false,
        items: storyOverviewReleases,
        nextCursor: null,
      },
    }),
  }),
  metadataFieldsHandler({ INSTANCE: storyInstanceMetadataFields }),
];
