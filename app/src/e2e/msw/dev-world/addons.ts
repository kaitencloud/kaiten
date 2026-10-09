import type { Addon, Entitlement, InstanceAddon, License } from '@/api-client';
import {
  buildAddon,
  buildAddonGrant,
  buildInstanceAddon,
  buildPrice,
} from '../../../../e2e/app/_support/fixtures';
import type { AddonCatalogueSeed } from '../../../../e2e/app/_support/model/billing-addon-catalogue';
import { dayStart } from './billing';
import { daysAgo } from './dates';

/** The slug of the family a license version belongs to: the slug of its first version. */
export const licenseFamilySlug = (license: License): string =>
  (license.familyId ?? license.id).replace(/^family-/, '');

/**
 * Four families of add-ons, sold on top of the licenses of the world. Extra seats
 * carries the lifecycle (v1 on sale and the default, v2 being prepared with a
 * monthly price only); Extra storage has its first version withdrawn and a second on
 * sale; Priority support is sold on request and has no price; Analytics preview is
 * free. The families fit the licenses they make sense on: Enterprise already
 * includes priority support, and the trial is free to try.
 */
const FAMILIES = {
  analytics: {
    description: 'Try the advanced analytics dashboard before moving up a plan',
    name: 'Analytics preview',
    slug: 'analytics-preview',
  },
  seats: {
    description: 'More named users on an instance, five at a time',
    name: 'Extra seats',
    slug: 'extra-seats',
  },
  storage: {
    description: 'More disk space for the files of an instance',
    name: 'Extra storage',
    slug: 'extra-storage',
  },
  support: {
    description: 'Answers from the support team within four hours',
    name: 'Priority support',
    slug: 'priority-support-pack',
  },
} as const;

type AddonsWorld = {
  entitlements: Entitlement[];
  licenses: License[];
};

/** The versions of every family, newest family first, as the catalogue lists them. */
const createVersions = (): Addon[] => [
  buildAddon({
    createdAt: daysAgo(14),
    description: FAMILIES.analytics.description,
    familySlug: FAMILIES.analytics.slug,
    isDefault: true,
    name: FAMILIES.analytics.name,
    pricingType: 'FREE',
    slug: 'analytics-preview',
    versionName: '2026',
  }),
  buildAddon({
    createdAt: daysAgo(6),
    description: FAMILIES.seats.description,
    familySlug: FAMILIES.seats.slug,
    lifecycleState: 'DRAFT',
    maxQuantity: 20,
    name: FAMILIES.seats.name,
    slug: 'extra-seats-v2',
    version: 2,
    versionName: '2027',
  }),
  buildAddon({
    createdAt: daysAgo(60),
    description: FAMILIES.support.description,
    familySlug: FAMILIES.support.slug,
    isDefault: true,
    maxQuantity: 1,
    name: FAMILIES.support.name,
    pricingType: 'CUSTOM',
    slug: 'priority-support-pack',
    versionName: '2026',
  }),
  buildAddon({
    createdAt: daysAgo(90),
    description: FAMILIES.storage.description,
    familySlug: FAMILIES.storage.slug,
    isDefault: true,
    maxQuantity: 20,
    name: FAMILIES.storage.name,
    slug: 'extra-storage-v2',
    version: 2,
    versionName: '2026',
  }),
  buildAddon({
    createdAt: daysAgo(240),
    description: FAMILIES.seats.description,
    familySlug: FAMILIES.seats.slug,
    isDefault: true,
    maxQuantity: 10,
    name: FAMILIES.seats.name,
    slug: 'extra-seats',
    versionName: '2026',
  }),
  buildAddon({
    createdAt: daysAgo(300),
    description: FAMILIES.storage.description,
    familySlug: FAMILIES.storage.slug,
    lifecycleState: 'ARCHIVED',
    maxQuantity: 5,
    name: FAMILIES.storage.name,
    slug: 'extra-storage',
    versionName: '2025',
  }),
];

const price = (
  addonSlug: string,
  period: 'annual' | 'monthly',
  label: string,
  amount: string,
  displayOrder: number,
  ageInDays: number,
) =>
  buildPrice({
    billingPeriod: period === 'annual' ? 'ANNUAL' : 'MONTHLY',
    createdAt: daysAgo(ageInDays),
    displayLabel: label,
    displayOrder,
    id: `${addonSlug}-${period}`,
    isDefault: true,
    unitAmountDecimal: amount,
  });

/**
 * What a flat fee of each version costs. Amounts are minor units: '1000' is $10.00.
 * Extra seats v1 sells both periods, so that an instance billed either way can
 * attach it; v2 sells a monthly fee only, and says so. The older Extra storage
 * kept a price it no longer offers.
 */
const createPrices = () => {
  const seatsMonthly = price(
    'extra-seats',
    'monthly',
    'Extra seat, monthly',
    '1000',
    1,
    240,
  );
  const seatsAnnual = price(
    'extra-seats',
    'annual',
    'Extra seat, annual',
    '10000',
    2,
    240,
  );
  const storageMonthly = price(
    'extra-storage',
    'monthly',
    'Extra storage, monthly',
    '500',
    2,
    300,
  );

  return {
    prices: {
      'extra-seats': [seatsMonthly, seatsAnnual],
      'extra-seats-v2': [
        price('extra-seats-v2', 'monthly', 'Extra seat, monthly', '1200', 1, 6),
      ],
      'extra-storage': [
        buildPrice({
          billingPeriod: 'MONTHLY',
          createdAt: daysAgo(300),
          deprecatedAt: daysAgo(200),
          displayLabel: 'Extra storage, monthly (launch)',
          displayOrder: 1,
          id: 'extra-storage-launch',
          status: 'DEPRECATED',
          unitAmountDecimal: '600',
        }),
        storageMonthly,
      ],
      'extra-storage-v2': [
        price(
          'extra-storage-v2',
          'monthly',
          'Extra storage, monthly',
          '800',
          1,
          90,
        ),
        price(
          'extra-storage-v2',
          'annual',
          'Extra storage, annual',
          '8000',
          2,
          90,
        ),
      ],
    },
    seatsAnnual,
    seatsMonthly,
    storageMonthly,
  };
};

