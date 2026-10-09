import type {
  BillingCapabilities,
  Customer,
  InstanceAddon,
  Invoice,
  License,
} from '@/api-client';
import {
  buildCustomer,
  buildLicense,
  buildPrice,
  buildSubscription,
} from '../_support/fixtures';
import {
  buildInvoice,
  buildInvoiceLine,
} from '../_support/fixtures/build-invoice';
import type { InvoiceIdentity } from '../_support/fixtures/build-invoice';
import { BillingAppModel } from '../_support/model/billing-app-model';
import {
  billingCapabilitiesProfiles,
  type StripeStanding,
} from '../_support/model/billing-capabilities';
import type { BillingProvidersSeed } from '../_support/model/billing-providers';
import type { BillingCatalogue } from '../_support/model/billing-subscriptions';
import { InstanceAppModel } from '../_support/model/instance-app-model';
import { LicenseAppModel } from '../_support/model/license-app-model';
import { BILLED_NOW } from './billed-instances';
import { invoiceSet } from './invoice-fixtures';

export { BILLED_NOW as LIFECYCLE_NOW };

/**
 * The organization the specs of the life of a subscription read: one instance for
 * each state a subscription can be in, all on a license version that is on sale,
 * and the plans an instance can move to. It is its own world: the instances of
 * `billed-instances.ts` are the ones the specs of what is shown about billing read,
 * and a state added to them would change what those specs count.
 *
 * The specs freeze the page at `BILLED_NOW` (2026-10-07T12:00:00Z). A subscription
 * that lives bills a month at a time and its period ends on the 15th, eight days on.
 */

const INITECH = { name: 'Initech', slug: 'initech' } as const;
const HOOLI = { name: 'Hooli', slug: 'hooli' } as const;

const PRO_V2_ID = 'license-pro-v2';
const PRO_V3_ID = 'license-pro-v3';
const PRO_V4_ID = 'license-pro-v4';
const PRO_V5_ID = 'license-pro-v5';
const ENTERPRISE_V1_ID = 'license-enterprise-v1';

/** What the instances run: $29.00 a month in advance, or $290.00 a year in arrears. */
export const PRO_V2_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Pro v2, monthly',
  id: 'price-pro-v2-monthly',
  isDefault: true,
  unitAmountDecimal: '2900',
});
export const PRO_V2_ANNUAL_IN_ARREARS = buildPrice({
  billingPeriod: 'ANNUAL',
  billingTiming: 'ARREARS',
  displayLabel: 'Pro v2, annual',
  displayOrder: 1,
  id: 'price-pro-v2-annual',
  unitAmountDecimal: '29000',
});
/** The plans an instance can move to: only the first is selectable. */
export const PRO_V3_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Pro v3, monthly',
  id: 'price-pro-v3-monthly',
  isDefault: true,
  unitAmountDecimal: '3900',
});
export const ENTERPRISE_V1_IN_EURO = buildPrice({
  billingPeriod: 'MONTHLY',
  currency: 'EUR',
  displayLabel: 'Enterprise v1, monthly',
  id: 'price-enterprise-v1-monthly',
  isDefault: true,
  unitAmountDecimal: '9900',
});
export const PRO_V5_RETIRED = buildPrice({
  billingPeriod: 'MONTHLY',
  deprecatedAt: '2026-06-01T00:00:00.000Z',
  displayLabel: 'Pro v5, monthly',
  id: 'price-pro-v5-monthly',
  status: 'DEPRECATED',
  unitAmountDecimal: '4900',
});
const PRO_V4_DRAFT = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Pro v4, monthly',
  id: 'price-pro-v4-monthly',
  isDefault: true,
  unitAmountDecimal: '4400',
});

