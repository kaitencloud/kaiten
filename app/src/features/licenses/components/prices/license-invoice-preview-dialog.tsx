import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  handleBillingProblem,
  InvoicePreviewDialog,
  InvoicePreviewResult,
  ProblemAlert,
} from '@/domains/billing';
import { createFormSubmitHandler } from '@/hooks/form';
import type { useLicensePricing } from '../../hooks/use-license-pricing';
import {
  getDefaultBase,
  getInitialBase,
} from '../../utils/license-price-preview.utils';
import { PreviewFields } from './preview-fields';
import { useLicensePreviewForm } from './use-license-preview-form';
import { usePreviewFieldOptions } from './use-preview-field-options';

const INVALID_SAMPLE_USAGE = 'PreviewLicenseInvoice.InvalidSampleUsage';

type LicenseInvoicePreviewDialogProps = {
  licenseSlug: string;
  onClose: () => void;
  pricing: ReturnType<typeof useLicensePricing>;
};

/**
 * The invoice a subscription to the version would be billed, composed by the API
 * from a base price and the usage the person gives: a flat fee, and a sample per
 * entitlement a price meters. It works on a draft as on a published version,
 * which is how a price is checked before it goes on sale, and it writes nothing.
 * The lines, their arithmetic and the totals are the API's, shown as they came.
 */
export function LicenseInvoicePreviewDialog({
  licenseSlug,
  onClose,
  pricing,
}: LicenseInvoicePreviewDialogProps) {
  const { t } = useTranslation();
  const { license, prices } = pricing;
  const { baseOptions, meters, sampleFields } = usePreviewFieldOptions(pricing);
  const { failure, form, preview } = useLicensePreviewForm({
    defaultBasePriceId: getDefaultBase(prices)?.id,
    initialBasePriceId: getInitialBase(prices)?.id ?? '',
    licenseSlug,
    meters,
  });

  // The invoice comes in under a form that may fill the dialog: bring it into
  // view, since the totals at its end are what was asked for.
  const outcome = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (preview) {
      outcome.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [preview]);

  // The refusal of a sample is about what was typed in the usage, and is shown
  // on it; any other is shown under the form.
  const problem = failure ? handleBillingProblem(failure) : null;
  const sampleError =
    problem?.code === INVALID_SAMPLE_USAGE ? problem.detail : undefined;

  return (
    <InvoicePreviewDialog
      description={t('Pages.Licenses.Prices.Preview.description', {
        name: license.name,
        version: license.version,
      })}
      onOpenChange={(open) => !open && onClose()}
      open
      title={t('Pages.Licenses.Prices.Preview.title')}
    >
      <form
        className="space-y-5"
        onSubmit={createFormSubmitHandler(form.handleSubmit)}
      >
        <form.AppForm>
          <PreviewFields
            bases={baseOptions}
            form={form}
            sampleError={sampleError}
            samples={sampleFields}
          />
          <div className="flex justify-end">
            <form.SubmitButton
              allowPristine
              label={t('Pages.Licenses.Prices.Preview.run')}
            />
          </div>
        </form.AppForm>
      </form>
      {failure && !sampleError ? <ProblemAlert error={failure} /> : null}
      <div aria-live="polite" ref={outcome}>
        {preview ? (
          <InvoicePreviewResult preview={preview} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Licenses.Prices.Preview.hint')}
          </p>
        )}
      </div>
    </InvoicePreviewDialog>
  );
}
