import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { previewLicenseInvoiceMutation } from '@/api-client/@tanstack/react-query.gen';
import { useAppForm } from '@/hooks/form';
import {
  initialLicensePreviewValues,
  previewValuesToScenario,
} from '../../schemas/license-preview.schema';
import type { PreviewMeter } from '../../utils/license-price-preview.utils';
import { previewFormOpts } from './preview-form-options';

type UseLicensePreviewFormOptions = {
  /** The base the API picks when none is named. */
  defaultBasePriceId?: string;
  /** The base the form starts on. */
  initialBasePriceId: string;
  licenseSlug: string;
  meters: PreviewMeter[];
};

/**
 * The form of an invoice preview of a version, and the call it makes. A preview
 * writes nothing, so nothing is refreshed afterwards: the invoice the API
 * composed is held by the mutation until the next run, and is gone when a run
 * fails, so a refusal never sits beside an invoice it did not produce. What the
 * API refuses is the failure, which the dialog shows where the person is looking.
 */
export function useLicensePreviewForm({
  defaultBasePriceId,
  initialBasePriceId,
  licenseSlug,
  meters,
}: UseLicensePreviewFormOptions) {
  const preview = useMutation(previewLicenseInvoiceMutation());
  const [failure, setFailure] = useState<unknown>(null);

  const form = useAppForm({
    ...previewFormOpts,
    defaultValues: initialLicensePreviewValues(
      initialBasePriceId,
      meters.map((meter) => meter.entitlementSlug),
    ),
    onSubmit: async ({ value }) => {
      setFailure(null);
      try {
        await preview.mutateAsync({
          body: previewValuesToScenario(value, defaultBasePriceId),
          path: { licenseSlug },
        });
      } catch (error) {
        setFailure(error);
      }
    },
  });

  return { failure, form, preview: preview.data };
}