/** The versions of the world: Pro runs from v2 to v5, Enterprise has one. v2 carries a trial. */
export function lifecycleLicenses(): License[] {
  const pro = (
    id: string,
    version: string,
    state: License['lifecycleState'],
  ) => ({
    ...buildLicense({
      description: `Pro, version ${version}`,
      familyId: 'family-pro',
      id,
      lifecycleState: state,
      name: 'Pro',
      slug: `pro-v${version}`,
      type: 'PAID',
      version,
    }),
    pricingType: 'PAID' as const,
    requiresPaymentMethod: false,
  });

  return [
    { ...pro(PRO_V2_ID, '2', 'PUBLISHED'), trialPeriodDays: 14 },
    pro(PRO_V3_ID, '3', 'PUBLISHED'),
    pro(PRO_V4_ID, '4', 'DRAFT'),
    pro(PRO_V5_ID, '5', 'PUBLISHED'),
    {
      ...buildLicense({
        description: 'Enterprise, version 1',
        familyId: 'family-enterprise',
        id: ENTERPRISE_V1_ID,
        lifecycleState: 'PUBLISHED',
        name: 'Enterprise',
        slug: 'enterprise-v1',
        type: 'PAID',
        version: '1',
      }),
      pricingType: 'PAID' as const,
      requiresPaymentMethod: false,
    },
  ];
}

/** The prices of each version, by its slug. */
export const LIFECYCLE_PRICES = {
  'enterprise-v1': [ENTERPRISE_V1_IN_EURO],
  'pro-v2': [PRO_V2_MONTHLY, PRO_V2_ANNUAL_IN_ARREARS],
  'pro-v3': [PRO_V3_MONTHLY],
  'pro-v4': [PRO_V4_DRAFT],
  'pro-v5': [PRO_V5_RETIRED],
};

type World = {
  customer: typeof INITECH | typeof HOOLI;
  /** What the state of the instance is, in the words of the specs. */
  name: string;
  slug: string;
};

/** The instances, one per state of a subscription, and one nobody bills yet. */
export const LIFECYCLE_INSTANCES: readonly World[] = [
  { customer: INITECH, name: 'Initech Production', slug: 'initech-prod' },
  { customer: INITECH, name: 'Initech Trial', slug: 'initech-trial' },
  { customer: INITECH, name: 'Initech Late', slug: 'initech-late' },
  { customer: INITECH, name: 'Initech Leaving', slug: 'initech-leaving' },
  { customer: INITECH, name: 'Initech Moving', slug: 'initech-moving' },
  { customer: INITECH, name: 'Initech Seats', slug: 'initech-seats' },
  { customer: INITECH, name: 'Initech Fresh', slug: 'initech-fresh' },
  { customer: HOOLI, name: 'Hooli Production', slug: 'hooli-prod' },
];

const identityOf = ({ customer, name, slug }: World): InvoiceIdentity => ({
  customerName: customer.name,
  customerSlug: customer.slug,
  instanceName: name,
  instanceSlug: slug,
  licenseId: PRO_V2_ID,
  licenseSlug: 'pro-v2',
});

const worldOf = (slug: string): World => {
  const found = LIFECYCLE_INSTANCES.find(
    (candidate) => candidate.slug === slug,
  );
  if (!found) {
    throw new Error(`The lifecycle world has no instance "${slug}"`);
  }

  return found;
};

const subscriptionOf = (
  slug: string,
  overrides: Partial<Parameters<typeof buildSubscription>[0]> = {},
) => {
  const { customer, name } = worldOf(slug);

  return buildSubscription({
    anchorAt: '2026-08-15T00:00:00.000Z',
    basePrice: PRO_V2_MONTHLY,
    currentPeriodEnd: '2026-10-15T00:00:00.000Z',
    currentPeriodStart: '2026-09-15T00:00:00.000Z',
    customerName: customer.name,
    customerSlug: customer.slug,
    instanceName: name,
    instanceSlug: slug,
    ...overrides,
  });
};

/** One invoice, unpaid and past its due date: what makes Initech Late past due. */
export const INITECH_LATE_INVOICE_ID = 'inv-initech-late-activation';

