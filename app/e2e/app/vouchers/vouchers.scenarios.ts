import type { Redemption, Voucher } from '@/api-client';
import {
  buildEntitlement,
  buildRedemption,
  buildVoucher,
} from '../_support/fixtures';
import { BillingAppModel } from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import { LicenseAppModel } from '../_support/model/license-app-model';
import {
  ADDONS_WORLD,
  createAddonsInstancesModel,
} from '../addons/addons.scenarios';
import { BILLED_NOW } from '../billing/billed-instances';

/**
 * The organization the specs of the vouchers read, built on the world of the add-ons:
 * Initech and Hooli with their instances, one for each state of a subscription, the
 * Pro, Starter and Enterprise licenses and the add-ons sold on top of them. The
 * vouchers are the ones an account executive meets: a discount being redeemed, a boost
 * an instance has, the agreement of one customer whose redemption is used, a draft,
 * a voucher that was archived, one whose window closed, and one for each reason a code
 * cannot be redeemed.
 *
 * The specs freeze the page at `BILLED_NOW` (2026-10-07T12:00Z): the window of a
 * voucher and of a boost is judged from there.
 *
 * Initech Production (Pro, monthly) holds a boost that doubles its tokens until
 * December, and Initech Annual (Pro, annual) redeemed the welcome discount in March.
 * Hooli Starter has no storage, so a boost of storage has nothing to boost there. The
 * Initech Fresh instance was never subscribed and redeems whatever a spec has it redeem.
 */

