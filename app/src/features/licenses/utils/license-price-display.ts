import type { TFunction } from 'i18next';
import type { Entitlement, Price } from '@/api-client';
import { formatUnitAmountDecimal } from '@/lib/money';
import { BILLING_PERIOD_SUFFIX_KEYS } from './license-price-labels';
import { getPriceUnitLabel } from './license-price.utils';

/** A price as it is read: its amount, and what the amount is for. */
export type PriceAmountParts = {
  amount: string;
  /** "/month", "per 1k requests": empty on a price that has no period and no meter. */
  suffix: string;
};

type EntitlementLabels = Pick<
  Entitlement,
  'name' | 'unitPlural' | 'unitSingular'
>;

/**
 * An amount of a price, written from its decimal string in minor units with every
 * decimal it has (`0.2` cents is $0.002), and what it is for: a period for a
 * flat fee, a sale unit for a metered price. A metered price is never added to
 * anything: one per sale unit is read for what it is.
 */
export function getPriceAmountParts(
  price: Pick<
    Price,
    'billingPeriod' | 'currency' | 'metered' | 'unitAmountDecimal'
  >,
  entitlement: EntitlementLabels | undefined,
  t: TFunction,
  locale: string,
): PriceAmountParts {
  const amount = formatUnitAmountDecimal(
    price.currency,
    price.unitAmountDecimal,
    locale,
  );
  if (price.metered) {
    const unit = getPriceUnitLabel(price.metered, entitlement, (factor) =>
      factor.toLocaleString(locale),
    );

    return { amount, suffix: t('Pages.Licenses.Prices.perUnit', { unit }) };
  }

  return {
    amount,
    suffix: price.billingPeriod
      ? t(BILLING_PERIOD_SUFFIX_KEYS[price.billingPeriod])
      : '',
  };
}

/** The same as one string: "$29.00/month", "$1.50 per 1k requests". */
export function joinPriceAmount({ amount, suffix }: PriceAmountParts): string {
  if (suffix === '') {
    return amount;
  }

  return suffix.startsWith('/') ? `${amount}${suffix}` : `${amount} ${suffix}`;
}
