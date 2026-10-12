import type { Addon, AddonFamily } from '@/api-client';

/**
 * A family as the list draws it: the product, with the versions of it that the
 * filters of the page keep. The versions are the API's, newest first.
 */
export type AddonGroup = {
  /** The version the family resolves to, when it has a default. */
  defaultVersion: Addon | undefined;
  family: AddonFamily;
  /**
   * The version the family is shown under and a new version starts from: the one
   * the API resolves the family to, else its newest version.
   */
  head: Addon | undefined;
  /** What the product is called: its head version's name. */
  name: string;
  versions: Addon[];
};

/** The state of a version, as the API spells it. */
export type AddonLifecycleState = Addon['lifecycleState'];

/** What a version is sold as, as the API spells it. */
export type AddonPricingType = Addon['pricingType'];

/** An instance that holds a version of an add-on, and how many units of it. */
export type AddonHolder = {
  instanceName: string;
  instanceSlug: string;
  quantity: number;
};
