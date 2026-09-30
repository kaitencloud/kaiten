import type { QueryClient } from '@tanstack/react-query';
import {
  customerQueryOptions,
  instanceLicenseEntitlementsQueryOptions,
  instanceQueryOptions,
  instanceUsageQueryOptions,
  licenseQueryOptions,
} from './instance-detail-query-options';

/**
 * Route-loader prefetch mirroring `useInstanceDetailData`: resolves the
 * instance first (its slugs drive the dependent queries), then warms the rest
 * in parallel so the component's `useSuspenseQuery` chain never waterfalls.
 */
export async function ensureInstanceDetailData(
  queryClient: QueryClient,
  instanceSlug: string,
) {
  const instance = await queryClient.ensureQueryData(
    instanceQueryOptions(instanceSlug),
  );

  await Promise.all([
    queryClient.ensureQueryData(customerQueryOptions(instance.customerSlug)),
    queryClient.ensureQueryData(licenseQueryOptions(instance.licenseSlug)),
    queryClient.ensureQueryData(instanceUsageQueryOptions(instanceSlug)),
    queryClient.ensureQueryData(
      instanceLicenseEntitlementsQueryOptions(instance.licenseSlug),
    ),
  ]);
}
