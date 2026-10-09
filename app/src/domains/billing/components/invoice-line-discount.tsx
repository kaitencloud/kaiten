import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceLine } from '@/api-client';
import { formatMoney } from '@/lib/money';
import { describeDiscount } from '../logic';

type InvoiceLineDiscountProps = {
  /** The ISO 4217 code every amount of the invoice is in. */
  currency: string;
  /** The DISCOUNT line to explain. */
  line: InvoiceLine;
  /** Every line of the invoice, to name the lines the discount bears on. */
  lines: readonly InvoiceLine[];
};

const KEYS = 'Features.Billing.InvoiceLines.Discount';

/**
 * How a DISCOUNT line was composed, from the members the API records on it and never
 * from its label: what it takes (a percentage of what its targets still amounted to, or
 * an amount), which invoice of its redemption this is out of how many, and what each
 * target line bears of it. The amount of the line is its own field, read by the column
 * of amounts; nothing is multiplied or added up here.
 */
export function InvoiceLineDiscount({
  currency,
  line,
  lines,
}: InvoiceLineDiscountProps) {
  const { i18n, t } = useTranslation();
  const list = useMemo(
    () =>
      new Intl.ListFormat(i18n.language, {
        style: 'long',
        type: 'conjunction',
      }),
    [i18n.language],
  );
  const discount = line.discount;

  if (!discount) {
    return null;
  }
  const money = (amount: number | string) =>
    /^\d+$/.test(String(amount))
      ? formatMoney(currency, BigInt(amount), i18n.language)
      : String(amount);
  const value = describeDiscount(
    {
      currency: discount.currency ?? currency,
      priceDiscountType: discount.discountType,
      priceDiscountValue: discount.discountValue,
    },
    i18n.language,
  );
  const targets = discount.allocations.map(
    (allocation) =>
      `${
        lines.find(({ seq }) => seq === allocation.targetSeq)?.label ??
        t(`${KEYS}.line`, { seq: allocation.targetSeq })
      } (${money(allocation.amount)})`,
  );

  return (
    <div
      className="space-y-0.5 text-xs text-muted-foreground"
      data-testid="invoice-line-discount"
    >
      <p>
        {t(
          discount.discountType === 'PERCENTAGE'
            ? `${KEYS}.percentageOf`
            : `${KEYS}.amountOff`,
          { base: money(discount.base), value },
        )}
      </p>
      <p>
        {discount.applicationsMax === undefined
          ? t(`${KEYS}.applicationUnbounded`, {
              application: discount.application,
            })
          : t(`${KEYS}.application`, {
              application: discount.application,
              max: discount.applicationsMax,
            })}
      </p>
      {targets.length > 0 ? (
        <p>
          {t(`${KEYS}.bearsOn`, {
            targets: list.format(targets),
          })}
        </p>
      ) : null}
    </div>
  );
}