/**
 * What each version grants per unit. Extra seats adds five seats a unit; its next
 * version adds API calls as well, with an overage below the one Business allows,
 * which the grant says; Extra storage adds disk; Priority support and the analytics
 * preview switch a flag on.
 */
const createGrants = () => ({
  'analytics-preview': [
    buildAddonGrant({
      addonSlug: 'analytics-preview',
      entitlementSlug: 'advanced-analytics',
      value: true,
    }),
  ],
  'extra-seats': [
    buildAddonGrant({
      addonSlug: 'extra-seats',
      behavior: 'ADD',
      entitlementSlug: 'seats',
      value: 5,
    }),
  ],
  'extra-seats-v2': [
    buildAddonGrant({
      addonSlug: 'extra-seats-v2',
      behavior: 'ADD',
      entitlementSlug: 'seats',
      value: 5,
    }),
    buildAddonGrant({
      addonSlug: 'extra-seats-v2',
      behavior: 'ADD',
      entitlementSlug: 'api-calls',
      overagePercent: 5,
      value: 5_000,
    }),
  ],
  'extra-storage': [
    buildAddonGrant({
      addonSlug: 'extra-storage',
      behavior: 'ADD',
      entitlementSlug: 'storage-gb',
      value: 50,
    }),
  ],
  'extra-storage-v2': [
    buildAddonGrant({
      addonSlug: 'extra-storage-v2',
      behavior: 'ADD',
      entitlementSlug: 'storage-gb',
      value: 100,
    }),
  ],
  'priority-support-pack': [
    buildAddonGrant({
      addonSlug: 'priority-support-pack',
      entitlementSlug: 'priority-support',
      value: true,
    }),
  ],
});

/** The license families each version fits, by the slug of the family. */
const COMPATIBILITY: Record<string, string[]> = {
  'analytics-preview': ['starter', 'trial'],
  'extra-seats': ['business', 'enterprise', 'starter'],
  'extra-seats-v2': ['business', 'starter'],
  'extra-storage': ['business', 'enterprise', 'starter'],
  'extra-storage-v2': ['business', 'enterprise', 'starter'],
  'priority-support-pack': ['business', 'starter'],
};

/**
 * The add-on catalogue of the world and what the instances hold of it. Globex
 * Staging runs two extra seats, which a cancellation offers to take off; Acme
 * Production runs five, paid a year at a time; Acme US keeps three units of the
 * storage version that was withdrawn since, which stays on the instance that holds
 * it; Globex Production has the priority support pack, which is sold on request and
 * bills nothing; Acme Legacy had a seat and lost it when its subscription ended.
 * Gamma Production is not billed yet and holds nothing.
 */
export function createAddons({ entitlements, licenses }: AddonsWorld): {
  addonCatalogue: AddonCatalogueSeed;
  attachments: Record<string, InstanceAddon[]>;
} {
  const versions = createVersions();
  const { prices, seatsAnnual, seatsMonthly, storageMonthly } = createPrices();
  const version = (slug: string) => {
    const found = versions.find((candidate) => candidate.slug === slug);
    if (!found) {
      throw new Error(`The dev world has no add-on "${slug}"`);
    }

    return found;
  };

  return {
    addonCatalogue: {
      compatibility: COMPATIBILITY,
      entitlements: Object.fromEntries(
        entitlements.flatMap(({ slug, type }) =>
          slug && type ? [[slug, type]] : [],
        ),
      ),
      grants: createGrants(),
      licenseFamilies: [...new Set(licenses.map(licenseFamilySlug))],
      prices,
      // The seats are what a buyer finds in the public catalogue.
      publicFamilies: [FAMILIES.seats.slug],
      versions,
    },
    attachments: {
      'acme-legacy': [
        buildInstanceAddon({
          addon: version('extra-seats'),
          attachedAt: dayStart(320),
          id: 'instance-addon-acme-legacy-seats',
          quantity: 1,
          removedAt: dayStart(100),
        }),
      ],
      'acme-production': [
        buildInstanceAddon({
          addon: version('extra-seats'),
          attachedAt: dayStart(120),
          id: 'instance-addon-acme-production-seats',
          prices: [seatsAnnual],
          quantity: 5,
        }),
      ],
      'acme-us': [
        buildInstanceAddon({
          addon: version('extra-storage'),
          attachedAt: dayStart(100),
          id: 'instance-addon-acme-us-storage',
          prices: [storageMonthly],
          quantity: 3,
        }),
      ],
      'globex-production': [
        buildInstanceAddon({
          addon: version('priority-support-pack'),
          attachedAt: dayStart(9),
          id: 'instance-addon-globex-production-support',
          quantity: 1,
        }),
      ],
      'globex-staging': [
        buildInstanceAddon({
          addon: version('extra-seats'),
          attachedAt: dayStart(30),
          id: 'instance-addon-globex-staging-seats',
          prices: [seatsMonthly],
          quantity: 2,
        }),
      ],
    },
  };
}
