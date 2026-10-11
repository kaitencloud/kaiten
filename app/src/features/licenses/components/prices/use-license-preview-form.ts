import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { previewLicenseInvoiceMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  addonPricesQueryOptions,
  formatUtcDate,
  handleBillingProblem,
  placeRefusalOnFields,
  setProblemFieldError,
} from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  initialLicensePreviewValues,
  previewValuesToScenario,
} from '../../schemas/license-preview.schema';
import {
  getPreviewMeters,
  type PreviewMeter,
} from '../../utils/license-price-preview.utils';
import { previewFormOpts } from './preview-form-options';

const OPERATION = 'PreviewLicenseInvoice';

// The field of the form each refusal of the preview is about. The usage of an instance that
// is no longer kept is about the instance, and says where the history begins.
const REFUSED_ON = {
  [`${OPERATION}.AddonNotFound`]: 'addOns',
  [`${OPERATION}.InstanceNotFound`]: 'instanceSlug',
  [`${OPERATION}.InvalidAddOns`]: 'addOns',
  [`${OPERATION}.OutsideRetention`]: 'instanceSlug',
  [`${OPERATION}.VoucherInvalid`]: 'voucherCode',
  [`${OPERATION}.VoucherNotFound`]: 'voucherCode',
} as const;

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
 * API refuses is the failure: a refusal about the instance, the add-ons or the code is
 * shown on that field, in the API's words, where the person is looking, and any other
 * under the form.
 *
 * The code of a voucher is in the body of the call and nowhere else: not in a key of a
 * query or a mutation, which the call has none of, not in an address, not in the storage of
 * the browser, and not in a log, since a failure is kept for the dialog to show and not
 * reported.
 */
export function useLicensePreviewForm({
  defaultBasePriceId,
  initialBasePriceId,
  licenseSlug,
  meters,
}: UseLicensePreviewFormOptions) {
  const { i18n, t } = useTranslation();
  const queryClient = useQueryClient();
  const preview = useMutation(previewLicenseInvoiceMutation());
  const [failure, setFailure] = useState<unknown>(null);
  const [placed, setPlaced] = useState(false);

  const form = useAppForm({
    ...previewFormOpts,
    defaultValues: initialLicensePreviewValues(
      initialBasePriceId,
      meters.map((meter) => meter.entitlementSlug),
    ),
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      setPlaced(false);
      try {
        // A sample is for a meter that is there now: a price of the version, or of an
        // add-on that is still on the list, whose prices are read if they were not.
        const addonPrices = await Promise.all(
          value.addOns.map(({ addonSlug }) =>
            queryClient.ensureQueryData(addonPricesQueryOptions(addonSlug)),
          ),
        );
        const meterSlugs = [
          ...meters,
          ...addonPrices.flatMap((prices) => getPreviewMeters(prices)),
        ].map(({ entitlementSlug }) => entitlementSlug);
        await preview.mutateAsync({
          body: previewValuesToScenario(value, {
            defaultBasePriceId,
            meterSlugs,
          }),
          path: { licenseSlug },
        });
      } catch (error) {
        setFailure(error);
        const problem = handleBillingProblem(error);
        if (
          problem.kind === 'outside-retention' &&
          problem.retentionStart &&
          problem.code === `${OPERATION}.OutsideRetention`
        ) {
          setProblemFieldError(
            formApi,
            'instanceSlug',
            t('Pages.Licenses.Prices.Preview.Errors.outsideRetention', {
              date: formatUtcDate(problem.retentionStart, i18n.language),
            }),
          );
          setPlaced(true);

          return;
        }
        setPlaced(
          placeRefusalOnFields(formApi, error, {
            byCode: REFUSED_ON,
          }),
        );
      }
    },
  });

  return { failure, form, placed, preview: preview.data };
}
