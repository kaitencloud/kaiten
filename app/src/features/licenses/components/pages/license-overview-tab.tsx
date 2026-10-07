import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  buildAssociateLicenseEntitlementBody,
  buildUpdateLicenseEntitlementBody,
  toEditableEntitlementType,
} from '../../utils';
import { licenseQueryOptions } from '../../queries';
import {
  type AddEntitlementPayload,
  LicenseEntitlementsCard,
} from '../entitlements/license-entitlements-card';
import { LicenseDetailsCard } from './license-details-card';
import {
  useLicenseDetailData,
  useLicenseDetailMutations,
} from './use-license-detail-page';

type LicenseOverviewTabProps = {
  licenseSlug: string;
};

/**
 * The Overview tab of a license version: its details and the entitlements it
 * grants, which are edited in place.
 */
export function LicenseOverviewTab({ licenseSlug }: LicenseOverviewTabProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));
  const { entitlements, entitlementSlugById, resolvedEntitlements } =
    useLicenseDetailData(licenseSlug);
  const {
    addEntitlementMutation,
    deleteEntitlementMutation,
    updateEntitlementMutation,
  } = useLicenseDetailMutations({
    licenseSlug,
    queryClient,
    t,
  });

  const handleAddEntitlement = useCallback(
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

  const handleUpdateEntitlementGrant = useCallback(
    (
      entitlementId: string,
      threshold: number,
      limitCapExceededOveragePercent: number,
    ) => {
      const resolvedEntitlementSlug =
        entitlementSlugById.get(entitlementId) ?? entitlementId;

      return updateEntitlementMutation.mutateAsync({
        body: buildUpdateLicenseEntitlementBody(
          threshold,
          limitCapExceededOveragePercent,
        ),
        path: {
          entitlementSlug: resolvedEntitlementSlug,
          licenseSlug,
        },
      });
    },
    [entitlementSlugById, licenseSlug, updateEntitlementMutation],
  );

  const handleClickEntitlement = useCallback(
    (entitlementSlug: string) => {
      void router.navigate({ to: `/entitlements/${entitlementSlug}` });
    },
    [router],
  );

  const handleDeleteEntitlement = useCallback(
    (entitlementId: string) =>
      deleteEntitlementMutation.mutateAsync({
        path: {
          entitlementSlug:
            entitlementSlugById.get(entitlementId) ?? entitlementId,
          licenseSlug,
        },
      }),
    [deleteEntitlementMutation, entitlementSlugById, licenseSlug],
  );

  return (
    <div className="space-y-6">
      <LicenseDetailsCard
        license={license}
        onDraftDeleted={() => router.navigate({ to: '/licenses' })}
        t={t}
      />

      <LicenseEntitlementsCard
        entitlements={entitlements}
        rows={resolvedEntitlements}
        onAddEntitlement={handleAddEntitlement}
        onClickEntitlement={handleClickEntitlement}
        onUpdateEntitlementGrant={handleUpdateEntitlementGrant}
        onDeleteEntitlement={handleDeleteEntitlement}
      />
    </div>
  );
}
