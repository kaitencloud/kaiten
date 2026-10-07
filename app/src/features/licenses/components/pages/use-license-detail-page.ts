import {
  type QueryClient,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  associateEntitlementWithLicenseMutation,
  deleteLicenseEntitlementMutation,
  updateLicenseEntitlementMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { getProblem, handleBillingProblem } from '@/domains/billing';
import {
  entitlementsQueryOptions,
  invalidateLicenseQueries,
  licenseEntitlementsQueryOptions,
} from '../../queries';
import { getVersionFreezeReason } from '../../utils/license-freeze.utils';
import {
  buildAssociateLicenseEntitlementBody,
  buildUpdateLicenseEntitlementBody,
  getEntitlementSlug,
  resolveLicenseEntitlements,
  toEditableEntitlementType,
} from '../../utils';
import type { AddEntitlementPayload } from '../entitlements/license-entitlements-card';

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
  onFrozen,
  queryClient,
  t,
}: {
  licenseSlug: string;
  /** The API refused because a live subscription bills the version. */
  onFrozen?: (error: unknown) => void;
  queryClient: QueryClient;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  // A grant of a billed version cannot change: that is not a failure to report
  // with a toast, it is what a new version is for, so it is told apart and the
  // page offers it.
  const fail = (error: unknown, messageKey: string) => {
    if (onFrozen && getVersionFreezeReason(handleBillingProblem(error).code)) {
      onFrozen(error);

      return;
    }
    // The API says why a change to a grant is refused (an active price meters
    // it: deprecate the price first), which is what the person needs; the
    // generic line is for a failure that says nothing.
    toast.error(getProblem(error)?.detail ?? t(messageKey));
  };
  const addEntitlementMutation = useMutation({
    ...associateEntitlementWithLicenseMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, licenseSlug);
      toast.success(t('Pages.Licenses.Detail.Toasts.addEntitlementSuccess'));
    },
    onError: (error) => {
      fail(error, 'Pages.Licenses.Detail.Toasts.addEntitlementError');
    },
  });
  const updateEntitlementMutation = useMutation({
    ...updateLicenseEntitlementMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, licenseSlug);
      toast.success(t('Pages.Licenses.Detail.Toasts.updateEntitlementSuccess'));
    },
    onError: (error) => {
      fail(error, 'Pages.Licenses.Detail.Toasts.updateEntitlementError');
    },
  });
  const deleteEntitlementMutation = useMutation({
    ...deleteLicenseEntitlementMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, licenseSlug);
      toast.success(t('Pages.Licenses.Detail.Toasts.removeEntitlementSuccess'));
    },
    onError: (error) => {
      fail(error, 'Pages.Licenses.Detail.Toasts.removeEntitlementError');
    },
  });

  return {
    addEntitlementMutation,
    deleteEntitlementMutation,
    updateEntitlementMutation,
  };
}

type LicenseGrantsOptions = {
  licenseSlug: string;
  /** The API refused because a live subscription bills the version. */
  onFrozen: (error: unknown) => void;
};

/**
 * What the Overview tab of a version does with its grants: the ones it shows, and
 * what adding, editing, opening and removing one asks of the API. A refusal is
 * reported by the mutation that made the request, so none of these leaks it.
 */
export function useLicenseGrants({
  licenseSlug,
  onFrozen,
}: LicenseGrantsOptions) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { entitlements, entitlementSlugById, resolvedEntitlements } =
    useLicenseDetailData(licenseSlug);
  const {
    addEntitlementMutation,
    deleteEntitlementMutation,
    updateEntitlementMutation,
  } = useLicenseDetailMutations({ licenseSlug, onFrozen, queryClient, t });

  const onAddEntitlement = useCallback(
    (payload: AddEntitlementPayload) => {
      const entitlementSlug = entitlementSlugById.get(payload.entitlementId);
      if (!entitlementSlug) {
        toast.error(t('Pages.Licenses.Detail.Toasts.addEntitlementError'));
        return Promise.resolve();
      }

      const entitlementType =
        typeof payload.threshold === 'number'
          ? 'NUMBER'
          : toEditableEntitlementType(payload.entitlementType);

      return addEntitlementMutation.mutateAsync({
        body: buildAssociateLicenseEntitlementBody(entitlementSlug, {
          configValue: payload.configValue,
          enabled: payload.enabled ?? null,
          entitlementType,
          limitCapExceededOveragePercent:
            payload.limitCapExceededOveragePercent,
          threshold: payload.threshold ?? null,
        }),
        path: { licenseSlug },
      });
    },
    [addEntitlementMutation, entitlementSlugById, licenseSlug, t],
  );

  const onUpdateEntitlementGrant = useCallback(
    (
      entitlementId: string,
      threshold: number,
      limitCapExceededOveragePercent: number,
    ) =>
      updateEntitlementMutation.mutateAsync({
        body: buildUpdateLicenseEntitlementBody(
          threshold,
          limitCapExceededOveragePercent,
        ),
        path: {
          entitlementSlug:
            entitlementSlugById.get(entitlementId) ?? entitlementId,
          licenseSlug,
        },
      }),
    [entitlementSlugById, licenseSlug, updateEntitlementMutation],
  );

  const onClickEntitlement = useCallback(
    (entitlementSlug: string) => {
      void router.navigate({ to: `/entitlements/${entitlementSlug}` });
    },
    [router],
  );

  // A removal is asked once and answered by a toast or a dialog: nothing waits
  // on it, so it does not hand a refusal back to a caller that has no use for it.
  const onDeleteEntitlement = useCallback(
    (entitlementId: string) => {
      deleteEntitlementMutation.mutate({
        path: {
          entitlementSlug:
            entitlementSlugById.get(entitlementId) ?? entitlementId,
          licenseSlug,
        },
      });
    },
    [deleteEntitlementMutation, entitlementSlugById, licenseSlug],
  );

  return {
    entitlements,
    onAddEntitlement,
    onClickEntitlement,
    onDeleteEntitlement,
    onUpdateEntitlementGrant,
    rows: resolvedEntitlements,
  };
}
