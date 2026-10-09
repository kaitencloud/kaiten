import type {
  Customer,
  Entitlement,
  EntitlementUsage,
  Instance,
  InstanceAddon,
  InstanceBilling,
  License,
  LicenseEntitlement,
} from '@/api-client';
import {
  buildAddon,
  buildAddonGrant,
  buildCustomer,
  buildEntitlement,
  buildGrant,
  buildInstanceAddon,
  buildLicense,
  buildPrice,
  buildSubscription,
  TEST_USER,
} from '../_support/fixtures';
import { BillingAppModel } from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import type { BillingCatalogue } from '../_support/model/billing-subscriptions';
import { InstanceAppModel } from '../_support/model/instance-app-model';
import { LicenseAppModel } from '../_support/model/license-app-model';

/**
 * The organization the specs of the add-ons read: a catalogue of add-ons in each state,
 * the license families they fit, and the instances that hold them, one for each state of
 * a subscription. The three models are the slots of one spec: the billing slot holds the
 * catalogue and what the instances hold of it, the license slot the families and what a
 * version grants, the instance slot the instances and what they are entitled to.
 *
 * The specs of what an instance holds freeze the page at `BILLED_NOW` (2026-10-07):
 * a subscription that lives bills a month at a time and its period ends on the 15th.
 *
 * - Extra seats is the product a customer meets first. Its first version is on sale, the
 *   default of its family, and Initech Production holds two of its five-seat units, so
 *   what it sells is frozen. Its second version is a draft nobody holds, which can still
 *   be given its grants and its prices, and has a monthly price only.
 * - Extra tokens is on sale with a monthly price only, so an instance billed by the year
 *   cannot take it, and a metered price the console leaves out.
 * - Priority support has its first version withdrawn and a second sold on request.
 *
 * What the licenses grant is what an add-on adds to: Pro grants ten seats and a hundred
 * thousand tokens with a fifty percent overage.
 */

const INITECH = { name: 'Initech', slug: 'initech' } as const;
const HOOLI = { name: 'Hooli', slug: 'hooli' } as const;

// --- What an organization is entitled to ------------------------------------------

const seats = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Seats',
  slug: 'seats',
  unit: { plural: 'seats', singular: 'seat' },
});
const tokens = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Tokens',
  resetPeriod: 'MONTH',
  slug: 'tokens',
  unit: { plural: 'tokens', singular: 'token' },
});
const storage = buildEntitlement({
  aggregationMethod: 'MAX',
  name: 'Storage',
  slug: 'storage-gb',
  unit: { plural: 'GB', singular: 'GB' },
});
const analytics = buildEntitlement({
  name: 'Advanced Analytics',
  slug: 'analytics',
  type: 'BOOLEAN',
});
const ENTITLEMENTS = [seats, tokens, storage, analytics];

// --- The licenses add-ons are sold on top of --------------------------------------

const licenseVersion = (
  slug: string,
  name: string,
  description: string,
): License => ({
  ...buildLicense({
    description,
    familyId: `family-${slug}`,
    id: `license-${slug}`,
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    name,
    slug,
    type: 'PAID',
    version: '1',
    versionName: '2026',
  }),
  pricingType: 'PAID',
  requiresPaymentMethod: false,
  trialPeriodDays: 14,
});

const pro = licenseVersion('pro', 'Pro', 'For production environments');
const starter = licenseVersion('starter', 'Starter', 'For a first instance');
const enterprise = licenseVersion(
  'enterprise',
  'Enterprise',
  'Sold on request',
);
const LICENSES = [pro, starter, enterprise];

const PRO_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Pro, monthly',
  id: 'price-pro-monthly',
  isDefault: true,
  unitAmountDecimal: '9900',
});
const PRO_ANNUAL = buildPrice({
  billingPeriod: 'ANNUAL',
  displayLabel: 'Pro, annual',
  displayOrder: 1,
  id: 'price-pro-annual',
  isDefault: true,
  unitAmountDecimal: '99000',
});
const STARTER_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Starter, monthly',
  id: 'price-starter-monthly',
  isDefault: true,
  unitAmountDecimal: '2900',
});
const ENTERPRISE_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  isDefault: true,
  unitAmountDecimal: '49900',
});
const LICENSE_PRICES = {
  enterprise: [ENTERPRISE_MONTHLY],
  pro: [PRO_MONTHLY, PRO_ANNUAL],
  starter: [STARTER_MONTHLY],
};

