import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { InvoiceLine } from '@/api-client';
import {
  describeInvoiceLine,
  LineFingerprint,
  OverageLimits,
  useCanPerform,
} from '@/domains/billing';

type InvoiceLineDetailProps = {
  invoiceId: string;
  line: InvoiceLine;
};

/**
 * What stands behind a line that was measured: for an overage, the arithmetic of
 * its limits; for any metered line, the fingerprint of the reports it came from
 * and the way to them. A base fee, an add-on and a discount were not measured
 * from anything, so they show nothing beyond the line itself.
 */
export function InvoiceLineDetail({ invoiceId, line }: InvoiceLineDetailProps) {
  const { t } = useTranslation();
  const canViewReports = useCanPerform('invoice.lineReports');
  const ledger = line.metering?.ledger;

  if (!describeInvoiceLine(line).isMetered) {
    return null;
  }
  const rows = ledger?.rows ?? 0;

  return (
    // On a narrow screen the table around it scrolls: what stands behind a line keeps
    // enough width to be read, instead of being squeezed to a word per row.
    <div className="min-w-52 space-y-1 pt-1">
      {line.overage ? <OverageLimits overage={line.overage} /> : null}
      {ledger ? <LineFingerprint ledger={ledger} /> : null}
      {/* The reports are behind their own scope: a link a session cannot follow is not offered. */}
      {line.id && rows > 0 && canViewReports ? (
        <Link
          className="inline-block text-xs text-primary-subtle-foreground underline underline-offset-4"
          params={{ invoiceId, lineId: line.id }}
          to="/billing/invoices/$invoiceId/lines/$lineId"
        >
          {t('Pages.Billing.Invoices.Detail.Lines.viewReports', {
            count: rows,
          })}
        </Link>
      ) : null}
    </div>
  );
}
