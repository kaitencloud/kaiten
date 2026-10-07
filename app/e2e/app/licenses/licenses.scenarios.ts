import type { License } from '@/api-client';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
  buildPrice,
} from '../_support/fixtures';
import { LicenseAppModel } from '../_support/model/license-app-model';

const starterVersion = (
  version: number,
  versionName: string,
  lifecycleState: License['lifecycleState'],
  isDefault = false,
) =>
  buildLicense({
    createdAt: `2026-02-0${version}T09:00:00.000Z`,
    description: `Starter plan, ${versionName} release`,
    familyId: 'family-starter',
    id: `license-starter-v${version}`,
    isDefault,
    lifecycleState,
    name: 'Starter',
    // A family takes the slug of the version that opened it, and later
    // versions are slugged after the family.
    slug: version === 1 ? 'starter' : `starter-v${version}`,
    type: 'PAID',
    version: String(version),
    versionName,
  });

/**
 * One family carrying the whole lifecycle: v1 withdrawn, v2 the published
 * default, v3 published, and v4 still being prepared.
 */
export function createLicenseCatalogModel() {
  return new LicenseAppModel({
    licenses: [
      starterVersion(1, 'Legacy', 'ARCHIVED'),
      starterVersion(2, 'GA', 'PUBLISHED', true),
      starterVersion(3, 'Spring', 'PUBLISHED'),
      starterVersion(4, 'Next', 'DRAFT'),
    ],
  });
}

/**
 * A family whose version names end in a number, so the version form suggests
 * the next one ("Starter v3") and comes complete without any edit.
 */
export function createNumberedLicenseFamilyModel() {
  return new LicenseAppModel({
    licenses: [
      starterVersion(1, 'Starter v1', 'PUBLISHED', true),
      starterVersion(2, 'Starter v2', 'PUBLISHED'),
    ],
  });
}

// --- Priced versions ------------------------------------------------------

/**
 * The catalogue the pricing of a version reads: flows a price may meter
 * (traces, requests, credits), a stock (seats), a counter nothing can rate
 * (latency, which is averaged), and the flag and the configuration a version
 * also grants.
 */
const traces = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Traces',
  resetPeriod: 'MONTH',
  saleUnit: { factor: 100_000, label: '100,000 traces' },
  slug: 'traces',
  unit: { plural: 'traces', singular: 'trace' },
});
const requests = buildEntitlement({
  aggregationMethod: 'COUNT',
  name: 'Requests',
  resetPeriod: 'DAY',
  saleUnit: { factor: 1_000, label: '1k requests' },
  slug: 'requests',
  unit: { plural: 'requests', singular: 'request' },
});
const seats = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Seats',
  slug: 'seats',
  unit: { plural: 'seats', singular: 'seat' },
});
const latency = buildEntitlement({
  aggregationMethod: 'AVERAGE',
  name: 'Latency',
  resetPeriod: 'MONTH',
  slug: 'latency',
});
const credits = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Credits',
  resetPeriod: 'MONTH',
  saleUnit: { factor: 1_000_000, label: '1M credits' },
  slug: 'credits',
  type: 'NUMBER_AI_CREDIT',
  unit: { plural: 'credits', singular: 'credit' },
});
const sso = buildEntitlement({
  name: 'Single sign-on',
  slug: 'sso',
  type: 'BOOLEAN',
});
const theme = buildEntitlement({
  name: 'Theme',
  slug: 'theme',
  type: 'CONFIG',
});

const PRICING_CATALOGUE = [
  traces,
  requests,
  seats,
  latency,
  credits,
  sso,
  theme,
];

const proVersion = (
  version: number,
  versionName: string,
  lifecycleState: License['lifecycleState'],
  isDefault = false,
): License => ({
  ...buildLicense({
    createdAt: `2026-02-0${version}T09:00:00.000Z`,
    description: `Pro plan, ${versionName}`,
    familyId: 'family-pro',
    id: `license-pro-v${version}`,
    isDefault,
    lifecycleState,
    name: 'Pro',
    // A family takes the slug of the version that opened it, and later
    // versions are slugged after the family.
    slug: version === 1 ? 'pro' : `pro-v${version}`,
    type: 'PAID',
    version: String(version),
    versionName,
  }),
  pricingType: 'PAID',
  requiresPaymentMethod: false,
  trialPeriodDays: 14,
});

const PRO_V2 = proVersion(2, 'Pro 2026', 'PUBLISHED', true);
const PRO_V4 = proVersion(4, 'Pro 2027', 'DRAFT');

