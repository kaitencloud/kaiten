import {
  aiMatrixQueryKey,
  aiWildcardImpactQueryKey,
} from '@/domains/ai-credits';
import { readCurrentAiAccess, useAiAccess } from '@/domains/ai-credits';
import { copyConversionRules } from '../../hooks/copy-conversion-rules';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { Entitlement, License } from '@/api-client';
import {
  type FormRecovery,
  useFormRecoveryForm,
} from '@/functionals/form-recovery';
import { useAppForm } from '@/hooks/form';
import { useCreateLicenseVersion } from '../../hooks/use-create-license-version';
import { useLicenseEntitlementsDraft } from '../../hooks/use-license-entitlements-draft';
import { useLicenseVersionFormStore } from '../../hooks/use-license-version-form-store';
import { entitlementsQueryOptions } from '../../queries';
import { getCopyFailure } from '../../utils/license-price-copy.utils';
import type { EditableLicenseEntitlement } from '../../utils';
import { getCreatedVersionDestination } from '../../utils/license-version-destination.utils';
import {
  type LicenseVersionFormValues,
  licenseVersionFormSchema,
  licenseVersionFormValuesToLicenseInput,
} from './license-version-form.schema';
import {
  getReadBaseEntitlements,
  useInitializeBaseEntitlements,
  useSyncDraftEntitlementsFromBase,
} from './use-base-entitlements';
import { keepGrantableRows } from './license-recovery';
import type { useLicenseVersionFormOptions } from './use-license-version-form-options';

export type LicenseVersionRecovery = FormRecovery<
  LicenseVersionFormValues,
  EditableLicenseEntitlement[]
>;

type UseLicenseVersionFormOptions = {
  availableLicenses: License[];
  onCancel?: () => void;
  onSuccess?: () => void;
  selectedLicenseSlug?: string;
  /** What the form offers, computed once by the component that opens the recovery. */
  formOptions: ReturnType<typeof useLicenseVersionFormOptions>;
  recovery: LicenseVersionRecovery;
};

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

// Cancel discards input; its toast offers to restore it on the page it was typed on.
function handleLicenseVersionFormCancel({
  onCancel,
  recovery,
  router,
}: {
  onCancel?: () => void;
  recovery: LicenseVersionRecovery;
  router: ReturnType<typeof useRouter>;
}) {
  const { href } = router.state.location;
  recovery.discard({ undo: () => void router.navigate({ href }) });
  if (onCancel) {
    onCancel();
    return;
  }

  router.navigate({ to: '/catalog/licenses' });
}

type SubmitLicenseVersionOptions = Pick<
  UseLicenseVersionFormOptions,
  'availableLicenses' | 'onSuccess'
> & {
  recovery: LicenseVersionRecovery;
  draftEntitlements: ReturnType<
    typeof useLicenseEntitlementsDraft
  >['draftEntitlements'];
  entitlements: Entitlement[];
};

// Creates the version, reports an incomplete draft, then opens its destination.
function useSubmitLicenseVersion({
  availableLicenses,
  draftEntitlements,
  entitlements,
  onSuccess,
  recovery,
}: SubmitLicenseVersionOptions) {
  const { t } = useTranslation();
  const router = useRouter();
  const createVersion = useCreateLicenseVersion(entitlements);
  const access = useAiAccess();
  const queryClient = useQueryClient();
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
      const aiEnabled =
        value.copyAiRules &&
        access.allows('listConversionRules') &&
        access.allows('createConversionRule') &&
        (await readCurrentAiAccess(queryClient));
      // The body is built before the request, outside `send`. A version created and
      // left a draft by a failed grant, price or publish is an accepted send: its own
      // page is where the vendor finishes it, so the input is not offered again.
      const body = licenseVersionFormValuesToLicenseInput(value, baseLicense);
      const { error, hasPrices, license } = await recovery.send(
        () =>
          createVersion({
            baseLicense,
            body,
            copyPrices: value.copyPrices,
            afterGrants: aiEnabled
              ? async (created) => {
                  try {
                    const results = await copyConversionRules(
                      baseLicense.slug!,
                      created.slug,
                    );
                    for (const result of results) {
                      const name = `${result.rule.entitlementSlug} / ${result.rule.modelSlug ?? t('AI.anyModel')} / ${result.rule.requestType ?? t('AI.any')}`;
                      if (result.error)
                        toast.error(
                          t('AI.copyFailed', {
                            name,
                            reason: getApiErrorMessage(result.error),
                          }),
                        );
                      else toast.success(t('AI.copySuccess', { name }));
                    }
                    if (results.some((result) => result.error))
                      throw new Error(t('AI.copyPartial'));
                  } finally {
                    await Promise.all([
                      queryClient.invalidateQueries({
                        queryKey: aiMatrixQueryKey,
                      }),
                      queryClient.invalidateQueries({
                        queryKey: aiWildcardImpactQueryKey,
                      }),
                    ]);
                  }
                }
              : undefined,
            draftEntitlements,
          }),
        {
          created: (created) => ({
            id: created.license.slug ?? created.license.id ?? '',
            label: created.license.name,
          }),
        },
      );
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
      router.navigate({ to: '/catalog/licenses' });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };
}

