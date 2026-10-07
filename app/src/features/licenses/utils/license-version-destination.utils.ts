import type { License } from '@/api-client';
import { PriceCopyError } from './license-price-copy.utils';

type PricesDestination = {
  params: { licenseSlug: string };
  search?: { copyFrom?: string };
  to: '/licenses/$licenseSlug/prices';
};

type OverviewDestination = {
  params: { licenseSlug: string };
  to: '/licenses/$licenseSlug';
};

/** Where a version that was just created opens, as the options of a navigation. */
export type CreatedVersionDestination = OverviewDestination | PricesDestination;

type CreatedVersion = {
  /** The slug of the version the new one starts from. */
  baseSlug: string | undefined;
  /** What failed after the version was created, which left it a draft. */
  error?: unknown;
  /** Whether the version was given the prices of its base. */
  hasPrices: boolean;
  license: Pick<License, 'slug'>;
};

/**
 * Where a new version opens, when it opens anywhere but the list. A version
 * that stayed a draft because something failed after it was created has its own
 * page, which is where it is finished: on its prices when it is a copy of them
 * that stopped, since that is where the rest of the copy is offered, and on its
 * overview otherwise. A version that was given prices opens on them, which are
 * what there is to review, and to change while it is a draft. Any other version
 * has no page of its own to go to.
 */
export function getCreatedVersionDestination({
  baseSlug,
  error,
  hasPrices,
  license,
}: CreatedVersion): CreatedVersionDestination | undefined {
  if (!license.slug) {
    return undefined;
  }
  const params = { licenseSlug: license.slug };

  if (error) {
    return error instanceof PriceCopyError
      ? {
          params,
          search: { copyFrom: baseSlug },
          to: '/licenses/$licenseSlug/prices',
        }
      : { params, to: '/licenses/$licenseSlug' };
  }

  return hasPrices
    ? { params, to: '/licenses/$licenseSlug/prices' }
    : undefined;
}
