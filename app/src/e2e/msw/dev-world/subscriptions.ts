import type {
  Customer,
  Entitlement,
  Instance,
  InstanceAddon,
  InstanceBilling,
  Invoice,
  InvoicePreview,
  License,
  Price,
} from '@/api-client';
import { buildInvoiceLine } from '../../../../e2e/app/_support/fixtures/build-invoice';
import {
  buildSubscription,
  buildUpcomingInvoice,
} from '../../../../e2e/app/_support/fixtures/build-subscription';
import type {
  BillingCatalogue,
  SubscribableInstance,
} from '../../../../e2e/app/_support/model/billing-subscriptions';
import { bySlug } from './by-slug';
import { dayStart, monthFrom } from './billing';

/**
 * What the subscriptions of the world need of the rest of it: the instances
 * they bill, the customers those belong to, and the licenses and prices the
 * subscriptions are pinned to.
 */
type SubscriptionsWorld = {
  customers: Customer[];
  entitlements: Entitlement[];
  instances: Instance[];
  licensePrices: Record<string, Price[]>;
  licenses: License[];
};

type Subscription = {
  /** Where its periods are counted from, as days before today. */
  anchoredDaysAgo: number;
  /** The id suffix of the price it is pinned to. */
  period: 'annual' | 'monthly';
  /** The start of its current period. */
  periodStart: string;
  /** The end of its current period, when it is not one period after its start. */
  periodEnd?: string;
};

const SUBSCRIPTIONS: Record<string, Subscription & { license: string }> = {
  'acme-legacy': {
    anchoredDaysAgo: 330,
    license: 'enterprise',
    period: 'monthly',
    periodStart: dayStart(150),
  },
  'acme-production': {
    anchoredDaysAgo: 180,
    license: 'enterprise-v2',
    period: 'annual',
    periodEnd: dayStart(-185),
    periodStart: dayStart(180),
  },
  'acme-us': {
    anchoredDaysAgo: 150,
    license: 'enterprise-v2',
    period: 'monthly',
    // The renewal held for its journal was composed at this boundary.
    periodStart: monthFrom(30).to,
  },
  // The trial of a free plan: thirty days, twenty of them gone.
  'beta-staging': {
    anchoredDaysAgo: 20,
    license: 'trial',
    period: 'monthly',
    periodEnd: dayStart(-10),
    periodStart: dayStart(20),
  },
  'globex-production': {
    anchoredDaysAgo: 40,
    license: 'business',
    period: 'monthly',
    periodStart: dayStart(10),
  },
  'globex-staging': {
    anchoredDaysAgo: 38,
    license: 'starter-v2',
    period: 'monthly',
    periodStart: dayStart(8),
  },
};

/** The statuses of an invoice that is not settled yet: the ones that keep an instance from being deleted. */
const UNSETTLED = new Set([
  'DRAFT',
  'MANUAL',
  'PAYMENT_FAILED',
  'PUSH_FAILED',
  'PUSHED',
]);

const priceOf = (
  { licensePrices, licenses }: SubscriptionsWorld,
  licenseSlug: string,
  period: 'annual' | 'monthly',
): Price => {
  const id = `${bySlug(licenses, licenseSlug).id}-${period}`;
  const price = licensePrices[licenseSlug]?.find(
    (candidate) => candidate.id === id,
  );
  if (!price) {
    throw new Error(`The dev world has no price "${id}"`);
  }

  return price;
};

function subscriptionOf(
  world: SubscriptionsWorld,
  instanceSlug: string,
  {
    anchoredDaysAgo,
    license,
    period,
    periodEnd,
    periodStart,
  }: Subscription & { license: string },
): InstanceBilling {
  const instance = bySlug(world.instances, instanceSlug);
  const customer = bySlug(world.customers, instance.customerSlug);

  return buildSubscription({
    anchorAt: dayStart(anchoredDaysAgo),
    basePrice: priceOf(world, license, period),
    currentPeriodEnd: periodEnd,
    currentPeriodStart: periodStart,
    customerName: customer.name,
    customerSlug: customer.slug ?? customer.id,
    instanceName: instance.name,
    instanceSlug,
    startedAt: dayStart(anchoredDaysAgo),
  });
}

// What the API writes on a base line: one unit at the amount of the price, as "1 × 99.00 USD".
const baseLineDescription = (price: Price) =>
  `1 × ${(Number(price.unitAmountDecimal) / 100).toFixed(2)} ${price.currency}`;

