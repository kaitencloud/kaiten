import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import type { Entitlement } from '@/api-client';
import { getApiErrorMessage } from '@/lib/errors';
import type { useLicenseEntitlementsDraft } from '../../hooks/use-license-entitlements-draft';
import { licenseEntitlementsQueryOptions } from '../../queries';
import { resolveLicenseEntitlements } from '../../utils';

// What a new version starts with: the grants of the base version. They are on the
// draft at the first render when the route's loader has read them, and asked for once
// the form is on screen when it has not, or when the person picks another base.

type SyncDraftEntitlementsFromBaseOptions = {
  entitlements: Entitlement[];
  queryClient: QueryClient;
  resetDraftEntitlements: () => void;
  setDraftEntitlements: ReturnType<
    typeof useLicenseEntitlementsDraft
  >['setDraftEntitlements'];
};

export function useSyncDraftEntitlementsFromBase({
  entitlements,
  queryClient,
  resetDraftEntitlements,
  setDraftEntitlements,
}: SyncDraftEntitlementsFromBaseOptions) {
  return useCallback(
    async (baseLicenseSlug: string) => {
      if (!baseLicenseSlug) {
        resetDraftEntitlements();
        return;
      }

      try {
        const baseEntitlements = await queryClient.fetchQuery(
          licenseEntitlementsQueryOptions(baseLicenseSlug),
        );
        setDraftEntitlements(
          resolveLicenseEntitlements(
            baseEntitlements?.items ?? [],
            entitlements,
          ),
        );
      } catch (error) {
        toast.error(getApiErrorMessage(error));
        resetDraftEntitlements();
      }
    },
    [entitlements, queryClient, resetDraftEntitlements, setDraftEntitlements],
  );
}

// The grants of the base version, as the draft holds them, when they have been read
// already: the route's loader reads them for the version the form starts from.
export function getReadBaseEntitlements(
  queryClient: QueryClient,
  baseLicenseSlug: string,
  entitlements: Entitlement[],
) {
  if (!baseLicenseSlug) {
    return undefined;
  }
  const read = queryClient.getQueryData(
    licenseEntitlementsQueryOptions(baseLicenseSlug).queryKey,
  );

  return read
    ? resolveLicenseEntitlements(read.items ?? [], entitlements)
    : undefined;
}

// Marks the base as initialized, and asks for its grants unless the draft started
// with them (`startedWithBase`).
export function useInitializeBaseEntitlements({
  hasInitializedBaseEntitlements,
  initialBaseLicenseSlug,
  initializeBaseEntitlements,
  startedWithBase,
  syncDraftEntitlementsFromBase,
}: {
  hasInitializedBaseEntitlements: boolean;
  initialBaseLicenseSlug: string;
  initializeBaseEntitlements: (baseLicenseSlug: string) => void;
  startedWithBase: boolean;
  syncDraftEntitlementsFromBase: (baseLicenseSlug: string) => Promise<void>;
}) {
  useEffect(() => {
    if (hasInitializedBaseEntitlements || !initialBaseLicenseSlug) {
      return;
    }

    initializeBaseEntitlements(initialBaseLicenseSlug);
    if (!startedWithBase) {
      void syncDraftEntitlementsFromBase(initialBaseLicenseSlug);
    }
  }, [
    hasInitializedBaseEntitlements,
    initialBaseLicenseSlug,
    initializeBaseEntitlements,
    startedWithBase,
    syncDraftEntitlementsFromBase,
  ]);
}
