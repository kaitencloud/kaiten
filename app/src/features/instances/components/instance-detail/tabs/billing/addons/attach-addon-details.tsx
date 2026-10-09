import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Addon, InstanceBilling, Price } from '@/api-client';
import {
  addonPricesQueryOptions,
  BILLING_PERIOD_LABEL_KEYS,
  PriceAmount,
} from '@/domains/billing';

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  custom: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.custom',
  free: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.free',
  loading:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.loading',
  none: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.none',
  perUnit:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.perUnit',
  unknown:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.unknown',
} as const;

/**
 * The flat fee a subscription would bill for a version: the default one of its
 * billing period, which is what an attachment is charged at. A version without one
 * for the period cannot be attached to a subscription billed on it.
 */
export function getPeriodFee(
  prices: readonly Price[],
  period: InstanceBilling['billingPeriod'],
): Price | undefined {
  return prices.find(
    (price) =>
      price.billingModel === 'FLAT_FEE' &&
      price.status === 'ACTIVE' &&
      price.isDefault &&
      price.billingPeriod === period,
  );
}

type AttachAddonDetailsProps = {
  addon: Addon;
  period: InstanceBilling['billingPeriod'];
};

function PriceLine({ addon, period }: AttachAddonDetailsProps) {
  const { t } = useTranslation();
  const prices = useQuery({
    ...addonPricesQueryOptions(addon.slug),
    enabled: addon.pricingType === 'PAID',
  });

  if (addon.pricingType === 'FREE') {
    return <>{t(KEYS.free)}</>;
  }
  if (addon.pricingType === 'CUSTOM') {
    return <>{t(KEYS.custom)}</>;
  }
  if (prices.isPending) {
    return <>{t(KEYS.loading)}</>;
  }
  if (prices.isError) {
    return <>{t(KEYS.unknown)}</>;
  }
  const fee = getPeriodFee(prices.data, period);

  return fee ? (
    <>
      <PriceAmount price={fee} /> {t(KEYS.perUnit)}
    </>
  ) : (
    <>{t(KEYS.none, { period: t(BILLING_PERIOD_LABEL_KEYS[period]) })}</>
  );
}

/**
 * What the dialog says of the version chosen before it is attached: what it is, and
 * what the subscription will bill for it, from its next renewal, per unit. A version
 * without a price for the period the subscription bills on is said not to have one,
 * and the API refuses it.
 */
export function AttachAddonDetails({ addon, period }: AttachAddonDetailsProps) {
  return (
    <div
      className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm"
      data-testid="attach-addon-details"
    >
      {addon.description ? <p>{addon.description}</p> : null}
      <p className="text-muted-foreground">
        <PriceLine addon={addon} period={period} />
      </p>
    </div>
  );
}
