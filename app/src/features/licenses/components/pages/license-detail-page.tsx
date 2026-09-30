import { useRouteContext } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { License } from '@/api-client';
import { Page } from '@/functionals/page';
import {
  buildAssociateLicenseEntitlementBody,
  buildUpdateLicenseEntitlementBody,
  toEditableEntitlementType,
} from '../../utils';
import {
  type AddEntitlementPayload,
  LicenseEntitlementsCard,
} from '../entitlements/license-entitlements-card';
import { LicenseDetailsCard } from './license-details-card';
import {
  useLicenseDetailData,
  useLicenseDetailMutations,
} from './use-license-detail-page';

type LicenseDetailPageProps = {
  license: License;
  licenseSlug: string;
};

export function LicenseDetailPage({
  license,
  licenseSlug,
}: LicenseDetailPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: '__root__' });
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
    <Page className="space-y-6">
      <Page.Header>
        <Page.Title>{license.name}</Page.Title>
      </Page.Header>
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
    </Page>
  );
}
