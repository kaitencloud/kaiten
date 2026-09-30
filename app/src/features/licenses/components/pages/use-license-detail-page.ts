import {
  type QueryClient,
  useMutation,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import type { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  associateEntitlementWithLicenseMutation,
  deleteLicenseEntitlementMutation,
  updateLicenseEntitlementMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  entitlementsQueryOptions,
  invalidateLicenseQueries,
  licenseEntitlementsQueryOptions,
} from '../../queries';
import { getEntitlementSlug, resolveLicenseEntitlements } from '../../utils';

export function useLicenseDetailData(licenseSlug: string) {
  const { data: entitlementsData } = useSuspenseQuery(entitlementsQueryOptions);
  const { data: licenseEntitlementsData } = useSuspenseQuery(
    licenseEntitlementsQueryOptions(licenseSlug),
  );
  const entitlements = useMemo(
    () => entitlementsData?.items ?? [],
    [entitlementsData],
  );
  const licenseEntitlements = useMemo(
    () => licenseEntitlementsData?.items ?? [],
    [licenseEntitlementsData],
  );
  const entitlementSlugById = useMemo(
    () =>
      new Map(
        entitlements.map((entitlement) => [
          entitlement.id,
          getEntitlementSlug(entitlement),
        ]),
      ),
    [entitlements],
  );
  const resolvedEntitlements = useMemo(
    () => resolveLicenseEntitlements(licenseEntitlements, entitlements),
    [entitlements, licenseEntitlements],
  );

  return {
    entitlements,
    entitlementSlugById,
    resolvedEntitlements,
  };
}

// The entitlement grants of the page's version. Its default and lifecycle
// actions live with their controls (useLicenseDefault and
// useLicenseLifecycleTransition), shared with the versions table.
export function useLicenseDetailMutations({
  licenseSlug,
  queryClient,
  t,
}: {
  licenseSlug: string;
  queryClient: QueryClient;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const addEntitlementMutation = useMutation({
    ...associateEntitlementWithLicenseMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, licenseSlug);
      toast.success(t('Pages.Licenses.Detail.Toasts.addEntitlementSuccess'));
    },
    onError: () => {
      toast.error(t('Pages.Licenses.Detail.Toasts.addEntitlementError'));
    },
  });
  const updateEntitlementMutation = useMutation({
    ...updateLicenseEntitlementMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, licenseSlug);
      toast.success(t('Pages.Licenses.Detail.Toasts.updateEntitlementSuccess'));
    },
    onError: () => {
      toast.error(t('Pages.Licenses.Detail.Toasts.updateEntitlementError'));
    },
  });
  const deleteEntitlementMutation = useMutation({
    ...deleteLicenseEntitlementMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, licenseSlug);
      toast.success(t('Pages.Licenses.Detail.Toasts.removeEntitlementSuccess'));
    },
    onError: () => {
      toast.error(t('Pages.Licenses.Detail.Toasts.removeEntitlementError'));
    },
  });

  return {
    addEntitlementMutation,
    deleteEntitlementMutation,
    updateEntitlementMutation,
  };
}
