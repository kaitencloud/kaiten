import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { License } from '@/api-client';
import { updateLicenseMutation } from '@/api-client/@tanstack/react-query.gen';
import { handleBillingProblem, setProblemFieldError } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { invalidateLicenseQueries } from '../../queries';
import {
  commercialFormValuesToUpdateBody,
  licenseToCommercialFormValues,
} from '../../schemas/license-commercial.schema';
import { commercialFormOpts } from './license-commercial-form-options';

// The refusals of the API that are about one field of the form, by their code:
// the API names the field in prose, in `detail`, and does not locate it. Each is
// shown on its field, which is where the person is looking.
const FIELD_BY_CODE: Record<string, 'selfServeCtaUrl' | 'trialPeriodDays'> = {
  'UpdateLicense.InvalidSelfServeCtaUrl': 'selfServeCtaUrl',
  'UpdateLicense.InvalidTrialPeriodDays': 'trialPeriodDays',
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
 */
export function useLicenseCommercialForm({
  license,
  onDone,
}: UseLicenseCommercialFormOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const update = useMutation({
    ...updateLicenseMutation(),
    onSuccess: async () => {
      await invalidateLicenseQueries(queryClient, license.slug);
      toast.success(t('Pages.Licenses.Commercial.Toasts.updated'));
    },
  });

  const form = useAppForm({
    ...commercialFormOpts,
    defaultValues: licenseToCommercialFormValues(license),
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        await update.mutateAsync({
          body: commercialFormValuesToUpdateBody(value, license),
          path: { licenseSlug: license.slug ?? license.id },
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
