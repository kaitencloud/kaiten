import { Button } from '@/components/ui/button';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { License } from '@/api-client';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { useLicenseEntitlementsDraft } from '../../hooks/use-license-entitlements-draft';
import { useLicenseSave } from '../../hooks/use-license-save';
import {
  entitlementsQueryOptions,
  invalidateLicenseQueries,
  saveLicenseOnFresh,
} from '../../queries';
import { type LicenseFormValues, licenseFormSchema } from '../../schemas';
import type { AddEntitlementPayload } from '../entitlements/license-entitlements-card.types';
import {
  licenseFormValuesToLicenseInput,
  licenseFormValuesToLicenseUpdateInput,
  licenseToFormValues,
} from './license-form.utils';
import {
  DraftEntitlementsSection,
  LicenseMainSection,
} from './license-form-sections';

export { licenseFormValuesToLicenseInput } from './license-form.utils';

const initialLicenseFormValues: LicenseFormValues = {
  name: '',
  description: '',
  type: 'DEVELOPMENT',
  versionName: '',
  slug: '',
  createAsDraft: false,
};

type LicenseFormProps = {
  license?: License | null;
  navigateOnSuccess?: boolean;
  onSubmitted?: () => void;
};

export const LicenseForm = ({
  license,
  navigateOnSuccess = !license,
  onSubmitted,
}: LicenseFormProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    addDraftEntitlement,
    draftEntitlements,
    removeDraftEntitlement,
    updateDraftEntitlementGrant,
  } = useLicenseEntitlementsDraft();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const { data: entitlementsData } = useSuspenseQuery(entitlementsQueryOptions);
  const entitlements = entitlementsData?.items ?? [];
  const { createLicenseWithGrants } = useLicenseSave(entitlements);

  // The version as the form opened with it: what an update is compared with, to
  // send only what was changed on top of the version as the API holds it now.
  const [openedLicense] = useState(license);
  const [openedValues] = useState(() =>
    license ? licenseToFormValues(license) : initialLicenseFormValues,
  );
  const updateMutation = useMutation({
    mutationFn: saveLicenseOnFresh,
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, license?.slug);
      toast.success(t('Pages.Licenses.Mutation.Form.updateSuccess'));
    },
  });

  const handleNavigateSuccess = () => {
    onSubmitted?.();

    if (navigateOnSuccess) {
      router.navigate({ to: '/catalog/licenses' });
    }
  };

  const form = useAppForm({
    defaultValues: openedValues,
    validators: {
      onChange: licenseFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        if (license) {
          if (!license.slug) {
            throw new Error('Missing license slug');
          }

          // The same version builds both bodies, so they differ by the form only.
          const base = openedLicense ?? license;
          await updateMutation.mutateAsync({
            edited: licenseFormValuesToLicenseUpdateInput(value, base),
            licenseSlug: license.slug,
            opened: licenseFormValuesToLicenseUpdateInput(openedValues, base),
          });
          handleNavigateSuccess();
          return;
        }

        const { error, license: createdLicense } =
          await createLicenseWithGrants({
            body: licenseFormValuesToLicenseInput(value),
            draftEntitlements,
          });
        await invalidateLicenseQueries(queryClient);

        // The license exists but stayed a draft: a grant or the publish
        // failed. Its own page is where the vendor finishes it.
        if (error) {
          toast.error(
            t('Pages.Licenses.Mutation.Form.Errors.savedAsDraft', {
              reason: getApiErrorMessage(error),
            }),
          );
          onSubmitted?.();
          if (createdLicense.slug) {
            router.navigate({
              to: '/catalog/licenses/$licenseSlug',
              params: { licenseSlug: createdLicense.slug },
            });
          }
          return;
        }
        // Once the license and every entitlement it grants are saved.
        toast.success(t('Pages.Licenses.Mutation.Form.createSuccess'));
        handleNavigateSuccess();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  const handleCancel = () => {
    router.navigate({ to: '/catalog/licenses' });
  };

  function handleAddDraftEntitlement(payload: AddEntitlementPayload) {
    addDraftEntitlement(entitlements, payload);
  }

  const disabled = Boolean(license);
  const formTitle = license
    ? t('Pages.Licenses.Mutation.titleUpdate')
    : t('Pages.Licenses.Mutation.titleNew');
  const submitLabel = license
    ? t('Pages.Licenses.Mutation.Form.updateButton')
    : t('Pages.Licenses.Mutation.Form.createButton');

  return (
    <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <Page>
          <Page.Header className="sticky top-0 z-20 border-b bg-app-background pb-4">
            <Page.Leading>
              <Page.Heading>
                <Page.Title>{formTitle}</Page.Title>
                <Page.Subtitle>{t('Pages.Licenses.subtitle')}</Page.Subtitle>
              </Page.Heading>
            </Page.Leading>
            <Page.Actions>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  {t('Common.cancel')}
                </Button>
                <form.SubmitButton label={submitLabel} />
              </div>
            </Page.Actions>
          </Page.Header>

          <div className="mt-6 space-y-6 pb-6">
            <LicenseMainSection
              disabled={disabled}
              form={form}
              showCreateAsDraft={!license}
              t={t}
            />

            {!license ? (
              <DraftEntitlementsSection
                entitlements={entitlements}
                draftEntitlements={draftEntitlements}
                addDraftEntitlement={handleAddDraftEntitlement}
                onUpdateEntitlementGrant={updateDraftEntitlementGrant}
                onDeleteEntitlement={removeDraftEntitlement}
              />
            ) : null}
          </div>
        </Page>
      </form.AppForm>
    </form>
  );
};
