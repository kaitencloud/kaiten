import type {
  PortalEntitlement,
  PublicCatalog,
  PublicPlan,
  PublicPlanEntitlement,
  PublicPrice,
  SessionInvoice,
  SessionPortal,
  SessionSubscription,
} from '@/api-client';

/**
 * The organization the console runs for, as Kaiten Cloud knows it: a customer of
 * Kaiten Cloud with one instance, the one the `plan-billing` flag reads
 * (`planBilling: true`). The Plan & usage page reads its portal through a customer
 * session bound to that instance, and the plans it can move to from Kaiten Cloud's
 * public catalogue. Every record here is Kaiten Cloud's, never the organization's
 * own catalogue: the console is a customer on that page.
 */
export const KAITEN_CLOUD_CUSTOMER = {
  billingEmail: 'billing@northwind.test',
  name: 'Northwind Software',
  slug: 'northwind-software',
} as const;

/** The instance of the organization on Kaiten Cloud. */
export const KAITEN_CLOUD_INSTANCE_SLUG = 'northwind-software';

/** A fixed id of the Kaiten Cloud world, a UUID as the API's are. */
export const kaitenCloudId = (scope: number, n: number) =>
  `0c10d${String(scope).padStart(3, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const flatFee = (
  id: string,
  unitAmount: number,
  billingPeriod: 'MONTHLY' | 'ANNUAL',
  displayOrder: number,
): PublicPrice => ({
  billingModel: 'FLAT_FEE',
  billingPeriod,
  billingTiming: 'ADVANCE',
  currency: 'USD',
  displayLabel: null,
  displayOrder,
  id,
  isDefault: true,
  metered: null,
  unitAmount,
  unitAmountDecimal: String(unitAmount),
});

/** Cloud Starter, free, by the month: where an organization bought on kaiten.sh starts. */
export const STARTER_MONTHLY = flatFee(kaitenCloudId(1, 1), 0, 'MONTHLY', 0);
/** Cloud Growth: $79.00 a month, or $790.00 a year. */
export const GROWTH_MONTHLY = flatFee(kaitenCloudId(1, 2), 7900, 'MONTHLY', 0);
export const GROWTH_ANNUAL = flatFee(kaitenCloudId(1, 3), 79000, 'ANNUAL', 1);

type Grant = {
  name: string;
  slug: string;
  type: 'BOOLEAN' | 'NUMBER';
  unitPlural: string | null;
  unitSingular: string | null;
  /** What each plan grants of it; a plan that does not grant it leaves it out. */
  values: { starter?: number | boolean; growth: number | boolean };
  /** What the organization uses of it now, for a number. */
  used?: number;
};

/** What Kaiten Cloud's plans grant, in display order, and what the organization uses. */
const GRANTS: Grant[] = [
  {
    name: 'Customers',
    slug: 'customers',
    type: 'NUMBER',
    unitPlural: 'customers',
    unitSingular: 'customer',
    used: 9,
    values: { growth: 250, starter: 25 },
  },
  {
    name: 'Instances',
    slug: 'instances',
    type: 'NUMBER',
    unitPlural: 'instances',
    unitSingular: 'instance',
    used: 14,
    values: { growth: 500, starter: 50 },
  },
  {
    name: 'Webhook endpoints',
    slug: 'webhook-endpoints',
    type: 'NUMBER',
    unitPlural: 'endpoints',
    unitSingular: 'endpoint',
    used: 1,
    values: { growth: 5, starter: 1 },
  },
  {
    name: 'Vouchers',
    slug: 'vouchers',
    type: 'BOOLEAN',
    unitPlural: null,
    unitSingular: null,
    values: { growth: true },
  },
  {
    name: 'Add-ons',
    slug: 'addons',
    type: 'BOOLEAN',
    unitPlural: null,
    unitSingular: null,
    values: { growth: true },
  },
];

type Tier = 'starter' | 'growth';

const granted = (tier: Tier) =>
  GRANTS.flatMap((grant, displayOrder) => {
    const value = grant.values[tier];
    return value === undefined ? [] : [{ displayOrder, grant, value }];
  });

const planEntitlements = (tier: Tier): PublicPlanEntitlement[] =>
  granted(tier).map(({ displayOrder, grant, value }) => ({
    description: null,
    displayOrder,
    icon: null,
    limitCapExceededOveragePercent: grant.type === 'NUMBER' ? 0 : null,
    name: grant.name,
    saleUnitFactor: null,
    saleUnitPlural: null,
    saleUnitSingular: null,
    slug: grant.slug,
    type: grant.type,
    unitPlural: grant.unitPlural,
    unitSingular: grant.unitSingular,
    unlimited: false,
    value,
  }));

/** One version of a plan of Kaiten Cloud's public catalogue. */
type KaitenCloudPlan = {
  plan: PublicPlan;
  /** What its version grants, as a portal on it reads them. */
  tier: Tier;
};

export const STARTER_PLAN: KaitenCloudPlan = {
  plan: {
    compatibleAddonFamilies: [],
    currency: 'USD',
    description: 'For founding teams trying Kaiten on their first customers.',
    entitlements: planEntitlements('starter'),
    familySlug: 'kaiten-starter',
    licenseId: kaitenCloudId(2, 1),
    licenseSlug: 'kaiten-starter-v1',
    lifecycleState: 'PUBLISHED',
    name: 'Cloud Starter',
    prices: [STARTER_MONTHLY],
    pricingType: 'FREE',
    requiresPaymentMethod: false,
    selfServe: true,
    selfServeCtaUrl: null,
    trialPeriodDays: null,
  },
  tier: 'starter',
};

export const GROWTH_PLAN: KaitenCloudPlan = {
  plan: {
    compatibleAddonFamilies: [],
    currency: 'USD',
    description: 'For B2B SaaS and AI vendors scaling their customer base.',
    entitlements: planEntitlements('growth'),
    familySlug: 'kaiten-growth',
    licenseId: kaitenCloudId(2, 2),
    licenseSlug: 'kaiten-growth-v1',
    lifecycleState: 'PUBLISHED',
    name: 'Cloud Growth',
    prices: [GROWTH_MONTHLY, GROWTH_ANNUAL],
    pricingType: 'PAID',
    requiresPaymentMethod: true,
    selfServe: true,
    selfServeCtaUrl: null,
    trialPeriodDays: null,
  },
  tier: 'growth',
};

export const KAITEN_CLOUD_PLANS = [STARTER_PLAN, GROWTH_PLAN];

/**
 * Kaiten Cloud's public catalogue, as the console's publishable key reads it: the two
 * plans sold online, no add-on, a checkout for a signed-in customer and none for a
 * visitor (the console's key does not start anonymous checkouts).
 */
export function buildKaitenCloudCatalog(): PublicCatalog {
  return {
    addOns: [],
    branding: { poweredByRemovable: true },
    capabilities: {
      anonymousCheckout: false,
      checkout: true,
      paymentMethods: true,
      turnstileSiteKey: null,
    },
    plans: KAITEN_CLOUD_PLANS.map(({ plan }) => structuredClone(plan)),
  };
}

/** What a portal on a plan reads of each grant: the limit, the usage and where it comes from. */
export function buildKaitenCloudEntitlements(
  plan: KaitenCloudPlan,
): PortalEntitlement[] {
  return granted(plan.tier).map(({ displayOrder, grant, value }) => {
    const licenseEntitlementId = kaitenCloudId(
      plan.tier === 'starter' ? 3 : 4,
      displayOrder + 1,
    );
    if (typeof value === 'boolean') {
      return {
        currentPeriodEnd: null,
        currentPeriodStart: null,
        currentValue: null,
        limitCapExceededOveragePercent: null,
        limitValue: { type: 'boolean', value },
        maximumAllowedUsage: null,
        name: grant.name,
        percentageUsed: null,
        provenance: {
          addons: [],
          boosts: [],
          exception: null,
          license: {
            licenseEntitlementId,
            limitCapExceededOveragePercent: null,
            value: { type: 'boolean', value },
          },
          number: null,
        },
        slug: grant.slug,
        source: 'license',
        type: 'BOOLEAN',
        unlimited: false,
      };
    }
    const used = grant.used ?? 0;
    return {
      currentPeriodEnd: null,
      currentPeriodStart: null,
      currentValue: used,
      limitCapExceededOveragePercent: 0,
      limitValue: { type: 'number', value },
      maximumAllowedUsage: value,
      name: grant.name,
      percentageUsed: value === 0 ? null : (used / value) * 100,
      provenance: {
        addons: [],
        boosts: [],
        exception: null,
        license: {
          licenseEntitlementId,
          limitCapExceededOveragePercent: 0,
          value: { type: 'number', value },
        },
        number: null,
      },
      slug: grant.slug,
      source: 'license',
      type: 'NUMBER',
      unlimited: false,
    };
  });
}

/** The subscription of the organization to a flat fee, over one period. */
export function buildKaitenCloudSubscription(
  price: PublicPrice,
  currentPeriodStart: string,
  currentPeriodEnd: string,
): SessionSubscription {
  return {
    basePrice: structuredClone(price),
    billingPeriod: price.billingPeriod ?? 'MONTHLY',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    cancellationReason: null,
    collectionMethod: 'CHARGE_AUTOMATICALLY',
    currency: price.currency,
    currentPeriodEnd,
    currentPeriodStart,
    incompleteExpiresAt: null,
    providerKind: 'STRIPE',
    scheduledChange: null,
    status: 'ACTIVE',
    trialEndsAt: null,
  };
}

/**
 * An invoice of the organization's plan, with its one base line. A free plan's is
 * paid when it is issued, as the API issues any invoice that owes nothing, and goes
 * to no provider; a paid one was charged to the card Stripe holds.
 */
export function buildKaitenCloudInvoice({
  id,
  issuedAt,
  kind,
  plan,
  price,
  providerInvoiceNumber = null,
  serviceFrom,
  serviceTo,
}: {
  id: string;
  issuedAt: string;
  kind: SessionInvoice['kind'];
  plan: PublicPlan;
  price: PublicPrice;
  providerInvoiceNumber?: string | null;
  serviceFrom: string;
  serviceTo: string;
}): SessionInvoice {
  const amount = price.unitAmount ?? 0;
  return {
    currency: price.currency,
    discountTotal: 0,
    dueAt: issuedAt,
    externalReference: null,
    hostedInvoiceUrl: null,
    id,
    invoicePdfUrl: null,
    issuedAt,
    kind,
    lines: [
      {
        amount,
        description: plan.name,
        label: plan.name,
        quantity: '1',
        seq: 1,
        serviceFrom,
        serviceTo,
        type: 'BASE',
        unitAmountDecimal: String(amount),
      },
    ],
    paidAt: issuedAt,
    providerInvoiceNumber,
    serviceFrom,
    serviceTo,
    status: 'PAID',
    subtotal: amount,
    total: amount,
  };
}

/** The months of Cloud Starter the organization has had: September to November 2026. */
const STARTER_MONTHS = [
  ['2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 'ACTIVATION'],
  ['2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', 'RENEWAL'],
  ['2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', 'RENEWAL'],
] as const;

/** The invoices of the organization on Cloud Starter, newest first: three at $0.00. */
export function buildKaitenCloudInvoices(): SessionInvoice[] {
  return STARTER_MONTHS.map(([serviceFrom, serviceTo, kind], index) =>
    buildKaitenCloudInvoice({
      id: kaitenCloudId(5, index + 1),
      issuedAt: serviceFrom,
      kind,
      plan: STARTER_PLAN.plan,
      price: STARTER_MONTHLY,
      serviceFrom,
      serviceTo,
    }),
  ).reverse();
}

/**
 * The portal of the organization's instance: on Cloud Starter since September, by the
 * month, with a Visa card on file it saved at sign-up. A free subscription leaves a
 * checkout open (the catalogue sells a plan it can be replaced with) and owes nothing
 * at the next boundary.
 */
export function buildKaitenCloudPortal(): SessionPortal {
  const [, , [periodStart, periodEnd]] = STARTER_MONTHS;
  return {
    addOns: [],
    branding: { poweredByRemovable: true },
    capabilities: {
      checkout: true,
      invoices: true,
      paymentMethods: true,
      unsubscribe: true,
    },
    customer: { ...KAITEN_CLOUD_CUSTOMER },
    entitlements: buildKaitenCloudEntitlements(STARTER_PLAN),
    instance: {
      licenseName: STARTER_PLAN.plan.name,
      licenseSlug: STARTER_PLAN.plan.licenseSlug,
      name: KAITEN_CLOUD_CUSTOMER.name,
      slug: KAITEN_CLOUD_INSTANCE_SLUG,
    },
    instances: [],
    paymentMethod: {
      brand: 'visa',
      expMonth: 8,
      expYear: 2028,
      last4: '4242',
      status: 'ACTIVE',
    },
    subscription: buildKaitenCloudSubscription(
      STARTER_MONTHLY,
      periodStart,
      periodEnd,
    ),
    trial: null,
    upcomingInvoice: {
      boundaryAt: periodEnd,
      currency: 'USD',
      discountTotal: 0,
      subtotal: 0,
      total: 0,
    },
    updatedAt: periodStart,
    vouchers: [],
  };
}
