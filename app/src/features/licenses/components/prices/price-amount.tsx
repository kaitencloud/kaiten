import { useTranslation } from 'react-i18next';
import type { Entitlement, Price } from '@/api-client';
import { cn } from '@/lib/utils';
import { getPriceAmountParts } from '@/domains/billing';

type PriceAmountProps = {
  className?: string;
  /** The entitlement a metered price measures, for the name of its unit. */
  entitlement?: Pick<Entitlement, 'name' | 'unitPlural' | 'unitSingular'>;
  price: Pick<
    Price,
    'billingPeriod' | 'currency' | 'metered' | 'unitAmountDecimal'
  >;
};

/**
 * What a price charges: `$29.00/month` for a flat fee, `$1.50 per 1k requests`
 * for a metered price. The amount of a metered price is per sale unit, so it is
 * never summed into anything else, a headline included.
 */
export function PriceAmount({
  className,
  entitlement,
  price,
}: PriceAmountProps) {
  const { i18n, t } = useTranslation();
  const { amount, suffix } = getPriceAmountParts(
    price,
    entitlement,
    t,
    i18n.language,
  );

  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      <span className="font-medium">{amount}</span>
      {suffix ? (
        <span
          className={cn(
            'text-muted-foreground',
            // "/month" sticks to the amount, "per 1k requests" follows it.
            !suffix.startsWith('/') && 'ml-1',
          )}
        >
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