// What a license grants: the allowance an add-on adds to, replaces or raises.
const LICENSE_GRANTS: LicenseEntitlement[] = [
  buildGrant({
    entitlement: seats,
    license: pro,
    overagePercent: 0,
    value: 10,
  }),
  buildGrant({
    entitlement: tokens,
    license: pro,
    overagePercent: 50,
    value: 100_000,
  }),
  buildGrant({
    entitlement: storage,
    license: pro,
    overagePercent: 0,
    value: 100,
  }),
  buildGrant({
    entitlement: seats,
    license: starter,
    overagePercent: 0,
    value: 3,
  }),
  buildGrant({
    entitlement: tokens,
    license: starter,
    overagePercent: 0,
    value: 10_000,
  }),
  buildGrant({ entitlement: seats, license: enterprise, value: 100 }),
  buildGrant({ entitlement: tokens, license: enterprise, value: -1 }),
];

// --- The add-ons --------------------------------------------------------------------

const SEATS_V1 = buildAddon({
  createdAt: '2026-03-01T09:00:00.000Z',
  description: 'Five more named users a unit',
  familySlug: 'extra-seats',
  isDefault: true,
  maxQuantity: 3,
  name: 'Extra seats',
  slug: 'extra-seats-v1',
  versionName: '2026',
});
const SEATS_V2 = buildAddon({
  createdAt: '2026-09-20T09:00:00.000Z',
  description: 'Five more named users a unit, and more tokens',
  familySlug: 'extra-seats',
  lifecycleState: 'DRAFT',
  maxQuantity: 10,
  name: 'Extra seats',
  slug: 'extra-seats-v2',
  version: 2,
  versionName: '2027',
});
const TOKENS_V1 = buildAddon({
  createdAt: '2026-04-01T09:00:00.000Z',
  description: 'Ten thousand more tokens a unit',
  familySlug: 'extra-tokens',
  isDefault: true,
  name: 'Extra tokens',
  slug: 'extra-tokens-v1',
  versionName: '2026',
});
const SUPPORT_V1 = buildAddon({
  createdAt: '2025-06-01T09:00:00.000Z',
  description: 'Answers within four hours',
  familySlug: 'priority-support',
  lifecycleState: 'ARCHIVED',
  maxQuantity: 1,
  name: 'Priority support',
  slug: 'priority-support-v1',
  versionName: '2025',
});
const SUPPORT_V2 = buildAddon({
  createdAt: '2026-05-01T09:00:00.000Z',
  description: 'Answers within four hours, sold on request',
  familySlug: 'priority-support',
  isDefault: true,
  maxQuantity: 1,
  name: 'Priority support',
  pricingType: 'CUSTOM',
  slug: 'priority-support-v2',
  version: 2,
  versionName: '2026',
});

const SEATS_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly',
  displayOrder: 1,
  id: 'price-seats-monthly',
  isDefault: true,
  unitAmountDecimal: '1000',
});
const SEATS_ANNUAL = buildPrice({
  billingPeriod: 'ANNUAL',
  displayLabel: 'Extra seat, annual',
  displayOrder: 2,
  id: 'price-seats-annual',
  isDefault: true,
  unitAmountDecimal: '10000',
});
const SEATS_V2_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly',
  displayOrder: 1,
  id: 'price-seats-v2-monthly',
  isDefault: true,
  unitAmountDecimal: '1200',
});
const TOKENS_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra tokens, monthly',
  displayOrder: 1,
  id: 'price-tokens-monthly',
  isDefault: true,
  unitAmountDecimal: '500',
});
// A metered price the API takes on a version and never values: the console leaves it out.
const TOKENS_METERED = buildPrice({
  billingModel: 'USAGE_BASED',
  displayLabel: 'Tokens, metered',
  displayOrder: 2,
  id: 'price-tokens-metered',
  metered: { entitlementSlug: 'tokens', saleUnitFactor: '1' },
  unitAmountDecimal: '0.1',
});
const SUPPORT_V1_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Priority support, monthly',
  displayOrder: 1,
  id: 'price-support-v1-monthly',
  isDefault: true,
  unitAmountDecimal: '5000',
});

