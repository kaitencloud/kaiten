import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { LicenseFamilyView } from '@/api-client';
import { updateLicenseFamilyMutation } from '@/api-client/@tanstack/react-query.gen';
import { handleBillingProblem, setProblemFieldError } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { invalidateLicenseFamilies } from '../../queries';
import {
  familyToSettingsFormValues,
  LICENSE_FAMILY_REFUSALS,
  settingsFormValuesToUpdateBody,
} from '../../schemas/license-family-settings.schema';
import { familySettingsFormOpts } from './license-family-settings-form-options';

type UseLicenseFamilySettingsFormOptions = {
  family: LicenseFamilyView;
  /** Called once the API accepted the change, or when there was none to send. */
  onDone: () => void;
};

/**
 * The form of the settings of a family, and the partial update it sends. A billing
 * write is never optimistic: the lists show the new settings once the API has
 * accepted them. The update carries only the settings that were changed, so one
 * saved from another tab since the dialog opened stays as it is. A refusal about
 * a setting is shown on its field in the words of the locales, any other above
 * the buttons in the API's, and the form keeps what was typed either way.
 */
export function useLicenseFamilySettingsForm({
  family,
  onDone,
}: UseLicenseFamilySettingsFormOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  // The settings as they were when the form opened: what the update compares the
  // form with, to tell what was changed from what was not.
  const [opened] = useState(() => familyToSettingsFormValues(family));
  const update = useMutation({
    ...updateLicenseFamilyMutation(),
    onSuccess: async () => {
      await invalidateLicenseFamilies(queryClient, family.slug);
      toast.success(t('Pages.Licenses.FamilySettings.Toasts.updated'));
    },
  });

  const form = useAppForm({
    ...familySettingsFormOpts,
    defaultValues: opened,
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      const body = settingsFormValuesToUpdateBody(value, opened);
      if (Object.keys(body).length === 0) {
        onDone();

        return;
      }
      try {
        await update.mutateAsync({ body, path: { familySlug: family.slug } });
        onDone();
      } catch (error) {
        const problem = handleBillingProblem(error);
        const refusal =
          LICENSE_FAMILY_REFUSALS[
            (problem.code ?? '') as keyof typeof LICENSE_FAMILY_REFUSALS
          ];
        if (refusal) {
          setProblemFieldError(formApi, refusal.field, t(refusal.messageKey));

          return;
        }
        setFailure(error);
      }
    },
  });

  return { failure, form };
}