const baseLine = (price: Price, from: string, to: string, label: string) =>
  buildInvoiceLine({
    amount: Math.round(Number(price.unitAmountDecimal)),
    description: baseLineDescription(price),
    invoiceId: 'upcoming',
    label,
    seq: 1,
    serviceFrom: from,
    serviceTo: to,
    type: 'BASE',
    unitAmountDecimal: price.unitAmountDecimal,
  });

/**
 * The subscriptions of the world, attached by slug to the instances and the
 * invoices the world already has, and what each will issue next. Globex pays by
 * the month and is billed for its calls above the allowance, Acme Production
 * pays a year at a time, Acme US has a renewal whose journal fails a check and
 * says so before it is composed, Acme Legacy ended its subscription, and Gamma
 * Production has none yet.
 */
export function createBillingSubscriptions(world: SubscriptionsWorld): {
  addons: Record<string, InstanceAddon[]>;
  catalogue: BillingCatalogue;
  subscriptions: InstanceBilling[];
  upcoming: Record<string, InvoicePreview>;
} {
  const apiCalls = bySlug(world.entitlements, 'api-calls');
  const subscriptions = Object.entries(SUBSCRIPTIONS).map(
    ([instanceSlug, subscription]) => {
      const built = subscriptionOf(world, instanceSlug, subscription);

      if (instanceSlug === 'acme-legacy') {
        return {
          ...built,
          canceledAt: dayStart(100),
          cancellationReason: 'The contract was not renewed',
          status: 'CANCELED' as const,
        };
      }
      // Acme Production moves to Business, annual, when its year ends.
      if (instanceSlug === 'acme-production') {
        return {
          ...built,
          daysUntilDue: 45,
          daysUntilDueOverride: 45,
          scheduledChange: {
            effectiveAt: built.currentPeriodEnd,
            price: priceOf(world, 'business', 'annual'),
            scheduledAt: dayStart(5),
          },
        };
      }
      // Beta Staging is on its free trial, which ends when its period does.
      if (instanceSlug === 'beta-staging') {
        return {
          ...built,
          status: 'TRIAL' as const,
          trialEndsAt: built.currentPeriodEnd,
        };
      }
      // Globex Production never paid its first invoice, which fell due ten days ago.
      if (instanceSlug === 'globex-production') {
        return {
          ...built,
          pastDueSince: dayStart(10),
          status: 'PAST_DUE' as const,
        };
      }
      // Globex Staging asked to end at the close of its period.
      if (instanceSlug === 'globex-staging') {
        return {
          ...built,
          cancelAtPeriodEnd: true,
          cancelRequestedAt: dayStart(3),
          cancellationReason: 'Moving to a self-hosted setup',
        };
      }

      return built;
    },
  );
  const bySubscription = (slug: string) =>
    subscriptions.find((candidate) => candidate.instanceSlug === slug);
  const asOf = new Date().toISOString();

  const globexProduction = bySubscription('globex-production');
  const globexStaging = bySubscription('globex-staging');
  const acmeUs = bySubscription('acme-us');
  if (!globexProduction || !globexStaging || !acmeUs) {
    throw new Error('The dev world lost a subscription');
  }
  const nextPeriod = (subscription: InstanceBilling) => ({
    from: subscription.currentPeriodEnd,
    to: new Date(
      new Date(subscription.currentPeriodEnd).setUTCMonth(
        new Date(subscription.currentPeriodEnd).getUTCMonth() +
          (subscription.billingPeriod === 'ANNUAL' ? 12 : 1),
      ),
    ).toISOString(),
  });

  const upcomingOf = (
    subscription: InstanceBilling,
    usage: {
      amount: number;
      description: string;
      label: string;
      quantity: string;
      unit: string;
    } | null,
    wouldHold: InvoicePreview['wouldHold'] = [],
  ): InvoicePreview => {
    const next = nextPeriod(subscription);
    // The plan a scheduled change moves to bills the period that follows.
    const plan = subscription.scheduledChange?.price ?? subscription.basePrice;
    const base = baseLine(
      plan,
      next.from,
      next.to,
      plan.displayLabel ?? 'Base fee',
    );
    const lines = usage
      ? [
          buildInvoiceLine({
            amount: usage.amount,
            description: usage.description,
            entitlementId: apiCalls.id,
            entitlementSlug: 'api-calls',
            invoiceId: 'upcoming',
            label: usage.label,
            quantity: usage.quantity,
            seq: 1,
            serviceFrom: subscription.currentPeriodStart,
            serviceTo: subscription.currentPeriodEnd,
            type: 'OVERAGE',
            unitAmountDecimal: usage.unit,
          }),
          { ...base, seq: 2, id: 'upcoming-line-2' },
        ]
      : [base];
    let subtotal = 0;
    for (const line of lines) {
      subtotal += line.amount;
    }

    return buildUpcomingInvoice({
      asOf,
      boundaryAt: subscription.currentPeriodEnd,
      currency: subscription.currency,
      licenseSlug: bySlug(world.instances, subscription.instanceSlug)
        .licenseSlug,
      lines,
      serviceFrom: lines[0]?.serviceFrom,
      serviceTo: lines.at(-1)?.serviceTo,
      subtotal,
      wouldHold,
    });
  };

  // Acme Production has none seeded: it moves to another plan at its boundary, and
  // the model composes what that boundary issues from the plan that is scheduled.
  const upcoming: Record<string, InvoicePreview> = {
    'acme-us': upcomingOf(
      acmeUs,
      {
        amount: 400,
        description: '400 × $0.01 per call',
        label: 'API calls, overage',
        quantity: '400',
        unit: '1',
      },
      [{ entitlementId: apiCalls.id, invariant: 'LEDGER_SEQUENCE_GAP' }],
    ),
    'globex-production': upcomingOf(globexProduction, {
      amount: 420,
      description: '4,200 × $0.001 per call',
      label: 'API calls, overage',
      quantity: '4200',
      unit: '0.1',
    }),
    'globex-staging': upcomingOf(globexStaging, {
      amount: 240,
      description: '1,200 × $0.002 per call',
      label: 'API calls',
      quantity: '1200',
      unit: '0.2',
    }),
  };

  const catalogue: BillingCatalogue = {
    instances: world.instances.map((instance): SubscribableInstance => {
      const license = bySlug(world.licenses, instance.licenseSlug);
      const customer = bySlug(world.customers, instance.customerSlug);

      return {
        customerName: customer.name,
        customerSlug: customer.slug ?? customer.id,
        instanceName: instance.name,
        instanceSlug: instance.slug ?? instance.id,
        licenseId: license.id,
        licenseSlug: license.slug ?? license.id,
        licenseState: license.lifecycleState ?? 'PUBLISHED',
        trialPeriodDays: license.trialPeriodDays ?? undefined,
      };
    }),
    // A version no instance runs is on sale or not as its license says.
    licenseStates: Object.fromEntries(
      world.licenses.map((license) => [
        license.slug ?? license.id,
        license.lifecycleState ?? 'PUBLISHED',
      ]),
    ),
    prices: world.licensePrices,
  };

  // Globex Staging runs two extra seats, which a cancellation offers to take off.
  const addons: Record<string, InstanceAddon[]> = {
    'globex-staging': [
      {
        addonId: 'addon-extra-seats-v1',
        addonSlug: 'extra-seats-v1',
        attachedAt: dayStart(30),
        familySlug: 'extra-seats',
        id: 'instance-addon-globex-staging-seats',
        maxQuantity: 10,
        name: 'Extra seats',
        prices: [],
        quantity: 2,
      },
    ],
  };

  return { addons, catalogue, subscriptions, upcoming };
}

