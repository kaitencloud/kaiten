import { BILLING_PERIODS } from './price-types';
import type { CatalogPrice, LicenseWithPrices } from './license-catalogue';

/**
 * What the list of licenses says of how a version is sold, from its pricing type and
 * its active prices:
 * - `free` and `custom` say so, with no amount: a free version has nothing to
 *   charge, a custom one is sold by conversation;
 * - `priced` lists the flat fee of each billing period it has, shortest first, and
 *   whether usage is billed on top; neither is ever added to the other;
 * - `unpriced` is a version that is sold and has no active price yet, which no
 *   subscription can start on.
 */
export type LicensePriceSummary =
  | { kind: 'custom' }
  | { kind: 'free' }
  | { flatFees: CatalogPrice[]; kind: 'priced'; usage: boolean }
  | { kind: 'unpriced' };

/**
 * The flat fee a billing period is shown at: the one the version puts forward for
 * that period (`isDefault`), else the first the API lists. The amounts are the API's:
 * the summary adds nothing up and works out no monthly equivalent.
 */
function pickFlatFees(prices: readonly CatalogPrice[]): CatalogPrice[] {
  const flatFees = prices.filter((price) => price.billingModel === 'FLAT_FEE');

  return BILLING_PERIODS.flatMap((period) => {
    const ofPeriod = flatFees.filter((price) => price.billingPeriod === period);
    const shown = ofPeriod.find((price) => price.isDefault) ?? ofPeriod[0];

    return shown ? [shown] : [];
  });
}

/**
 * The summary of a version, or nothing when the console does not know how it is sold
 * (a pricing type the contract does not have): it then says nothing rather than
 * guess.
 */
export function getLicensePriceSummary(
  license: Pick<LicenseWithPrices, 'prices' | 'pricingType'>,
): LicensePriceSummary | null {
  switch (license.pricingType) {
    case 'FREE':
      return { kind: 'free' };
    case 'CUSTOM':
      return { kind: 'custom' };
    case 'PAID': {
      const flatFees = pickFlatFees(license.prices);
      const usage = license.prices.some(
        (price) => price.billingModel !== 'FLAT_FEE',
      );

      return flatFees.length === 0 && !usage
        ? { kind: 'unpriced' }
        : { flatFees, kind: 'priced', usage };
    }
    default:
      return null;
  }
}
