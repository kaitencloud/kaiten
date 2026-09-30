import { createContext, type PropsWithChildren, use, useMemo } from 'react';
import type { Entitlement } from '@/api-client';
import type { EntitlementDetailContextValue } from './entitlement-detail-context.types';
import { useEntitlementDetailData } from './use-entitlement-detail-data';

export type {
  BucketKey,
  CustomerAggregate,
  EnrichedUsage,
  LicenseAggregate,
  LinkedLicenseMapping,
  UsageStatus,
} from './entitlement-detail-context.types';
export {
  entitlementSaturationBuckets,
  formatLimitOrState,
  formatUsageRatio,
} from './entitlement-detail-context.types';

const EntitlementDetailContext =
  createContext<EntitlementDetailContextValue | null>(null);

export function EntitlementDetailProvider({
  children,
  entitlement,
}: PropsWithChildren<{ entitlement: Entitlement }>) {
  const value = useEntitlementDetailData(entitlement);
  const contextValue = useMemo(
    () => ({ entitlement, ...value }),
    [entitlement, value],
  );

  return (
    <EntitlementDetailContext.Provider value={contextValue}>
      {children}
    </EntitlementDetailContext.Provider>
  );
}

export function useEntitlementDetailContext() {
  const context = use(EntitlementDetailContext);

  if (!context) {
    throw new Error('EntitlementDetailContext is missing');
  }

  return context;
}
