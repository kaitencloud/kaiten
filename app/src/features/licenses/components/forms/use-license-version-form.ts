import { type QueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { Entitlement, License, LicenseFamilyView } from '@/api-client';
import { useAppForm } from '@/hooks/form';
import { useCreateLicenseVersion } from '../../hooks/use-create-license-version';
import { useLicenseEntitlementsDraft } from '../../hooks/use-license-entitlements-draft';
import { useLicenseVersionFormStore } from '../../hooks/use-license-version-form-store';
import {
  entitlementsQueryOptions,
  licenseEntitlementsQueryOptions,
} from '../../queries';
import { resolveLicenseEntitlements } from '../../utils';
import { getCopyFailure } from '../../utils/license-price-copy.utils';
import { getCreatedVersionDestination } from '../../utils/license-version-destination.utils';
import {
  type LicenseVersionFormValues,
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
  startAsDraft?: boolean;
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

type SubmitLicenseVersionOptions = Pick<
  UseLicenseVersionFormOptions,
  'availableLicenses' | 'onSuccess'
> & {
  draftEntitlements: ReturnType<
    typeof useLicenseEntitlementsDraft
  >['draftEntitlements'];
  entitlements: Entitlement[];
};

// What the form does once it is valid: creates the version, tells the person
// when it stayed a draft, and goes where the version opens.
function useSubmitLicenseVersion({
  availableLicenses,
  draftEntitlements,
  entitlements,
  onSuccess,
}: SubmitLicenseVersionOptions) {
  const { t } = useTranslation();
  const router = useRouter();
  const createVersion = useCreateLicenseVersion(entitlements);

  return async (value: LicenseVersionFormValues) => {
    try {
      const baseLicense = availableLicenses.find(
        (license) => license.slug === value.baseLicenseSlug,
      );

      if (!baseLicense) {
        throw new Error(
          t('Pages.Licenses.Version.Form.Errors.baseLicenseNotFound'),
        );
      }

      const { error, hasPrices, license } = await createVersion({
        baseLicense,
        body: licenseVersionFormValuesToLicenseInput(value, baseLicense),
        copyPrices: value.copyPrices,
        draftEntitlements,
      });

      // The version exists but stayed a draft: a grant, a price or the
      // publish failed. A copy of prices that stopped says why with the
      // refusal of the API that stopped it.
      if (error) {
        toast.error(
          t('Pages.Licenses.Mutation.Form.Errors.savedAsDraft', {
            reason: getApiErrorMessage(getCopyFailure(error)),
          }),
        );
      }

      const destination = getCreatedVersionDestination({
        baseSlug: baseLicense.slug,
        error,
        hasPrices,
        license,
      });
      if (destination) {
        router.navigate(destination);
        return;
      }

      if (onSuccess) {
        onSuccess();
        return;
      }

      router.navigate({ to: '/licenses' });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };
}

export function useLicenseVersionForm({
  availableFamilies,
  availableLicenses,
  baseLicense,
  onCancel,
  onSuccess,
  selectedLicenseSlug,
  startAsDraft,
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
  const { familyOptions, initialValues, licensesByFamily } =
    useLicenseVersionFormOptions({
      availableFamilies,
      availableLicenses,
      baseLicense,
      selectedLicenseSlug,
      startAsDraft,
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

  const submit = useSubmitLicenseVersion({
    availableLicenses,
    draftEntitlements,
    entitlements,
    onSuccess,
  });
  const form = useAppForm({
    defaultValues: initialValues,
    validators: {
      onChange: licenseVersionFormSchema,
    },
    onSubmit: ({ value }) => submit(value),
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
