import { Button } from '@/components/ui/button';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { License } from '@/api-client';
import { updateLicenseMutation } from '@/api-client/@tanstack/react-query.gen';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { useLicenseEntitlementsDraft } from '../../hooks/use-license-entitlements-draft';
import { useLicenseSave } from '../../hooks/use-license-save';
import {
  entitlementsQueryOptions,
  invalidateLicenseQueries,
} from '../../queries';
import { type LicenseFormValues, licenseFormSchema } from '../../schemas';
import type { AddEntitlementPayload } from '../entitlements/license-entitlements-card.types';
import {
  licenseFormValuesToLicenseInput,
  licenseFormValuesToLicenseUpdateInput,
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

  const updateMutation = useMutation({
    ...updateLicenseMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, license?.slug);
      toast.success(t('Pages.Licenses.Mutation.Form.updateSuccess'));
    },
  });

  const handleNavigateSuccess = () => {
    onSubmitted?.();

    if (navigateOnSuccess) {
      router.navigate({ to: '/licenses' });
    }
  };

  const form = useAppForm({
    defaultValues: license
      ? {
          name: license.name,
          description: license.description,
          type: license.type,
          versionName: license.versionName,
          slug: license.slug ?? '',
          // Unused on update: the form does not offer it there.
          createAsDraft: false,
        }
      : initialLicenseFormValues,
    validators: {
      onChange: licenseFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        if (license) {
          if (!license.slug) {
            throw new Error('Missing license slug');
          }

          await updateMutation.mutateAsync({
            body: {
              ...licenseFormValuesToLicenseUpdateInput(value, license),
            },
            path: { licenseSlug: license.slug },
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
              to: '/licenses/$licenseSlug',
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
    router.navigate({ to: '/licenses' });
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
