import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Money } from './money';

type InvoiceTotalsProps = {
  className?: string;
  /** The ISO 4217 code of the amounts. */
  currency: string;
  /** The sum of the discounts, as the API states it: a magnitude, in minor units. */
  discountTotal: number;
  /** The invoice's sum of lines, in minor units. */
  subtotal: number;
  /** What the invoice comes to once the discounts are taken, in minor units. */
  total: number;
};

/**
 * The totals of an invoice. Every figure is a field of the API, written as it
 * came: the console never adds the lines up, so the three can disagree with the
 * lines above them only if the API's do. A discount reads as the negative it is
 * on the invoice, and a total with no discount is shown without one.
 *
 * Under the table of the lines, the amounts end where the column of amounts does:
 * the `simple` table insets its last column by 24px (`pr-6`), and so do the totals.
 */
export function InvoiceTotals({
  className,
  currency,
  discountTotal,
  subtotal,
  total,
}: InvoiceTotalsProps) {
  const { t } = useTranslation();

  return (
    <dl
      className={cn(
        'ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 pr-6 text-sm',
        className,
      )}
      data-testid="invoice-totals"
    >
      <dt className="text-muted-foreground">
        {t('Features.Billing.InvoiceTotals.subtotal')}
      </dt>
      <dd className="text-right">
        <Money amount={subtotal} currency={currency} />
      </dd>
      {discountTotal === 0 ? null : (
        <>
          <dt className="text-muted-foreground">
            {t('Features.Billing.InvoiceTotals.discounts')}
          </dt>
          <dd className="text-right">
            <Money amount={-discountTotal} currency={currency} />
          </dd>
        </>
      )}
      <dt className="font-semibold">
        {t('Features.Billing.InvoiceTotals.total')}
      </dt>
      <dd className="text-right text-base font-semibold">
        <Money amount={total} currency={currency} />
      </dd>
    </dl>
  );
}
