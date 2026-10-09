import {
  listAddonCompatibilityOptions,
  listAddonPricesOptions,
} from '@/api-client/@tanstack/react-query.gen';
import { allLicenseFamiliesOptions } from '@/lib/api/all-pages-query-options';

// What the screens of the add-ons and the Billing tab of an instance both read about
// a version, so that the two ask the same way and under the same keys. None is
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
