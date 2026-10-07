import { useTranslation } from 'react-i18next';
import type { InvoicePreview } from '@/api-client';
import { formatInstant, getInvoiceKindLabelKey } from '../logic';
import { InvoiceLinesTable } from './invoice-lines-table';
import { InvoiceTotals } from './invoice-totals';

type InvoicePreviewResultProps = {
  preview: InvoicePreview;
};

/**
 * What the API composed for a preview: which boundary it bills, its lines with
 * their service periods and arithmetic, and the totals. The lines and the
 * totals are the API's, shown as they came: a preview that disagrees with the
 * invoice it predicts is a defect of the API, never something to fix up here.
 */
export function InvoicePreviewResult({ preview }: InvoicePreviewResultProps) {
  const { i18n, t } = useTranslation();

  return (
    <section
      aria-label={t('Features.Billing.InvoicePreview.resultLabel')}
      className="space-y-4"
    >
      <p className="text-sm text-muted-foreground">
        {t('Features.Billing.InvoicePreview.composed', {
          asOf: formatInstant(preview.asOf, i18n.language),
          kind: t(getInvoiceKindLabelKey(preview.kind)),
        })}
      </p>
      <InvoiceLinesTable currency={preview.currency} lines={preview.lines} />
      <InvoiceTotals
        currency={preview.currency}
        discountTotal={preview.discountTotal}
        subtotal={preview.subtotal}
        total={preview.total}
      />
    </section>
  );
}
