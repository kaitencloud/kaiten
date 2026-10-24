import { Button } from '@/components/ui/button';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouteContext, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { License } from '@/api-client';
import {
  type FormRecovery,
  FormRecoveryAlert,
  FormRecoveryAnnouncer,
  FormRecoveryNotes,
  FormRecoverySubmitWarning,
  useFormRecovery,
  useFormRecoveryForm,
} from '@/functionals/form-recovery';
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
import type { EditableLicenseEntitlement } from '../../utils';
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
import { keepGrantableRows, licenseRecovery } from './license-recovery';

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

type LicenseRecovery = FormRecovery<
  LicenseFormValues,
  EditableLicenseEntitlement[]
>;

/**
 * The page of a new license, and the edit of one. What a creation typed and did not
 * send, its grants included, is kept on the device and offered back on the next visit
 * (`licenseRecovery`); the door is opened here, outside the form, so that a resume
 * mounts the form again on the restored values. The edit keeps nothing.
 */
export const LicenseForm = (props: LicenseFormProps) => {
  const recovery = useFormRecovery(licenseRecovery, {
    enabled: !props.license,
    pristine: initialLicenseFormValues,
  });

  return (
    <>
      <FormRecoveryAnnouncer recovery={recovery} />
      <LicenseFormContent
        key={recovery.sessionKey}
        {...props}
        recovery={recovery}
      />
    </>
  );
};

function LicenseListLink() {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={<Link to="/catalog/licenses" />}
      size="sm"
      variant="outline"
    >
      {t('Common.viewList')}
    </Button>
  );
}

const LicenseFormContent = ({
  license,
  navigateOnSuccess = !license,
  onSubmitted,
  recovery,
}: LicenseFormProps & { recovery: LicenseRecovery }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const { data: entitlementsData } = useSuspenseQuery(entitlementsQueryOptions);
  const entitlements = useMemo(
    () => entitlementsData?.items ?? [],
    [entitlementsData],
  );
  const [initialRows] = useState(() =>
    keepGrantableRows(
      recovery.restored?.extra,
      new Set(entitlements.map((entitlement) => entitlement.id)),
    ),
  );
  const {
    addDraftEntitlement,
    draftEntitlements,
    removeDraftEntitlement,
    updateDraftEntitlementGrant,
  } = useLicenseEntitlementsDraft(initialRows);
  const { createLicenseWithGrants } = useLicenseSave(entitlements);

  // The version as the form opened with it: what an update is compared with, to
  // send only what was changed on top of the version as the API holds it now.
  const [openedLicense] = useState(license);
  const [openedValues] = useState(() =>
    license ? licenseToFormValues(license) : recovery.pristine,
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

        // The body is built before the request, outside `send`. A license created and
        // left a draft by a failed grant or publish is an accepted send: its own page
        // is where the vendor finishes it, so the input is not offered again.
        const body = licenseFormValuesToLicenseInput(value);
        const { error, license: createdLicense } = await recovery.send(
          () => createLicenseWithGrants({ body, draftEntitlements }),
          {
            created: (created) => ({
              id: created.license.slug ?? created.license.id ?? '',
              label: created.license.name,
            }),
          },
        );
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

  const { focusRef } = useFormRecoveryForm(recovery, form, {
    extra: () => draftEntitlements,
  });

  // Cancelling a creation is a deliberate abandon, unlike leaving by a link: the
  // input is discarded, and a toast offers to bring it back.
  const handleCancel = () => {
    if (!license) {
      recovery.discard({
        undo: () => void router.navigate({ to: '/catalog/licenses/new' }),
      });
    }
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
    <form ref={focusRef} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
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
            {!license ? (
              <>
                <FormRecoveryAlert recovery={recovery}>
                  <LicenseListLink />
                </FormRecoveryAlert>
                <FormRecoveryNotes recovery={recovery} />
                <FormRecoverySubmitWarning recovery={recovery}>
                  <LicenseListLink />
                </FormRecoverySubmitWarning>
              </>
            ) : null}
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