export function useLicenseVersionForm({
  availableLicenses,
  formOptions,
  onCancel,
  onSuccess,
  recovery,
  selectedLicenseSlug,
}: UseLicenseVersionFormOptions) {
  const { t } = useTranslation();
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const { data: entitlementsData } = useSuspenseQuery(entitlementsQueryOptions);
  const entitlements = entitlementsData?.items ?? [];
  const { familyOptions, initialValues, licensesByFamily } = formOptions;
  // A resume starts from the base the input was typed on.
  const startingBaseSlug =
    recovery.restored?.values.baseLicenseSlug ?? initialValues.baseLicenseSlug;
  // Decided once, when the form opens: the draft is a buffer the person edits, not a
  // view of the cache. Resumed rows are taken as they were kept, but for a grant whose
  // entitlement was deleted since, which would leave the version a draft.
  const [startingRows] = useState(() =>
    recovery.restored?.extra === undefined
      ? getReadBaseEntitlements(queryClient, startingBaseSlug, entitlements)
      : keepGrantableRows(
          recovery.restored.extra,
          new Set(entitlements.map((entitlement) => entitlement.id)),
        ),
  );
  // The rows of the base are on the draft: what the form set up itself from then on
  // is not taken for an input.
  const [baseRowsLoaded, setBaseRowsLoaded] = useState(
    startingRows !== undefined || !startingBaseSlug,
  );
  const markBaseRowsLoaded = useCallback(() => setBaseRowsLoaded(true), []);
  const {
    addDraftEntitlement,
    draftEntitlements,
    removeDraftEntitlement,
    resetDraftEntitlements,
    setDraftEntitlements,
    updateDraftEntitlementGrant,
  } = useLicenseEntitlementsDraft(startingRows);
  const {
    hasInitializedBaseEntitlements,
    selectedBaseLicenseSlug,
    initializeBaseEntitlements,
    setSelectedBaseLicenseSlug,
  } = useLicenseVersionFormStore(startingBaseSlug);
  const syncDraftEntitlementsFromBase = useSyncDraftEntitlementsFromBase({
    entitlements,
    queryClient,
    resetDraftEntitlements,
    setDraftEntitlements,
  });
  useInitializeBaseEntitlements({
    hasInitializedBaseEntitlements,
    initialBaseLicenseSlug: startingBaseSlug,
    initializeBaseEntitlements,
    onBaseLoaded: markBaseRowsLoaded,
    startedWithBase: startingRows !== undefined,
    syncDraftEntitlementsFromBase,
  });
  const submit = useSubmitLicenseVersion({
    availableLicenses,
    draftEntitlements,
    entitlements,
    onSuccess,
    recovery,
  });
  const form = useAppForm({
    defaultValues: recovery.pristine,
    validators: {
      onChange: licenseVersionFormSchema,
    },
    onSubmit: ({ value }) => submit(value),
  });

  const baseLicense = useMemo(
    () =>
      availableLicenses.find(
        (license) => license.slug === selectedBaseLicenseSlug,
      ) ?? null,
    [availableLicenses, selectedBaseLicenseSlug],
  );
  // A resume restores the rows it kept and skips the setup from the base, so it
  // is ready at once. Rows kept from a base that changed since are dropped by the
  // adapter: the base's own are loaded again.
  const { focusRef } = useFormRecoveryForm(recovery, form, {
    extra: () => draftEntitlements,
    onExtraDiscarded: () =>
      void syncDraftEntitlementsFromBase(selectedBaseLicenseSlug),
    ready: recovery.restored !== null || baseRowsLoaded,
    references: { baseLicense },
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
    focusRef,
    form,
    handleCancel: () =>
      handleLicenseVersionFormCancel({ onCancel, recovery, router }),
    inheritedType,
    licensesByFamily,
    recovery,
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