const ADDON_CATALOGUE = {
  compatibility: {
    'extra-seats-v1': ['pro', 'starter'],
    'extra-seats-v2': ['pro'],
    'extra-tokens-v1': ['pro', 'enterprise'],
    'priority-support-v1': ['pro'],
    'priority-support-v2': ['pro'],
  },
  entitlements: {
    analytics: 'BOOLEAN',
    seats: 'NUMBER',
    'storage-gb': 'NUMBER',
    tokens: 'NUMBER',
  } as const,
  grants: {
    'extra-seats-v1': [
      buildAddonGrant({
        addonSlug: 'extra-seats-v1',
        behavior: 'ADD',
        entitlementSlug: 'seats',
        value: 5,
      }),
    ],
    'extra-tokens-v1': [
      buildAddonGrant({
        addonSlug: 'extra-tokens-v1',
        behavior: 'ADD',
        entitlementSlug: 'tokens',
        overagePercent: 20,
        value: 10_000,
      }),
    ],
    'priority-support-v2': [
      buildAddonGrant({
        addonSlug: 'priority-support-v2',
        entitlementSlug: 'analytics',
        value: true,
      }),
    ],
  },
  licenseFamilies: ['pro', 'starter', 'enterprise'],
  prices: {
    'extra-seats-v1': [SEATS_MONTHLY, SEATS_ANNUAL],
    'extra-seats-v2': [SEATS_V2_MONTHLY],
    'extra-tokens-v1': [TOKENS_MONTHLY, TOKENS_METERED],
    'priority-support-v1': [SUPPORT_V1_MONTHLY],
  },
  publicFamilies: ['extra-seats'],
  versions: [SEATS_V1, SEATS_V2, TOKENS_V1, SUPPORT_V1, SUPPORT_V2],
};

// --- The instances ------------------------------------------------------------------

type World = {
  customer: typeof INITECH | typeof HOOLI;
  license: License;
  name: string;
  slug: string;
};

/** The instances, one for each state of a subscription, and one nobody bills yet. */
const INSTANCES: readonly World[] = [
  {
    customer: INITECH,
    license: pro,
    name: 'Initech Production',
    slug: 'initech-prod',
  },
  {
    customer: INITECH,
    license: pro,
    name: 'Initech Annual',
    slug: 'initech-annual',
  },
  {
    customer: INITECH,
    license: pro,
    name: 'Initech Trial',
    slug: 'initech-trial',
  },
  {
    customer: INITECH,
    license: pro,
    name: 'Initech Late',
    slug: 'initech-late',
  },
  {
    customer: INITECH,
    license: pro,
    name: 'Initech Ended',
    slug: 'initech-ended',
  },
  {
    customer: INITECH,
    license: pro,
    name: 'Initech Fresh',
    slug: 'initech-fresh',
  },
  {
    customer: HOOLI,
    license: starter,
    name: 'Hooli Starter',
    slug: 'hooli-starter',
  },
];

const instanceOf = (world: World): Instance => ({
  createdAt: '2026-03-02T09:00:00.000Z',
  createdBy: TEST_USER,
  customerId: `customer-${world.customer.slug}`,
  customerSlug: world.customer.slug,
  description: `${world.name} environment`,
  endLicenseDate: '2027-03-01T00:00:00.000Z',
  id: `instance-${world.slug}`,
  licenseId: world.license.id,
  licenseSlug: world.license.slug ?? '',
  metadata: {},
  name: world.name,
  slug: world.slug,
  startLicenseDate: '2026-03-01T00:00:00.000Z',
  status: 'HEALTHY',
  updatedAt: '2026-03-02T09:00:00.000Z',
  updatedBy: TEST_USER,
});

