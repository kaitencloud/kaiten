import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { License } from '@/api-client';
import { handleBillingProblem, setProblemFieldError } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { invalidateLicenseQueries, saveLicenseOnFresh } from '../../queries';
import {
  commercialFormValuesToUpdateBody,
  licenseToCommercialFormValues,
} from '../../schemas/license-commercial.schema';
import { commercialFormOpts } from './license-commercial-form-options';

// The refusals of the API that are about one field of the form, by their code:
// the API names the field in prose, in `detail`, and does not locate it. Each is
// shown on its field, which is where the person is looking.
const FIELD_BY_CODE: Record<
  string,
  'pricingType' | 'selfServeCtaUrl' | 'trialPeriodDays'
> = {
  'UpdateLicense.FreePriceNotZero': 'pricingType',
  'UpdateLicense.InvalidSelfServeCtaUrl': 'selfServeCtaUrl',
  'UpdateLicense.InvalidTrialDays': 'trialPeriodDays',
};

type UseLicenseCommercialFormOptions = {
  license: License;
  /** Called once the API accepted the change. */
  onDone: () => void;
};

/**
 * The form of the commercial fields of a version, and the update it sends. A
 * billing write is never optimistic: the page shows the new terms once the API
 * has accepted them. A refusal about a field is shown on it, any other above the
 * buttons, and the form keeps what was typed either way.
 *
 * The update restates the version, so it reads the version again and puts the
 * terms that were changed on top of it: the default moved to another version, or
 * the name changed, since the form opened stay as they are.
 */
export function useLicenseCommercialForm({
  license,
  onDone,
}: UseLicenseCommercialFormOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  // The version and the form as they were when the form opened: what the save
  // compares the form with, to tell what was changed from what was not.
  const [opened] = useState(() => ({
    license,
    values: licenseToCommercialFormValues(license),
  }));
  const update = useMutation({
    mutationFn: saveLicenseOnFresh,
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, license.slug);
      toast.success(t('Pages.Licenses.Commercial.Toasts.updated'));
    },
  });

  const form = useAppForm({
    ...commercialFormOpts,
    defaultValues: opened.values,
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        await update.mutateAsync({
          edited: commercialFormValuesToUpdateBody(value, opened.license),
          licenseSlug: license.slug ?? license.id,
          opened: commercialFormValuesToUpdateBody(
            opened.values,
            opened.license,
          ),
        });
        onDone();
      } catch (error) {
        const problem = handleBillingProblem(error);
        const field = FIELD_BY_CODE[problem.code ?? ''];
        if (field && problem.detail) {
          setProblemFieldError(formApi, field, problem.detail);

          return;
        }
        setFailure(error);
      }
    },
  });

  return { failure, form };
}
