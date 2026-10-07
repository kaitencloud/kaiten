import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InvoiceLineLedger } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  formatUtcDate,
  handleBillingProblem,
  LineFingerprint,
} from '@/domains/billing';

type OutsideRetentionNoticeProps = {
  /** The refusal the reports came back with. */
  error: unknown;
  /** What the invoice kept of the reports: the line's `metering.ledger`. */
  ledger?: InvoiceLineLedger;
};

/**
 * What the screen shows when the API no longer keeps the reports of a line: not
 * a failure, since the usage is purged on purpose. The invoice kept a
 * fingerprint of them (which reports, how many, what they summed to), and that is
 * what is left to read. It is the invoice's own copy, the same figures the API
 * puts in its refusal, so it is there for an old draft whose reports were spared
 * as well: the API refuses on the age of the line's period alone.
 */
export function OutsideRetentionNotice({
  error,
  ledger,
}: OutsideRetentionNoticeProps) {
  const { i18n, t } = useTranslation();
  const { retentionStart } = handleBillingProblem(error);

  return (
    <div className="space-y-3" data-testid="outside-retention">
      <Alert>
        <History />
        <AlertTitle>
          {t('Pages.Billing.Invoices.Drilldown.OutsideRetention.title')}
        </AlertTitle>
        <AlertDescription>
          <p>
            {t('Pages.Billing.Invoices.Drilldown.OutsideRetention.description')}
          </p>
          {retentionStart ? (
            <p>
              {t('Features.Billing.Problems.outsideRetention', {
                date: formatUtcDate(retentionStart, i18n.language),
              })}
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
      {ledger ? (
        <div className="space-y-1 rounded-lg border p-4">
          <h2 className="text-sm font-medium">
            {t('Pages.Billing.Invoices.Drilldown.OutsideRetention.kept')}
          </h2>
          <LineFingerprint ledger={ledger} />
        </div>
      ) : null}
    </div>
  );
}