// The statuses the API stores. It never sets a voucher EXPIRED itself: the one whose
// window closed is still ACTIVE, and the console says what the window says.
const WELCOME = buildVoucher({
  code: 'WELCOME-SPRING-2027',
  createdAt: '2026-02-20T09:00:00.000Z',
  description: 'Twenty percent off the base price for the first three invoices',
  duration: 'REPEATING',
  durationInPeriods: 3,
  expiresAt: '2027-06-30T23:59:59.000Z',
  id: 'voucher-welcome',
  maxRedemptions: 100,
  name: 'Welcome spring',
  priceAppliesTo: 'LICENSE_BASE',
  priceDiscountType: 'PERCENTAGE',
  priceDiscountValue: '20',
  redemptionsCount: 2,
});
const LAUNCH_BOOST = buildVoucher({
  code: 'LAUNCH-BOOST-50K',
  createdAt: '2026-09-01T09:00:00.000Z',
  description: 'Fifty thousand more tokens for a month',
  duration: 'ONE_TIME',
  grants: [
    { entitlementSlug: 'tokens', modifierType: 'ADD', modifierValue: '50000' },
  ],
  id: 'voucher-launch-boost',
  maxRedemptions: 5,
  name: 'Launch boost',
  voucherType: 'ENTITLEMENT_BOOST',
});
const TOKENS_X2 = buildVoucher({
  code: 'TOKENS-DOUBLE-Q4',
  createdAt: '2026-09-15T09:00:00.000Z',
  duration: 'REPEATING',
  durationInPeriods: 2,
  grants: [
    { entitlementSlug: 'tokens', modifierType: 'MULTIPLY', modifierValue: '2' },
  ],
  id: 'voucher-tokens-x2',
  maxRedemptions: 3,
  name: 'Tokens times two',
  redemptionsCount: 1,
  voucherType: 'ENTITLEMENT_BOOST',
});
const HOOLI_AGREEMENT = buildVoucher({
  code: 'HOOLI-AGREEMENT-2026',
  createdAt: '2026-04-10T09:00:00.000Z',
  currency: 'USD',
  duration: 'ONE_TIME',
  id: 'voucher-hooli-agreement',
  maxRedemptions: 1,
  name: 'Hooli agreement',
  priceAppliesTo: 'BOTH',
  priceDiscountType: 'FIXED_AMOUNT',
  priceDiscountValue: '5000',
  redemptionsCount: 1,
  restrictedCustomerSlug: 'hooli',
  status: 'EXHAUSTED',
});
const HOOLI_ONLY = buildVoucher({
  code: 'HOOLI-ONLY-10',
  createdAt: '2026-06-01T09:00:00.000Z',
  id: 'voucher-hooli-only',
  name: 'Hooli only',
  priceDiscountValue: '10',
  restrictedCustomerSlug: 'hooli',
});
const STARTER_ONLY = buildVoucher({
  applicableLicenseIds: ['license-starter'],
  code: 'STARTER-ONLY-10',
  createdAt: '2026-06-02T09:00:00.000Z',
  id: 'voucher-starter-only',
  name: 'Starter only',
  priceDiscountValue: '10',
});
const ANNUAL_ONLY = buildVoucher({
  code: 'ANNUAL-ONLY-15',
  createdAt: '2026-06-03T09:00:00.000Z',
  id: 'voucher-annual-only',
  name: 'Annual only',
  priceDiscountValue: '15',
  redemptionRules: { annualOnly: true },
});
const EURO_CREDIT = buildVoucher({
  code: 'EURO-CREDIT-25',
  createdAt: '2026-06-04T09:00:00.000Z',
  currency: 'EUR',
  id: 'voucher-euro-credit',
  name: 'Euro credit',
  priceAppliesTo: 'BOTH',
  priceDiscountType: 'FIXED_AMOUNT',
  priceDiscountValue: '2500',
});
const STORAGE_BOOST = buildVoucher({
  code: 'STORAGE-BOOST-50',
  createdAt: '2026-06-05T09:00:00.000Z',
  grants: [
    { entitlementSlug: 'storage-gb', modifierType: 'ADD', modifierValue: '50' },
  ],
  id: 'voucher-storage-boost',
  name: 'Storage boost',
  voucherType: 'ENTITLEMENT_BOOST',
});
const SELECTED = buildVoucher({
  applicableAddonPriceIds: ['price-seats-monthly'],
  applicableLicensePriceIds: ['price-pro-monthly'],
  code: 'SELECTED-PRICES-30',
  createdAt: '2026-06-06T09:00:00.000Z',
  id: 'voucher-selected',
  name: 'Selected prices',
  priceAppliesTo: 'SELECTED_PRICES',
  priceDiscountValue: '30',
});
const DRAFT = buildVoucher({
  code: 'SUMMER-SALE-2027',
  createdAt: '2026-10-03T09:00:00.000Z',
  currency: 'USD',
  id: 'voucher-draft',
  name: 'Summer sale',
  priceAppliesTo: 'BOTH',
  priceDiscountType: 'FIXED_AMOUNT',
  priceDiscountValue: '2500',
  status: 'DRAFT',
});
const ARCHIVED = buildVoucher({
  code: 'BLACK-FRIDAY-2025',
  createdAt: '2025-11-01T09:00:00.000Z',
  id: 'voucher-archived',
  name: 'Black Friday 2025',
  priceDiscountValue: '15',
  status: 'ARCHIVED',
});
const LAPSED = buildVoucher({
  code: 'SPRING-2026-PROMO',
  createdAt: '2026-03-01T09:00:00.000Z',
  expiresAt: '2026-06-30T23:59:59.000Z',
  id: 'voucher-lapsed',
  name: 'Spring 2026 promotion',
  priceAppliesTo: 'ADDONS',
  priceDiscountValue: '10',
});

const VOUCHERS: Voucher[] = [
  WELCOME,
  LAUNCH_BOOST,
  TOKENS_X2,
  HOOLI_AGREEMENT,
  HOOLI_ONLY,
  STARTER_ONLY,
  ANNUAL_ONLY,
  EURO_CREDIT,
  STORAGE_BOOST,
  SELECTED,
  DRAFT,
  ARCHIVED,
  LAPSED,
];

