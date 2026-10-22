import { useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LicenseFamilyView } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  ProblemAlert,
  useActionAccess,
  useBillingCapabilities,
  useLeaveRestrictedDialog,
} from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import {
  licenseFamiliesQueryOptions,
  licensesWithInstancesQueryOptions,
} from '../../queries';
import {
  type FallbackOption,
  getFallbackOptions,
  getFamilyName,
} from '../../utils/license-family-settings.utils';
import { LicenseFamilySettingsFields } from './license-family-settings-fields';
import { useLicenseFamilySettingsForm } from './use-license-family-settings-form';

type LicenseFamilySettingsDialogProps = {
  /** The slug of the family, as the URL carries it. */
  familySlug: string;
  /** Closes the dialog: the route drops the family it was opened for. */
  onClose: () => void;
};

type SettingsFormProps = {
  /** The free licenses the family can fall back to, and none. */
  fallbackOptions: FallbackOption[];
  family: LicenseFamilyView;
  onClose: () => void;
};

function SettingsForm({ fallbackOptions, family, onClose }: SettingsFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { failure, form } = useLicenseFamilySettingsForm({
    family,
    onDone: onClose,
  });

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            form={formId}
            label={t('Pages.Licenses.FamilySettings.save')}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-6">
            <LicenseFamilySettingsFields
              fallbackOptions={fallbackOptions}
              form={form}
            />
            {failure ? <ProblemAlert error={failure} /> : null}
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

/**
 * The dialog the settings of a family are edited in, which the URL opens
 * (`?familySettings=<slug>`) like the other edit dialogs of the console. The
 * settings are billing's: where billing is not there, or the session may not write
 * licenses, there is no dialog to open, and the link is inert. A slug that names no
 * family closes the dialog.
 */
export function LicenseFamilySettingsDialog({
  familySlug,
  onClose,
}: LicenseFamilySettingsDialogProps) {
  const { t } = useTranslation();
  const { isEnabled } = useBillingCapabilities();
  const access = useActionAccess('licenseFamily.updateSettings');
  const { data: families } = useSuspenseQuery(licenseFamiliesQueryOptions);
  const { data: licenses } = useSuspenseQuery(
    licensesWithInstancesQueryOptions,
  );
  const family = families?.items.find(
    (candidate) => candidate.slug === familySlug,
  );
  const fallbackOptions = useMemo(
    () =>
      family
        ? getFallbackOptions({
            families: families?.items ?? [],
            family,
            licenses: licenses ?? [],
            noneLabel: t('Pages.Licenses.FamilySettings.noFallback'),
          })
        : [],
    [families, family, licenses, t],
  );

  // Where billing is off the link is not there at all, so only a session is told.
  useLeaveRestrictedDialog(access, onClose, isEnabled);
  useEffect(() => {
    if (!family) {
      onClose();
    }
  }, [family, onClose]);
  if (!isEnabled || !access.allowed || !family) {
    return null;
  }

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t('Pages.Licenses.FamilySettings.dialogDescription', {
        name: getFamilyName(family, licenses ?? []),
      })}
      finalFocus={() => {
        // The dialog opens from a link of the page behind it, which the
        // navigation that closes it renders again.
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLAnchorElement>(
              `[data-family-settings="${CSS.escape(familySlug)}"]`,
            )
            ?.focus(),
        );

        return false;
      }}
      onOpenChange={(open) => !open && onClose()}
      open
      title={t('Pages.Licenses.FamilySettings.dialogTitle')}
    >
      <SettingsForm
        fallbackOptions={fallbackOptions}
        family={family}
        onClose={onClose}
      />
    </StackedFormDialog>
  );
}
