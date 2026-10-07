import { useTranslation } from 'react-i18next';
import type { Entitlement, Price } from '@/api-client';
import {
  getPriceAmountParts,
  joinPriceAmount,
} from '../../utils/license-price-display';
import { isActivePrice, isMeteredModel } from '../../utils/license-price.utils';

type PriceSummaryProps = {
  className?: string;
  /** The catalogue, by slug, for the names of the units a metered price is per. */
  entitlementBySlug: ReadonlyMap<string, Entitlement>;
  prices: readonly Price[];
};

/**
 * What a version bills, in one line: its flat fees, each for its period, then
 * each metered price per its own sale unit. The flat fees are alternatives (a
 * monthly and an annual one), so they are joined by "or"; the metered ones are
 * added to the base, so they are joined by "+". Nothing is added up: a price per
 * unit has no total, and a headline that summed it with a flat fee would state a
 * price nobody is billed.
 */
export function PriceSummary({
  className,
  entitlementBySlug,
  prices,
}: PriceSummaryProps) {
  const { i18n, t } = useTranslation();
  const active = prices.filter(isActivePrice);
  const text = (price: Price) =>
    joinPriceAmount(
      getPriceAmountParts(
        price,
        price.metered
          ? entitlementBySlug.get(price.metered.entitlementSlug)
          : undefined,
        t,
        i18n.language,
      ),
    );
  const flatFees = active
    .filter((price) => !isMeteredModel(price.billingModel))
    .map(text);
  const metered = active
    .filter((price) => isMeteredModel(price.billingModel))
    .map((price) =>
      price.billingModel === 'OVERAGE'
        ? t('Pages.Licenses.Prices.Summary.overage', { price: text(price) })
        : text(price),
    );
  const summary = [
    flatFees.join(` ${t('Pages.Licenses.Prices.Summary.or')} `),
    ...metered,
  ]
    .filter(Boolean)
    .join(' + ');

  return (
    <p className={className} data-testid="price-summary">
      {summary === '' ? t('Pages.Licenses.Prices.Summary.empty') : summary}
    </p>
  );
}
