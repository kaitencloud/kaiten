import { requireAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import type { QueryClient } from '@tanstack/react-query';
import {
  getEntitlementsUsageMetricsQueryKey,
  listEntitlementExceptionsOptions,
  listEntitlementExceptionsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';

export const entitlementExceptionsQueryOptions = (instanceSlug: string) => ({
  ...listEntitlementExceptionsOptions({
    path: { instanceSlug },
    query: { filter: 'all' },
  }),
  retry: false,
  // Status and effective values are evaluated at read time; a window can close without a write.
  refetchInterval: 30_000,
});

export async function invalidateEntitlementExceptions(
  queryClient: QueryClient,
  instanceSlug: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: listEntitlementExceptionsQueryKey({ path: { instanceSlug } }),
    }),
    queryClient.invalidateQueries({
      queryKey: getEntitlementsUsageMetricsQueryKey({ path: { instanceSlug } }),
    }),
  ]);
}

/** Classify generic targets before mounting an operational AI dialog. */
export async function requireExceptionAccess(
  queryClient: QueryClient,
  instanceSlug: string,
  exceptionId: string,
) {
  const rows = await queryClient.ensureQueryData(
    entitlementExceptionsQueryOptions(instanceSlug),
  );
  const target = rows.find((row) => row.id === exceptionId);
  if (isAiEntitlement(target?.entitlementType))
    await requireAiAccess(queryClient);
}