function lifecycleInvoices(): Invoice[] {
  const late = identityOf(worldOf('initech-late'));

  return [
    buildInvoice({
      boundaryAt: '2026-08-02T00:00:00.000Z',
      daysUntilDue: 30,
      handoff: { claimCount: 0, status: 'PENDING' },
      id: INITECH_LATE_INVOICE_ID,
      identity: late,
      issuedAt: '2026-08-02T00:00:00.000Z',
      kind: 'ACTIVATION',
      lines: [
        buildInvoiceLine({
          amount: 2900,
          description: '1 × $29.00 per month',
          invoiceId: INITECH_LATE_INVOICE_ID,
          label: 'Pro v2, monthly',
          seq: 1,
          serviceFrom: '2026-08-02T00:00:00.000Z',
          serviceTo: '2026-09-02T00:00:00.000Z',
          type: 'BASE',
          unitAmountDecimal: '2900',
        }),
      ],
      status: 'MANUAL',
    }),
  ];
}

/** The add-ons the seats instance holds: two seats, which a cancellation offers to take off. */
export const SEATS_ADDON: InstanceAddon = {
  addonId: 'addon-extra-seats-v1',
  addonSlug: 'extra-seats-v1',
  attachedAt: '2026-09-01T00:00:00.000Z',
  familySlug: 'extra-seats',
  id: 'instance-addon-initech-seats',
  maxQuantity: 5,
  prices: [],
  quantity: 2,
};

/** What the billing slot knows of the instances and what their versions sell. */
function lifecycleCatalogue(): BillingCatalogue {
  return {
    instances: LIFECYCLE_INSTANCES.map(({ customer, name, slug }) => ({
      customerName: customer.name,
      customerSlug: customer.slug,
      instanceName: name,
      instanceSlug: slug,
      licenseId: PRO_V2_ID,
      licenseSlug: 'pro-v2',
      licenseState: 'PUBLISHED' as const,
      trialPeriodDays: 14,
    })),
    licenseStates: { 'pro-v4': 'DRAFT' },
    prices: LIFECYCLE_PRICES,
  };
}

/**
 * The billing of the lifecycle world, on the capabilities of the local stack unless a
 * spec gives others (a release with no trial, or none of the lifecycle):
 * - Initech Production lives, with the invoice of the next boundary composed;
 * - Initech Trial began on 29 Sep for 14 days, and has six days left on 7 Oct;
 * - Initech Late is past due since 1 Sep, for the first invoice it never paid;
 * - Initech Leaving is set to cancel at the end of its period;
 * - Initech Moving is set to move to Pro v3, monthly, at the end of its period;
 * - Initech Seats holds two seats;
 * - Initech Fresh was never subscribed, on a version that carries a trial;
 * - Hooli Production ended its subscription in September.
 */
export function createLifecycleBillingModel(
  capabilities: BillingCapabilities = billingCapabilitiesProfiles.stack(),
  extras: {
    /** Invoices the world also holds, besides the one that makes Initech Late past due. */
    invoices?: Invoice[];
    /** The customers as the payment provider holds them. */
    providers?: BillingProvidersSeed;
  } = {},
) {
  return new BillingAppModel({
    addons: { 'initech-seats': [SEATS_ADDON] },
    capabilities,
    catalogue: lifecycleCatalogue(),
    invoices: [...lifecycleInvoices(), ...(extras.invoices ?? [])],
    providers: extras.providers,
    subscriptions: [
      subscriptionOf('initech-prod'),
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
      subscriptionOf('initech-leaving', {
        cancelAtPeriodEnd: true,
        cancelRequestedAt: '2026-10-01T09:00:00.000Z',
        cancellationReason: 'Moving in-house',
      }),
      subscriptionOf('initech-moving', {
        scheduledChange: {
          effectiveAt: '2026-10-15T00:00:00.000Z',
          price: PRO_V3_MONTHLY,
          scheduledAt: '2026-10-03T09:00:00.000Z',
        },
      }),
      subscriptionOf('initech-seats'),
      subscriptionOf('hooli-prod', {
        canceledAt: '2026-09-20T00:00:00.000Z',
        cancellationReason: 'Budget',
        currentPeriodEnd: '2026-09-15T00:00:00.000Z',
        currentPeriodStart: '2026-08-15T00:00:00.000Z',
        status: 'CANCELED',
      }),
    ],
  });
}