/**
 * What the billing of the world leaves in the way of changing or deleting an
 * instance and a customer: the subscription that lives, and the invoices not
 * settled yet. The API refuses with these (`UpdateInstance.BillingActive`,
 * `DeleteInstance.BillingActive`, `DeleteCustomer.BillingActive`).
 */
export function createBillingBlocks(
  subscriptions: InstanceBilling[],
  invoices: Invoice[],
): {
  customers: Record<string, { live: boolean; unpaidInvoiceIds: string[] }>;
  instances: Record<
    string,
    { status: InstanceBilling['status']; unpaidInvoiceIds: string[] }
  >;
} {
  const unpaid = (instanceSlug: string) =>
    invoices
      .filter(
        (invoice) =>
          invoice.instanceSlug === instanceSlug &&
          UNSETTLED.has(invoice.status),
      )
      .map((invoice) => invoice.id);
  const instances = Object.fromEntries(
    subscriptions.map((subscription) => [
      subscription.instanceSlug,
      {
        status: subscription.status,
        unpaidInvoiceIds: unpaid(subscription.instanceSlug),
      },
    ]),
  );
  const customers: Record<
    string,
    { live: boolean; unpaidInvoiceIds: string[] }
  > = {};
  for (const subscription of subscriptions) {
    const current = customers[subscription.customerSlug] ?? {
      live: false,
      unpaidInvoiceIds: [],
    };
    customers[subscription.customerSlug] = {
      live: current.live || subscription.status !== 'CANCELED',
      unpaidInvoiceIds: [
        ...current.unpaidInvoiceIds,
        ...unpaid(subscription.instanceSlug),
      ],
    };
  }

  return { customers, instances };
}
