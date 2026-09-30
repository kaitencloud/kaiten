import {
  type GetFeatureFlagsResponse,
  type GetInstancesResponse,
  type GetLicenseEntitlementsResponse,
  type GetLicensesResponse,
  getFeatureFlags,
  getInstances,
  getLicenseEntitlements,
  getLicenses,
  type ListComponentsResponse,
  type ListCustomersResponse,
  type ListDeploymentZonesResponse,
  type ListEntitlementGroupsResponse,
  type ListEntitlementsResponse,
  type ListLicenseFamiliesResponse,
  type ListReleasesResponse,
  listComponents,
  listCustomers,
  listDeploymentZones,
  listEntitlementGroups,
  listEntitlements,
  listLicenseFamilies,
  listReleases,
} from '@/api-client';
import {
  getFeatureFlagsOptions,
  getInstancesOptions,
  getLicenseEntitlementsOptions,
  getLicensesOptions,
  listComponentsOptions,
  listCustomersOptions,
  listDeploymentZonesOptions,
  listEntitlementGroupsOptions,
  listEntitlementsOptions,
  listLicenseFamiliesOptions,
  listReleasesOptions,
} from '@/api-client/@tanstack/react-query.gen';
import { fetchAllPages, MAX_PAGE_SIZE } from './pagination';

// Each of these keeps the query key of the generated first-page options, so
// every invalidation and cache update aimed at that key still lands: only the
// fetch changes, and walks every page. Screens read these lists through here,
// never through the generated options, or the cache would hold a first page
// where a whole list is expected.

type QueryContext = { signal: AbortSignal };

const pageRequest = (cursor: string | undefined, signal: AbortSignal) => ({
  query: { cursor, limit: MAX_PAGE_SIZE },
  signal,
  throwOnError: true as const,
});

export const allComponentsOptions = () => ({
  ...listComponentsOptions(),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<ListComponentsResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (await listComponents(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allCustomersOptions = () => ({
  ...listCustomersOptions(),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<ListCustomersResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) => (await listCustomers(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allDeploymentZonesOptions = () => ({
  ...listDeploymentZonesOptions(),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<ListDeploymentZonesResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (await listDeploymentZones(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allEntitlementGroupsOptions = () => ({
  ...listEntitlementGroupsOptions(),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<ListEntitlementGroupsResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (await listEntitlementGroups(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allEntitlementsOptions = () => ({
  ...listEntitlementsOptions(),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<ListEntitlementsResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (await listEntitlements(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allFeatureFlagsOptions = () => ({
  ...getFeatureFlagsOptions(),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<GetFeatureFlagsResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (await getFeatureFlags(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allInstancesOptions = () => ({
  ...getInstancesOptions(),
  queryFn: async ({ signal }: QueryContext): Promise<GetInstancesResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) => (await getInstances(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allLicenseEntitlementsOptions = (licenseSlug: string) => ({
  ...getLicenseEntitlementsOptions({ path: { licenseSlug } }),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<GetLicenseEntitlementsResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (
          await getLicenseEntitlements({
            ...pageRequest(cursor, signal),
            path: { licenseSlug },
          })
        ).data,
    ),
  }),
});

export const allLicenseFamiliesOptions = () => ({
  ...listLicenseFamiliesOptions(),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<ListLicenseFamiliesResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (await listLicenseFamilies(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allLicensesOptions = () => ({
  ...getLicensesOptions(),
  queryFn: async ({ signal }: QueryContext): Promise<GetLicensesResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) => (await getLicenses(pageRequest(cursor, signal))).data,
    ),
  }),
});

export const allReleasesOptions = () => ({
  ...listReleasesOptions(),
  queryFn: async ({ signal }: QueryContext): Promise<ListReleasesResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) => (await listReleases(pageRequest(cursor, signal))).data,
    ),
  }),
});