const REDEMPTIONS: Redemption[] = [
  buildRedemption({
    applicationsCount: 1,
    applicationsMax: 3,
    id: 'redemption-annual-welcome',
    instanceSlug: 'initech-annual',
    redeemedAt: '2026-03-01T10:00:00.000Z',
    voucher: WELCOME,
  }),
  buildRedemption({
    applicationsMax: 3,
    id: 'redemption-hooli-welcome',
    instanceSlug: 'hooli-starter',
    redeemedAt: '2026-10-05T09:30:00.000Z',
    voucher: WELCOME,
  }),
  buildRedemption({
    effectiveExpiresAt: '2026-12-01T09:00:00.000Z',
    id: 'redemption-prod-tokens',
    instanceSlug: 'initech-prod',
    redeemedAt: '2026-10-01T09:00:00.000Z',
    voucher: TOKENS_X2,
  }),
  buildRedemption({
    applicationsCount: 1,
    applicationsMax: 1,
    expiredAt: '2026-05-15T09:00:00.000Z',
    id: 'redemption-hooli-agreement',
    instanceSlug: 'hooli-starter',
    redeemedAt: '2026-04-15T09:00:00.000Z',
    status: 'EXPIRED',
    voucher: HOOLI_AGREEMENT,
  }),
];

// What the voucher wizard offers a boost: the numbers of the catalogue, with the two kinds
// it must not offer.
const CREDITS = buildEntitlement({
  name: 'AI credits',
  slug: 'ai-credits',
  type: 'NUMBER_AI_CREDIT',
});
const BRANDING = buildEntitlement({
  name: 'Branding',
  slug: 'branding',
  type: 'CONFIG',
});

const voucherCatalogue = () => ({
  known: { customers: ['hooli', 'initech'] },
  redemptions: REDEMPTIONS,
  vouchers: VOUCHERS,
});

/** The catalogue of add-ons, with the two entitlements of the catalogue that cannot be boosted. */
const addonCatalogue = () => ({
  ...ADDONS_WORLD.addonCatalogue,
  entitlements: {
    ...ADDONS_WORLD.addonCatalogue.entitlements,
    'ai-credits': 'NUMBER_AI_CREDIT',
    branding: 'CONFIG',
  } as const,
});

/** What the billing slot knows of the instances: Hooli Starter has no storage to boost. */
const catalogue = () => {
  const world = ADDONS_WORLD.catalogue();

  return {
    ...world,
    instances: world.instances.map((instance) =>
      instance.instanceSlug === 'hooli-starter'
        ? { ...instance, entitlementSlugs: ['seats', 'tokens'] }
        : instance,
    ),
  };
};

const billingSeed = () => ({
  ...ADDONS_WORLD.billingSeed(),
  addonCatalogue: addonCatalogue(),
  catalogue: catalogue(),
  voucherCatalogue: voucherCatalogue(),
});

/** The billing of the world, on the capabilities of the stack with the add-ons and the vouchers. */
export function createVouchersBillingModel() {
  return new BillingAppModel({
    ...billingSeed(),
    capabilities: billingCapabilitiesProfiles.stackWithVouchers(),
  });
}

/** A deployment that ships the vouchers and has issued none yet. */
export function createEmptyVouchersBillingModel() {
  return new BillingAppModel({
    ...billingSeed(),
    capabilities: billingCapabilitiesProfiles.stackWithVouchers(),
    voucherCatalogue: { known: voucherCatalogue().known },
  });
}

/** The same world on the stack that does not ship the vouchers. */
export function createVouchersNotShippedBillingModel() {
  return new BillingAppModel({
    ...billingSeed(),
    capabilities: billingCapabilitiesProfiles.stackWithAddons(),
  });
}

/**
 * The license families, what the versions grant and the entitlements of the catalogue: the
 * numbers a boost can change, a flag, and a configuration it cannot.
 */
export function createVouchersLicensesModel() {
  return new LicenseAppModel({
    entitlements: [...ADDONS_WORLD.entitlements, CREDITS, BRANDING],
    grants: ADDONS_WORLD.grants,
    licenses: Object.values(ADDONS_WORLD.licenses),
    prices: ADDONS_WORLD.prices,
  });
}

/**
 * The instances and what they are entitled to, boosts included: Initech Production's
 * tokens are doubled by the boost it redeemed.
 */
export function createVouchersInstancesModel() {
  const instances = createAddonsInstancesModel();
  const billing = createVouchersBillingModel();
  for (const { instanceSlug } of REDEMPTIONS) {
    instances.applyAddonContributions(
      instanceSlug,
      billing.instanceAddons.contributionsOf(instanceSlug),
      billing.vouchers.boostsOf(instanceSlug, Date.parse(BILLED_NOW)),
    );
  }

  return instances;
}
