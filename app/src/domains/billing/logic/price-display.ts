import type { TFunction } from 'i18next';
import type { Entitlement, Price, PriceMeter } from '@/api-client';
import { formatUnitAmountDecimal } from '@/lib/money';
import {
  BILLING_MODEL_LABEL_KEYS,
  BILLING_PERIOD_SUFFIX_KEYS,
} from './price-labels';

/**
 * The meter of a price as the helpers read it. The API sends null for a price that
 * measures nothing, and the catalogue and the price forms leave the member out: both
 * mean the price has none.
 */
export type PriceMeterMember = { metered?: PriceMeter | null };

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
 * What one sale unit of a metered price is called: the sale unit the
 * entitlement names ("1k requests") when the price was captured with one, else
 * the number of base units it stands for ("100,000 traces"), and the base unit
 * alone when a sale unit is one of them ("call").
 */
export function getPriceUnitLabel(
  meter: PriceMeter,
  entitlement: EntitlementLabels | undefined,
  formatFactor: (factor: number) => string,
): string {
  if (meter.saleUnitSingular) {
    return meter.saleUnitSingular;
  }
  const factor = Number(meter.saleUnitFactor);
  if (!Number.isFinite(factor) || factor === 1) {
    return (
      entitlement?.unitSingular ?? entitlement?.name ?? meter.entitlementSlug
    );
  }

  return `${formatFactor(factor)} ${
    entitlement?.unitPlural ?? entitlement?.name ?? meter.entitlementSlug
  }`;
}

/**
 * An amount of a price, written from its decimal string in minor units with every
 * decimal it has (`0.2` cents is $0.002), and what it is for: a period for a
 * flat fee, a sale unit for a metered price. A metered price is never added to
 * anything: one per sale unit is read for what it is.
 */
export function getPriceAmountParts(
  price: Pick<Price, 'billingPeriod' | 'currency' | 'unitAmountDecimal'> &
    PriceMeterMember,
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

    return { amount, suffix: t('Features.Billing.Price.perUnit', { unit }) };
  }

  return {
    amount,
    suffix: price.billingPeriod
      ? t(BILLING_PERIOD_SUFFIX_KEYS[price.billingPeriod])
      : '',
  };
}

/**
 * What a price is called on screen: its label, else what it bills, as the API
 * words the line of an invoice: the entitlement a metered price measures, and a
 * flat fee by its shape.
 */
export function getPriceLabel(
  price: Pick<Price, 'billingModel' | 'displayLabel'> & PriceMeterMember,
  entitlement: Pick<Entitlement, 'name'> | undefined,
  t: TFunction,
): string {
  if (price.displayLabel) {
    return price.displayLabel;
  }
  if (price.metered) {
    return entitlement?.name ?? price.metered.entitlementSlug;
  }

  return t(BILLING_MODEL_LABEL_KEYS[price.billingModel]);
}

/** The same as one string: "$29.00/month", "$1.50 per 1k requests". */
export function joinPriceAmount({ amount, suffix }: PriceAmountParts): string {
  if (suffix === '') {
    return amount;
  }

  return suffix.startsWith('/') ? `${amount}${suffix}` : `${amount} ${suffix}`;
}
