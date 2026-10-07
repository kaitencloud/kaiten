import type { License, Price } from '@/api-client';

/**
 * The prices an instance can be subscribed on: the active flat fees of its
 * license version, default first and then in the order the version shows them.
 * A subscription is pinned to a flat fee, so a metered price, which bills what is
 * used and has no amount per period, is never offered, and neither is one that
 * was deprecated.
 */
export function getBasePriceOptions(prices: readonly Price[]): Price[] {
  return prices
    .filter(
      (price) => price.billingModel === 'FLAT_FEE' && price.status === 'ACTIVE',
    )
    .sort(
      (left, right) =>
        Number(right.isDefault) - Number(left.isDefault) ||
        left.displayOrder - right.displayOrder ||
        left.id.localeCompare(right.id),
    );
}

/** The price a subscription is pinned to when none is chosen: the default one, else the first. */
export function getDefaultBasePrice(
  options: readonly Price[],
): Price | undefined {
  return options.find((price) => price.isDefault) ?? options[0];
}

/** Why an instance cannot be subscribed to, when it cannot. */
export type SubscribeBlock = 'license-not-published';

/**
 * Whether the license version of the instance can be subscribed to. Only a
 * version on sale can: a draft is not, and a withdrawn one is not either. A
 * version with no state reads as published, as it does everywhere else.
 */
export function getSubscribeBlock(
  license: Pick<License, 'lifecycleState'> | null | undefined,
): SubscribeBlock | undefined {
  const state = license?.lifecycleState ?? 'PUBLISHED';

  return state === 'PUBLISHED' ? undefined : 'license-not-published';
}
