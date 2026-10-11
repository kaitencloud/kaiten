import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Addon, InstanceBilling, Price } from '@/api-client';
import {
  addonPricesQueryOptions,
  BILLING_PERIOD_LABEL_KEYS,
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
  PriceAmount,
} from '@/domains/billing';
import {
  getMeteredPrices,
  hasActiveFlatFee,
} from '../../../../../utils/instance-addons.utils';

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  custom: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.custom',
  free: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.free',
  loading:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.loading',
  metered:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.metered',
  meteredOnly:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.meteredOnly',
  none: 'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.none',
  perUnit:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.perUnit',
  unknown:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.unknown',
  unpriced:
    'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Price.unpriced',
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

// "API calls, extra pack: $0.15 per api-calls": each metered price by its name and the
// way its amount is read everywhere else.
function useMeteredText(prices: readonly Price[]): string {
  const { i18n, t } = useTranslation();

  return getMeteredPrices(prices)
    .map(
      (price) =>
        `${getPriceLabel(price, undefined, t)}: ${joinPriceAmount(
          getPriceAmountParts(price, undefined, t, i18n.language),
        )}`,
    )
    .join('; ');
}

// What a subscription bills for a version, once its prices are read: the default flat
// fee of its period, and the usage it rates on top; a version that sells no flat fee has
// no price of a period to ask for, and bills its usage only.
function PricedLine({
  period,
  prices,
}: {
  period: InstanceBilling['billingPeriod'];
  prices: readonly Price[];
}) {
  const { t } = useTranslation();
  const usage = useMeteredText(prices);
  const fee = getPeriodFee(prices, period);

  if (fee) {
    return (
      <>
        <PriceAmount price={fee} /> {t(KEYS.perUnit)}
        {usage ? ` ${t(KEYS.metered, { prices: usage })}` : null}
      </>
    );
  }
  if (!hasActiveFlatFee(prices)) {
    return (
      <>{usage ? t(KEYS.meteredOnly, { prices: usage }) : t(KEYS.unpriced)}</>
    );
  }

  return <>{t(KEYS.none, { period: t(BILLING_PERIOD_LABEL_KEYS[period]) })}</>;
}

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

  return <PricedLine period={period} prices={prices.data} />;
}

/**
 * What the dialog says of the version chosen before it is attached: what it is, and
 * what the subscription will bill for it, from its next renewal, per unit. A version
 * that sells a flat fee and has none for the period the subscription bills on is said
 * not to have one, and the API refuses it; one that sells none bills its usage only,
 * and attaches to any period.
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