const customers = (): Customer[] => [
  buildCustomer({
    billingEmail: 'ap@initech.test',
    id: 'customer-initech',
    name: INITECH.name,
    slug: INITECH.slug,
  }),
  buildCustomer({
    billingEmail: 'ap@hooli.test',
    id: 'customer-hooli',
    name: HOOLI.name,
    slug: HOOLI.slug,
  }),
];

const worldOf = (slug: string): World => {
  const found = INSTANCES.find((candidate) => candidate.slug === slug);
  if (!found) {
    throw new Error(`The add-ons world has no instance "${slug}"`);
  }

  return found;
};

const subscriptionOf = (
  slug: string,
  overrides: Partial<Parameters<typeof buildSubscription>[0]> = {},
): InstanceBilling => {
  const { customer, name } = worldOf(slug);

  return buildSubscription({
    anchorAt: '2026-08-15T00:00:00.000Z',
    basePrice: PRO_MONTHLY,
    currentPeriodEnd: '2026-10-15T00:00:00.000Z',
    currentPeriodStart: '2026-09-15T00:00:00.000Z',
    customerName: customer.name,
    customerSlug: customer.slug,
    instanceName: name,
    instanceSlug: slug,
    ...overrides,
  });
};

/** What each instance holds: two units of seats where the subscription lives, one left by a subscription that ended. */
const attachments = (): Record<string, InstanceAddon[]> => ({
  'initech-ended': [
    buildInstanceAddon({
      addon: SEATS_V1,
      attachedAt: '2026-07-01T09:00:00.000Z',
      id: 'instance-addon-initech-ended-seats',
      quantity: 1,
    }),
  ],
  'initech-prod': [
    buildInstanceAddon({
      addon: SEATS_V1,
      attachedAt: '2026-09-08T09:00:00.000Z',
      id: 'instance-addon-initech-prod-seats',
      prices: [SEATS_MONTHLY],
      quantity: 2,
    }),
  ],
});

/** What the billing slot knows of the instances and what their versions sell. */
function catalogue(): BillingCatalogue {
  return {
    instances: INSTANCES.map(({ customer, license, name, slug }) => ({
      customerName: customer.name,
      customerSlug: customer.slug,
      instanceName: name,
      instanceSlug: slug,
      licenseFamilySlug: license.slug,
      licenseId: license.id,
      licenseSlug: license.slug ?? '',
      licenseState: 'PUBLISHED' as const,
      trialPeriodDays: 14,
    })),
    prices: LICENSE_PRICES,
  };
}

/**
 * The billing of the world, on the capabilities of the local stack with the add-ons:
 * - Initech Production lives, month by month, and holds two units of the seats;
 * - Initech Annual lives and pays a year at a time;
 * - Initech Trial is in the trial it began on 29 Sep for 14 days;
 * - Initech Late is past due since 1 Sep;
 * - Initech Ended ended its subscription in September, and still holds a unit of seats;
 * - Initech Fresh was never subscribed;
 * - Hooli Starter lives on the Starter license.
 */
export function createAddonsBillingModel() {
  return new BillingAppModel({
    addonCatalogue: ADDON_CATALOGUE,
    addons: attachments(),
    capabilities: billingCapabilitiesProfiles.stackWithAddons(),
    catalogue: catalogue(),
    subscriptions: [
      subscriptionOf('initech-prod'),
      subscriptionOf('initech-annual', {
        anchorAt: '2026-03-01T00:00:00.000Z',
        basePrice: PRO_ANNUAL,
        currentPeriodEnd: '2027-03-01T00:00:00.000Z',
        currentPeriodStart: '2026-03-01T00:00:00.000Z',
      }),
      subscriptionOf('initech-trial', {
        anchorAt: '2026-09-29T00:00:00.000Z',
        currentPeriodEnd: '2026-10-13T00:00:00.000Z',
        currentPeriodStart: '2026-09-29T00:00:00.000Z',
        status: 'TRIAL',
        trialEndsAt: '2026-10-13T00:00:00.000Z',
      }),
      subscriptionOf('initech-late', {
        anchorAt: '2026-08-02T00:00:00.000Z',
        currentPeriodEnd: '2026-11-02T00:00:00.000Z',
        currentPeriodStart: '2026-10-02T00:00:00.000Z',
        pastDueSince: '2026-09-01T00:00:00.000Z',
        status: 'PAST_DUE',
      }),
      subscriptionOf('initech-ended', {
        canceledAt: '2026-09-20T00:00:00.000Z',
        cancellationReason: 'Budget',
        currentPeriodEnd: '2026-09-15T00:00:00.000Z',
        currentPeriodStart: '2026-08-15T00:00:00.000Z',
        status: 'CANCELED',
      }),
      subscriptionOf('hooli-starter', { basePrice: STARTER_MONTHLY }),
    ],
  });
}

