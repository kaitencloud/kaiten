import { type QueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { Entitlement, License, LicenseFamilyView } from '@/api-client';
import { useAppForm } from '@/hooks/form';
import { useLicenseEntitlementsDraft } from '../../hooks/use-license-entitlements-draft';
import { useLicenseSave } from '../../hooks/use-license-save';
import { useLicenseVersionFormStore } from '../../hooks/use-license-version-form-store';
import {
  entitlementsQueryOptions,
  invalidateLicenseQueries,
  licenseEntitlementsQueryOptions,
} from '../../queries';
import { resolveLicenseEntitlements } from '../../utils';
import {
  licenseVersionFormSchema,
  licenseVersionFormValuesToLicenseInput,
} from './license-version-form.schema';
import { useLicenseVersionFormOptions } from './use-license-version-form-options';

type UseLicenseVersionFormOptions = {
  availableFamilies: LicenseFamilyView[];
  availableLicenses: License[];
  baseLicense?: License;
  onCancel?: () => void;
  onSuccess?: () => void;
  selectedLicenseSlug?: string;
};

type SyncDraftEntitlementsFromBaseOptions = {
  entitlements: Entitlement[];
  queryClient: QueryClient;
  resetDraftEntitlements: () => void;
  setDraftEntitlements: ReturnType<
    typeof useLicenseEntitlementsDraft
  >['setDraftEntitlements'];
};

function useSyncDraftEntitlementsFromBase({
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

function getSelectedLicenseVersionsWithSlug(
  selectedLicenseVersions: License[],
) {
  return selectedLicenseVersions.filter(
    (license): license is License & { slug: string } => Boolean(license.slug),
  );
}

function getInheritedType(
  availableLicenses: License[],
  initialBaseLicenseSlug: string,
  selectedBaseLicenseSlug: string,
) {
  return availableLicenses.find(
    (license) =>
      license.slug === (selectedBaseLicenseSlug || initialBaseLicenseSlug),
  )?.type;
}

function handleLicenseVersionFormCancel({
  onCancel,
  router,
}: {
  onCancel?: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (onCancel) {
    onCancel();
    return;
  }

  router.navigate({ to: '/licenses' });
}

function useInitializeBaseEntitlements({
  hasInitializedBaseEntitlements,
  initialBaseLicenseSlug,
  initializeBaseEntitlements,
  syncDraftEntitlementsFromBase,
}: {
  hasInitializedBaseEntitlements: boolean;
  initialBaseLicenseSlug: string;
  initializeBaseEntitlements: (baseLicenseSlug: string) => void;
  syncDraftEntitlementsFromBase: (baseLicenseSlug: string) => Promise<void>;
}) {
  useEffect(() => {
    if (hasInitializedBaseEntitlements || !initialBaseLicenseSlug) {
      return;
    }

    initializeBaseEntitlements(initialBaseLicenseSlug);
    void syncDraftEntitlementsFromBase(initialBaseLicenseSlug);
  }, [
    hasInitializedBaseEntitlements,
    initialBaseLicenseSlug,
    initializeBaseEntitlements,
    syncDraftEntitlementsFromBase,
  ]);
}

export function useLicenseVersionForm({
  availableFamilies,
  availableLicenses,
  baseLicense,
  onCancel,
  onSuccess,
  selectedLicenseSlug,
}: UseLicenseVersionFormOptions) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    addDraftEntitlement,
    draftEntitlements,
    removeDraftEntitlement,
    resetDraftEntitlements,
    setDraftEntitlements,
    updateDraftEntitlementGrant,
  } = useLicenseEntitlementsDraft();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const { data: entitlementsData } = useSuspenseQuery(entitlementsQueryOptions);
  const entitlements = entitlementsData?.items ?? [];
  const { createLicenseWithGrants } = useLicenseSave(entitlements);
  const { familyOptions, initialValues, licensesByFamily } =
    useLicenseVersionFormOptions({
      availableFamilies,
      availableLicenses,
      baseLicense,
      selectedLicenseSlug,
    });

  const {
    hasInitializedBaseEntitlements,
    selectedBaseLicenseSlug,
    initializeBaseEntitlements,
    setSelectedBaseLicenseSlug,
  } = useLicenseVersionFormStore(initialValues.baseLicenseSlug);

  const syncDraftEntitlementsFromBase = useSyncDraftEntitlementsFromBase({
    entitlements,
    queryClient,
    resetDraftEntitlements,
    setDraftEntitlements,
  });
  useInitializeBaseEntitlements({
    hasInitializedBaseEntitlements,
    initialBaseLicenseSlug: initialValues.baseLicenseSlug,
    initializeBaseEntitlements,
    syncDraftEntitlementsFromBase,
  });

  const form = useAppForm({
    defaultValues: initialValues,
    validators: {
      onChange: licenseVersionFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const selectedBaseLicense = availableLicenses.find(
          (license) => license.slug === value.baseLicenseSlug,
        );

        if (!selectedBaseLicense) {
          throw new Error(
            t('Pages.Licenses.Version.Form.Errors.baseLicenseNotFound'),
          );
        }

        const { error, license } = await createLicenseWithGrants({
          body: licenseVersionFormValuesToLicenseInput(
            value,
            selectedBaseLicense,
          ),
          draftEntitlements,
        });
        await invalidateLicenseQueries(queryClient);

        // The version exists but stayed a draft: a grant or the publish
        // failed. Its own page is where the vendor finishes it.
        if (error) {
          toast.error(
            t('Pages.Licenses.Mutation.Form.Errors.savedAsDraft', {
              reason: getApiErrorMessage(error),
            }),
          );
          if (license.slug) {
            router.navigate({
              to: '/licenses/$licenseSlug',
              params: { licenseSlug: license.slug },
            });
            return;
          }
        }

        if (onSuccess) {
          onSuccess();
          return;
        }

        router.navigate({ to: '/licenses' });
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  const selectedFamilyId =
    form.state.values.selectedFamilyId || initialValues.selectedFamilyId;
  const selectedLicenseVersionsWithSlug = useMemo(
    () =>
      getSelectedLicenseVersionsWithSlug(
        licensesByFamily.get(selectedFamilyId) ?? [],
      ),
    [licensesByFamily, selectedFamilyId],
  );
  const inheritedType = useMemo(
    () =>
      getInheritedType(
        availableLicenses,
        initialValues.baseLicenseSlug,
        selectedBaseLicenseSlug,
      ),
    [availableLicenses, initialValues.baseLicenseSlug, selectedBaseLicenseSlug],
  );
  return {
    addDraftEntitlement,
    availableLicenses,
    draftEntitlements,
    entitlements,
    familyOptions,
    form,
    handleCancel: () => handleLicenseVersionFormCancel({ onCancel, router }),
    inheritedType,
    licensesByFamily,
    removeDraftEntitlement,
    resetDraftEntitlements,
    selectedLicenseSlug,
    selectedLicenseVersionsWithSlug,
    setSelectedBaseLicenseSlug,
    syncDraftEntitlementsFromBase,
    t,
    updateDraftEntitlementGrant,
  };
}