/**
 * The customers, the license versions and the instances, as the instance slot serves
 * them. Initech has an address its invoices go to, unless `billingEmail` says it has none.
 */
export function createLifecycleInstancesModel(
  options: { billingEmail?: string | null } = {},
) {
  const customers: Customer[] = [
    buildCustomer({
      billingEmail:
        options.billingEmail === null
          ? undefined
          : (options.billingEmail ?? 'ap@initech.test'),
      id: 'customer-initech',
      name: INITECH.name,
      slug: INITECH.slug,
    }),
    buildCustomer({
      id: 'customer-hooli',
      name: HOOLI.name,
      slug: HOOLI.slug,
    }),
  ];
  const billingBlocks = {
    'hooli-prod': { status: 'CANCELED' as const, unpaidInvoiceIds: [] },
    'initech-late': {
      status: 'PAST_DUE' as const,
      unpaidInvoiceIds: [INITECH_LATE_INVOICE_ID],
    },
    'initech-leaving': { status: 'ACTIVE' as const, unpaidInvoiceIds: [] },
    'initech-moving': { status: 'ACTIVE' as const, unpaidInvoiceIds: [] },
    'initech-prod': { status: 'ACTIVE' as const, unpaidInvoiceIds: [] },
    'initech-seats': { status: 'ACTIVE' as const, unpaidInvoiceIds: [] },
    'initech-trial': { status: 'TRIAL' as const, unpaidInvoiceIds: [] },
  };

  return new InstanceAppModel({
    billingBlocks,
    customers,
    instances: LIFECYCLE_INSTANCES.map(({ customer, name, slug }) => ({
      createdAt: '2026-03-02T09:00:00.000Z',
      createdBy: customers[0].createdBy,
      customerId: customer === INITECH ? 'customer-initech' : 'customer-hooli',
      customerSlug: customer.slug,
      description: `${name} environment`,
      endLicenseDate: '2027-03-01T00:00:00.000Z',
      id: `instance-${slug}`,
      licenseId: PRO_V2_ID,
      licenseSlug: 'pro-v2',
      metadata: {},
      name,
      slug,
      startLicenseDate: '2026-03-01T00:00:00.000Z',
      status: 'HEALTHY' as const,
      updatedAt: '2026-03-02T09:00:00.000Z',
      updatedBy: customers[0].createdBy,
    })),
    licenses: lifecycleLicenses(),
  });
}

/**
 * The catalogue of licenses of the lifecycle world, as the license slot serves it,
 * with one family listed in the public catalogue and one that is private: what the
 * switch of the family is exercised on.
 */
export function createLifecycleLicensesModel() {
  return new LicenseAppModel({
    licenses: lifecycleLicenses(),
    prices: LIFECYCLE_PRICES,
    publicFamilyIds: ['family-enterprise'],
  });
}

/**
 * The lifecycle world on a deployment that offers Stripe, for the specs of who collects
 * a contract and how. Initech Production lives on the organization's own system, with two
 * invoices still open: `inv-m1`, ready to bill and waiting for the accounting system, and
 * `inv-h1`, a draft its usage journal holds.
 *
 * - `standing` is where Stripe stands: connected, or free to be connected;
 * - `billingEmail` is the address Initech's invoices go to, in the customer and in Stripe's
 *   records, or `null` for none.
 */
export function createLifecycleStripeModels(
  options: { billingEmail?: string | null; standing?: StripeStanding } = {},
) {
  const email =
    options.billingEmail === undefined
      ? 'ap@initech.test'
      : options.billingEmail;
  const open = invoiceSet().invoices.filter(
    ({ id }) => id === 'inv-m1' || id === 'inv-h1',
  );

  return {
    billing: createLifecycleBillingModel(
      billingCapabilitiesProfiles.stackWithStripe(
        options.standing ?? 'connected',
      ),
      {
        invoices: open,
        providers: {
          customers: { initech: email === null ? {} : { billingEmail: email } },
        },
      },
    ),
    instances: createLifecycleInstancesModel({ billingEmail: email }),
  };
}