/**
 * A deployment that ships the add-ons and has sold none yet: the license families exist,
 * so that a first add-on can be made and told which of them it fits.
 */
export function createEmptyAddonsBillingModel() {
  return new BillingAppModel({
    addonCatalogue: {
      entitlements: ADDON_CATALOGUE.entitlements,
      licenseFamilies: ADDON_CATALOGUE.licenseFamilies,
    },
    capabilities: billingCapabilitiesProfiles.stackWithAddons(),
    catalogue: catalogue(),
  });
}

/**
 * The families of licenses the add-ons fit and what their versions grant, with the
 * catalogue of entitlements a grant is chosen from.
 */
export function createAddonsLicensesModel() {
  return new LicenseAppModel({
    entitlements: ENTITLEMENTS,
    grants: LICENSE_GRANTS,
    licenses: LICENSES,
    prices: LICENSE_PRICES,
  });
}

const usageOf = (
  { license }: World,
  entitlement: Entitlement,
  limit: number,
  value: number,
): EntitlementUsage => ({
  entitlementId: entitlement.id,
  entitlementSlug: entitlement.slug ?? '',
  licenseId: license.id,
  licenseSlug: license.slug ?? '',
  limit: { type: 'number', value: limit },
  source: 'license',
  value: { type: 'number', value },
});

/**
 * The instances and what they are entitled to. Initech Production holds two units of
 * the seats, so it has ten seats from its license and ten from them: twenty.
 */
export function createAddonsInstancesModel() {
  const production = worldOf('initech-prod');
  const ended = worldOf('initech-ended');
  const hooli = worldOf('hooli-starter');
  const usageOfPro = (world: World) => [
    usageOf(world, seats, 10, 7),
    usageOf(world, tokens, 100_000, 41_000),
    usageOf(world, storage, 100, 38),
  ];

  return new InstanceAppModel({
    billingBlocks: {
      'hooli-starter': { status: 'ACTIVE', unpaidInvoiceIds: [] },
      'initech-annual': { status: 'ACTIVE', unpaidInvoiceIds: [] },
      'initech-ended': { status: 'CANCELED', unpaidInvoiceIds: [] },
      'initech-late': { status: 'PAST_DUE', unpaidInvoiceIds: [] },
      'initech-prod': { status: 'ACTIVE', unpaidInvoiceIds: [] },
      'initech-trial': { status: 'TRIAL', unpaidInvoiceIds: [] },
    },
    customers: customers(),
    entitlementUsagesByInstance: {
      'hooli-starter': [
        usageOf(hooli, seats, 3, 2),
        usageOf(hooli, tokens, 10_000, 1_200),
      ],
      'initech-annual': usageOfPro(worldOf('initech-annual')),
      // A subscription that ended leaves what the instance holds: a unit of the seats still adds five.
      'initech-ended': [
        usageOf(ended, seats, 15, 7),
        usageOf(ended, tokens, 100_000, 41_000),
        usageOf(ended, storage, 100, 38),
      ],
      'initech-fresh': usageOfPro(worldOf('initech-fresh')),
      'initech-late': usageOfPro(worldOf('initech-late')),
      'initech-prod': [
        usageOf(production, seats, 20, 7),
        usageOf(production, tokens, 100_000, 41_000),
        usageOf(production, storage, 100, 38),
      ],
      'initech-trial': usageOfPro(worldOf('initech-trial')),
    },
    instances: INSTANCES.map(instanceOf),
    licenseEntitlements: LICENSE_GRANTS,
    licenses: LICENSES,
  });
}