// The grants of the published version: the allowance traces are billed above
// (100,000 at 100%, so up to 200,000), a hard limit (requests) and an unlimited
// grant (credits), which an overage price can never bill.
const PRO_V2_GRANTS = [
  buildGrant({
    entitlement: traces,
    license: PRO_V2,
    overagePercent: 100,
    value: 100_000,
  }),
  buildGrant({
    entitlement: requests,
    license: PRO_V2,
    overagePercent: 0,
    value: 1_000,
  }),
  buildGrant({ entitlement: credits, license: PRO_V2, value: -1 }),
  buildGrant({
    entitlement: seats,
    license: PRO_V2,
    overagePercent: 0,
    value: 10,
  }),
  buildGrant({ entitlement: sso, license: PRO_V2, value: true }),
];

// What the draft grants: one of every kind of entitlement, so that the picker
// of the price editor has something to leave out, to list and to disable.
const PRO_V4_GRANTS = [
  buildGrant({
    entitlement: traces,
    license: PRO_V4,
    overagePercent: 100,
    value: 100_000,
  }),
  buildGrant({
    entitlement: requests,
    license: PRO_V4,
    overagePercent: 0,
    value: 1_000,
  }),
  buildGrant({
    entitlement: seats,
    license: PRO_V4,
    overagePercent: 0,
    value: 10,
  }),
  buildGrant({
    entitlement: latency,
    license: PRO_V4,
    overagePercent: 0,
    value: 500,
  }),
  buildGrant({ entitlement: credits, license: PRO_V4, value: -1 }),
  buildGrant({ entitlement: sso, license: PRO_V4, value: true }),
  buildGrant({
    entitlement: theme,
    license: PRO_V4,
    value: { palette: 'dark' },
  }),
];

// Display order 1 twice and an id after the base's: a deprecated annual price
// that sorts between the base and the overage, as the API orders them.
const PRO_V2_PRICES = [
  buildPrice({
    billingPeriod: 'MONTHLY',
    displayLabel: 'Pro, monthly',
    displayOrder: 1,
    id: 'price-1-base',
    isDefault: true,
    unitAmountDecimal: '2900',
  }),
  buildPrice({
    billingModel: 'OVERAGE',
    displayLabel: 'Traces, overage',
    displayOrder: 2,
    id: 'price-2-over',
    metered: {
      entitlementSlug: 'traces',
      saleUnitFactor: '100000',
      saleUnitPlural: '100,000 traces',
      saleUnitSingular: '100,000 traces',
    },
    unitAmountDecimal: '800',
  }),
  buildPrice({
    billingPeriod: 'ANNUAL',
    deprecatedAt: '2026-02-20T09:00:00.000Z',
    displayLabel: 'Pro, annual',
    displayOrder: 1,
    id: 'price-3-annual',
    status: 'DEPRECATED',
    unitAmountDecimal: '29000',
  }),
];

const pricedCatalog = (options: { billed?: boolean } = {}) =>
  new LicenseAppModel({
    billedVersions: options.billed ? ['pro-v2'] : [],
    entitlements: PRICING_CATALOGUE,
    grants: [...PRO_V2_GRANTS, ...PRO_V4_GRANTS],
    licenses: [proVersion(1, 'Pro 2025', 'ARCHIVED'), PRO_V2, PRO_V4],
    prices: { 'pro-v2': PRO_V2_PRICES },
  });

/**
 * The pro family: v2 on sale with a monthly base, an overage on traces and a
 * deprecated annual price, v4 a draft with no price yet, and the catalogue of
 * flows, stocks and flags they grant.
 */
export const createPricedCatalogModel = () => pricedCatalog();

/**
 * The same family, with v2 billed by a live subscription: what it sells is
 * frozen, and the API refuses to change its grants or to add a price.
 */
export const createBilledCatalogModel = () => pricedCatalog({ billed: true });

/**
 * A draft that already has a flat fee and a usage price: what the price editor
 * edits, and what a new version copies.
 */
export function createDraftPricesModel() {
  return new LicenseAppModel({
    entitlements: PRICING_CATALOGUE,
    grants: PRO_V4_GRANTS,
    licenses: [PRO_V4],
    prices: {
      'pro-v4': [
        buildPrice({
          billingPeriod: 'MONTHLY',
          displayLabel: 'Pro, monthly',
          displayOrder: 1,
          id: 'price-1-base',
          isDefault: true,
          unitAmountDecimal: '3900',
        }),
        buildPrice({
          billingModel: 'USAGE_BASED',
          displayLabel: 'Requests',
          displayOrder: 2,
          id: 'price-2-usage',
          metered: {
            entitlementSlug: 'requests',
            saleUnitFactor: '1000',
            saleUnitPlural: '1k requests',
            saleUnitSingular: '1k requests',
          },
          unitAmountDecimal: '150',
        }),
      ],
    },
  });
}
