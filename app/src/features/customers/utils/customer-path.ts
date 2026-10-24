/**
 * The slugs that a static route under `/customers` shadows: the router matches a static
 * segment before the `$customerSlug` one, so `/customers/checkout-sessions`,
 * `/customers/instances` and `/customers/new` are the list of checkouts, the list of
 * instances and the creation dialog, never the page of a customer that has one of these
 * as its slug. The API takes any slug, so the form of a customer refuses these, and the
 * customers an API client made with one are reached through `/overview`.
 */
export const SHADOWED_CUSTOMER_SLUGS: ReadonlySet<string> = new Set([
  'checkout-sessions',
  'instances',
  'new',
]);

/**
 * The slugs whose page also has an address under `/overview`. The static route of
 * `/customers/instances` has a segment of its own below it, which would take `overview`
 * for an instance, so the customer of that slug has no such address.
 */
const OVERVIEW_SLUGS: ReadonlySet<string> = new Set([
  'checkout-sessions',
  'new',
]);

const OVERVIEW_SUFFIX = '/overview';

export const isShadowedCustomerSlug = (slug: string): boolean =>
  SHADOWED_CUSTOMER_SLUGS.has(slug);

/**
 * Where the page of a customer is: `/customers/<slug>`, or, for a customer whose slug a
 * static route shadows, `/customers/<slug>/overview`, which is the same page. Every link
 * of this feature to a customer goes through it.
 */
export function getCustomerDetailTarget(customerSlug: string) {
  return {
    params: { customerSlug },
    to: OVERVIEW_SLUGS.has(customerSlug)
      ? ('/customers/$customerSlug/overview' as const)
      : ('/customers/$customerSlug' as const),
  };
}

/**
 * The same address as a string, for a place that has no router to build it: the page
 * the payment provider sends a customer back to. `/customers/<slug>` would be the list of
 * checkouts, or the creation dialog, for a slug that a static route takes.
 */
export const getCustomerDetailPath = (customerSlug: string): string =>
  `/customers/${encodeURIComponent(customerSlug)}${
    OVERVIEW_SLUGS.has(customerSlug) ? OVERVIEW_SUFFIX : ''
  }`;
