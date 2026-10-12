import type { Price } from '@/api-client';
import { isActivePrice } from './license-price.utils';

/**
 * What an invoice preview of a version starts from and measures. The API
 * composes the renewal a subscription would be billed: a flat fee as its base,
 * and the usage of each entitlement a metered price rates. So the console offers
 * the flat fees that can be billed, and one sample per entitlement that is
 * metered, and leaves the composition to the API.
 */

/** The flat fees an invoice may start from: the active ones. */
export const getPreviewBases = (prices: readonly Price[]): Price[] =>
  prices.filter(
    (price) => price.billingModel === 'FLAT_FEE' && isActivePrice(price),
  );

/**
 * The base the API takes when none is named: the first active default flat fee
 * in display order. A version with none must name one.
 */
export const getDefaultBase = (prices: readonly Price[]): Price | undefined =>
  getPreviewBases(prices).find((price) => price.isDefault);

/** What the preview starts on: the default, else the first flat fee there is. */
export const getInitialBase = (prices: readonly Price[]): Price | undefined =>
  getDefaultBase(prices) ?? getPreviewBases(prices)[0];

/** A price that rates what an entitlement measured, and the entitlement it names. */
export type PreviewMeter = { entitlementSlug: string; price: Price };

/**
 * The entitlements a sample usage may be given for: those an active metered
 * price rates, in the order of the prices. An entitlement nothing rates produces
 * no line, whatever it used.
 */
export function getPreviewMeters(prices: readonly Price[]): PreviewMeter[] {
  return prices.flatMap((price) =>
    isActivePrice(price) && price.metered
      ? [{ entitlementSlug: price.metered.entitlementSlug, price }]
      : [],
  );
}
