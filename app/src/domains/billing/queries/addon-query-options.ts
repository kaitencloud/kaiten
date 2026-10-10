import {
  listAddonCompatibilityOptions,
  listAddonPricesOptions,
} from '@/api-client/@tanstack/react-query.gen';
import { allAddonsOptions } from '@/lib/api/all-billing-pages-query-options';
import { allLicenseFamiliesOptions } from '@/lib/api/all-pages-query-options';

// What the screens of the add-ons, the Billing tab of an instance and the vouchers all
// read about a version, so that they ask the same way and under the same keys. None is
// retried: a refusal of billing is the screen's to show, with a way to ask again, and
// one that the route's loader met is the answer.

/** The license families a version fits: none, and it is attachable to nothing. */
export const addonCompatibilityQueryOptions = (addonSlug: string) => ({
  ...listAddonCompatibilityOptions({ path: { addonSlug } }),
  retry: false,
  retryOnMount: false,
});

/** The prices of one version, in the order the API lists them: display order, then id. */
export const addonPricesQueryOptions = (addonSlug: string) => ({
  ...listAddonPricesOptions({ path: { addonSlug } }),
  retry: false,
  retryOnMount: false,
});

/**
 * The license families of the organization: what a version is declared compatible
 * with, and where the family of an instance is found, since a license names its
 * family by id and the compatibility of a version by slug.
 */
export const addonLicenseFamiliesQueryOptions = () => ({
  ...allLicenseFamiliesOptions(),
  retry: false,
  retryOnMount: false,
});

/**
 * Every version of every add-on, whatever its state: what names the add-ons an
 * instance holds or a voucher applies to, which may have been withdrawn from sale
 * since, and what the selector of an add-on to attach is drawn from, the versions on
 * sale among them. The add-on API pages the versions (fifty a page unless asked for
 * more), and the read walks every page, so that a catalogue of more than a page is
 * whole in the selector. It keeps the generated key of the operation, so that the
 * invalidation of the catalogue reaches it.
 */
export const addonVersionsQueryOptions = () => ({
  ...allAddonsOptions(),
  retry: false,
  retryOnMount: false,
});
