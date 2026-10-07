import { useTranslation } from 'react-i18next';
import type { InvoiceLineLedger } from '@/api-client';
import { formatDecimalQuantity } from '@/lib/decimal';
import { cn } from '@/lib/utils';

type LineFingerprintProps = {
  className?: string;
  /** The `metering.ledger` of a USAGE or OVERAGE line. */
  ledger: InvoiceLineLedger;
};

/**
 * What stands behind a metered line, in one line: the reports of the usage
 * journal it was measured from, by their numbers, how many there are and what
 * they sum to. It is the fingerprint the invoice keeps of them, so it still reads
 * once the reports themselves are no longer kept. The sum is the API's, before
 * any floor: the line's quantity is what the windows come to once floored.
 */
export function LineFingerprint({ className, ledger }: LineFingerprintProps) {
  const { i18n, t } = useTranslation();
  const isEmpty =
    ledger.rows === 0 || ledger.firstSeq === null || ledger.lastSeq === null;

  return (
    <p
      className={cn('text-xs text-muted-foreground tabular-nums', className)}
      data-testid="line-fingerprint"
    >
      {isEmpty
        ? t('Features.Billing.Fingerprint.empty')
        : t('Features.Billing.Fingerprint.summary', {
            count: ledger.rows,
            first: ledger.firstSeq,
            last: ledger.lastSeq,
            sum: formatDecimalQuantity(ledger.sumDelta, i18n.language),
          })}
    </p>
  );
}
