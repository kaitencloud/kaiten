import type { BillingCapabilities, Invoice } from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
  buildUsageReport,
  INITECH_INSTANCE_ID,
  TRACES_ENTITLEMENT_ID,
} from '../_support/fixtures/build-invoice';
import {
  BillingAppModel,
  CAPABILITIES_OUTAGES,
} from '../_support/model/billing-app-model';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
} from '../_support/model/billing-capabilities';
import {
  ACME_LEGACY_SUBSCRIPTION,
  ACME_PRODUCTION,
  ACME_PRODUCTION_SUBSCRIPTION,
  acmeInvoices,
  acmeProductionUpcoming,
  billedCatalogue,
} from './billed-instances';
import { GLOBEX_IDENTITY, invoiceSet } from './invoice-fixtures';

/**
 * Billing on, as the API of the local stack serves it: NoOp as the only
 * provider, and no part of the release past the base loop. The profile the specs
 * use unless they say otherwise.
 */
export function createBillingStackModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
  });
}

/** Stripe connected, every part of billing shipped. */
export function createBillingFullModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.full(),
  });
}

/**
 * A release that ships the lifecycle and Stripe but not trials, add-ons,
 * vouchers, automatic collection nor the public surface: the console offers only
 * what this release can do.
 */
export function createBillingFeatureGatedModel() {
  return new BillingAppModel({
    capabilities: billingCapabilities({
      features: {
        addons: false,
        chargeAutomatically: false,
        lifecycle: true,
        publicSurface: false,
        stripe: true,
        trials: false,
        vouchers: false,
      },
    }),
  });
}

/** Billing off: on this deployment, or because the plan does not include it. */
export function createBillingDisabledModel(
  reason: NonNullable<BillingCapabilities['disabledReason']>,
) {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.disabled(reason),
  });
}

/**
 * Billing whose capabilities cannot be read: the caller lacks `read:billing`,
 * the entitlement check is down, the API predates billing, or it never answers.
 * Every one hides billing; none shows an error page.
 */
export function createBillingOutageModel(
  outage: keyof typeof CAPABILITIES_OUTAGES,
) {
  const model = createBillingStackModel();
  model.failCapabilities(CAPABILITIES_OUTAGES[outage]);
  return model;
}

/**
 * An organization with invoices: the set of `invoice-fixtures.ts`, on the
 * capabilities of the local stack (NoOp, nothing past the base loop) unless it
 * is given Stripe. Where the usage that is kept begins is `retentionStart`: a
 * line whose period starts before it has lost its reports. How many months of
 * usage the organization keeps is `retentionMonths`, which the capabilities
 * carry: the console reads it to say beforehand what a recompose would lose.
 */
export function createInvoicesModel(
  options: {
    retentionMonths?: number;
    retentionStart?: string;
    stripe?: boolean;
  } = {},
) {
  const { invoices, lineReports } = invoiceSet();
  const stripeInvoices: Invoice[] = options.stripe
    ? [
        buildInvoice({
          boundaryAt: '2026-04-01T00:00:00.000Z',
          createdAt: '2026-04-01T00:06:00.000Z',
          id: 'inv-s1',
          issuedAt: '2026-04-01T00:06:00.000Z',
          lines: [
            buildInvoiceLine({
              amount: 2900,
              description: '1 × $29.00 per month',
              invoiceId: 'inv-s1',
              label: 'Pro, monthly',
              seq: 1,
              serviceFrom: '2026-04-01T00:00:00.000Z',
              serviceTo: '2026-05-01T00:00:00.000Z',
              type: 'BASE',
              unitAmountDecimal: '2900',
            }),
          ],
          providerKind: 'STRIPE',
          status: 'PUSHED',
        }),
        buildInvoice({
          boundaryAt: '2026-04-01T00:00:00.000Z',
          createdAt: '2026-04-01T00:07:00.000Z',
          id: 'inv-f1',
          lines: [
            buildInvoiceLine({
              amount: 2900,
              description: '1 × $29.00 per month',
              invoiceId: 'inv-f1',
              label: 'Pro, monthly',
              seq: 1,
              serviceFrom: '2026-04-01T00:00:00.000Z',
              serviceTo: '2026-05-01T00:00:00.000Z',
              type: 'BASE',
              unitAmountDecimal: '2900',
            }),
          ],
          providerKind: 'STRIPE',
          status: 'PUSH_FAILED',
        }),
      ]
    : [];

  const capabilities = options.stripe
    ? billingCapabilitiesProfiles.full()
    : billingCapabilitiesProfiles.stack();

  return new BillingAppModel({
    capabilities:
      options.retentionMonths === undefined
        ? capabilities
        : {
            ...capabilities,
            usageHistoryRetentionMonths: options.retentionMonths,
          },
    deletedInstances: ['globex-prod'],
    invoices: [...invoices, ...stripeInvoices],
    lineReports,
    retentionStart: options.retentionStart,
  });
}

/** Billing on, and not one invoice composed yet. */
export function createEmptyInvoicesModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
  });
}

/**
 * More invoices than a page holds: sixty settled ones, which the list reads
 * fifty at a time. The newest is `inv-bulk-60`.
 */
export function createManyInvoicesModel() {
  const invoices = Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    const id = `inv-bulk-${String(number).padStart(2, '0')}`;
    const boundaryAt = new Date(
      Date.UTC(2025, 0, 1) + number * 24 * 60 * 60 * 1000,
    ).toISOString();

    return buildInvoice({
      boundaryAt,
      createdAt: boundaryAt,
      id,
      lines: [
        buildInvoiceLine({
          amount: 2900,
          description: '1 × $29.00 per month',
          invoiceId: id,
          label: 'Pro, monthly',
          seq: 1,
          serviceFrom: boundaryAt,
          serviceTo: new Date(
            Date.parse(boundaryAt) + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          type: 'BASE',
          unitAmountDecimal: '2900',
        }),
      ],
      paidAt: boundaryAt,
      status: 'PAID',
    });
  });

  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    invoices,
  });
}

/**
 * An invoice that was voided for an instance that has been deleted since: it
 * cannot be recomposed, since its usage cannot be measured again.
 */
export function createDeletedInstanceModel() {
  const id = 'inv-gone';
  const invoice = buildInvoice({
    boundaryAt: '2026-04-01T00:00:00.000Z',
    id,
    identity: GLOBEX_IDENTITY,
    lines: [
      buildInvoiceLine({
        amount: 2900,
        description: '1 × $29.00 per month',
        invoiceId: id,
        label: 'Pro, monthly',
        seq: 1,
        serviceFrom: '2026-04-01T00:00:00.000Z',
        serviceTo: '2026-05-01T00:00:00.000Z',
        type: 'BASE',
        unitAmountDecimal: '2900',
      }),
    ],
    status: 'VOID',
    voidReason: 'duplicate',
    voidedAt: '2026-04-02T09:00:00.000Z',
  });

  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    deletedInstances: [GLOBEX_IDENTITY.instanceSlug],
    invoices: [invoice],
  });
}

/**
 * An invoice whose totals disagree with its lines on purpose: lines of 29.00,
 * 20.00 and −5.81 add up to 43.19, and the API states 49.00, 5.80 and 43.20.
 * The console shows what the API states and adds nothing up.
 */
export function createMismatchedTotalsModel() {
  const id = 'inv-odd';
  const line = (
    seq: number,
    amount: number,
    label: string,
    type: 'BASE' | 'ADDON' | 'DISCOUNT',
  ) =>
    buildInvoiceLine({
      amount,
      description: label,
      invoiceId: id,
      label,
      seq,
      serviceFrom: '2026-04-01T00:00:00.000Z',
      serviceTo: '2026-05-01T00:00:00.000Z',
      type,
    });

  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    invoices: [
      buildInvoice({
        boundaryAt: '2026-04-01T00:00:00.000Z',
        discountTotal: 580,
        id,
        lines: [
          line(1, 2900, 'Pro, monthly', 'BASE'),
          line(2, 2000, 'Support add-on', 'ADDON'),
          line(3, -581, 'Welcome discount', 'DISCOUNT'),
        ],
        subtotal: 4900,
        total: 4320,
      }),
    ],
  });
}

/**
 * A metered line with more reports than a page holds: 520, the first 505 in
 * March and the last 15 in April, read 500 at a time. The first page ends inside
 * March, which is therefore not whole until the second is read.
 */
export function createManyReportsModel() {
  const id = 'inv-big';
  const lineId = `${id}-line-1`;
  const reports = Array.from({ length: 520 }, (_, index) => {
    const seq = index + 1;
    const inMarch = seq <= 505;

    return buildUsageReport({
      delta: inMarch ? '1' : '2',
      limitValue: '100000',
      overageDelta: '0',
      reportSeq: seq,
      reportedAt: inMarch
        ? '2026-03-15T10:00:00.000Z'
        : '2026-04-15T10:00:00.000Z',
      reportedValue: inMarch ? '1' : '2',
      valueAfter: String(inMarch ? seq : 505 + (seq - 505) * 2),
      valueBefore: String(inMarch ? seq - 1 : 505 + (seq - 506) * 2),
      windowEnd: inMarch
        ? '2026-04-01T00:00:00.000Z'
        : '2026-05-01T00:00:00.000Z',
      windowStart: inMarch
        ? '2026-03-01T00:00:00.000Z'
        : '2026-04-01T00:00:00.000Z',
    });
  });

  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    invoices: [
      buildInvoice({
        boundaryAt: '2026-05-01T00:00:00.000Z',
        id,
        lines: [
          buildInvoiceLine({
            amount: 0,
            description: '535 events, 0 above the allowance',
            entitlementId: TRACES_ENTITLEMENT_ID,
            entitlementSlug: 'events',
            id: lineId,
            invoiceId: id,
            label: 'Events',
            metering: {
              ledger: {
                firstSeq: 1,
                instanceId: INITECH_INSTANCE_ID,
                lastSeq: 520,
                rows: 520,
                sumDelta: '535',
                sumOverage: '0',
              },
              measuredQuantity: '535',
              negativeSegmentsFloored: 0,
              saleUnitFactor: '1',
              windows: 2,
            },
            quantity: '535',
            seq: 1,
            serviceFrom: '2026-03-01T00:00:00.000Z',
            serviceTo: '2026-05-01T00:00:00.000Z',
            type: 'USAGE',
            unitAmountDecimal: '0',
          }),
        ],
      }),
    ],
    lineReports: { [lineId]: reports },
  });
}

/**
 * A queue longer than a page: fifty-five invoices waiting for the accounting
 * system, issued a day apart, the oldest first.
 */
export function createLongHandoffQueueModel() {
  const invoices = Array.from({ length: 55 }, (_, index) => {
    const number = index + 1;
    const id = `inv-queue-${String(number).padStart(2, '0')}`;
    const issuedAt = new Date(
      Date.UTC(2025, 0, 1) + number * 24 * 60 * 60 * 1000,
    ).toISOString();

    return buildInvoice({
      boundaryAt: issuedAt,
      createdAt: issuedAt,
      handoff: { claimCount: 0, status: 'PENDING' },
      id,
      issuedAt,
      lines: [
        buildInvoiceLine({
          amount: 2900,
          description: '1 × $29.00 per month',
          invoiceId: id,
          label: 'Pro, monthly',
          seq: 1,
          serviceFrom: issuedAt,
          serviceTo: new Date(
            Date.parse(issuedAt) + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          type: 'BASE',
          unitAmountDecimal: '2900',
        }),
      ],
    });
  });

  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    invoices,
  });
}

/**
 * The billing of the instances of Acme and Beta, on the capabilities of the
 * local stack: Acme Production is subscribed, on a contract of its own, and its
 * next invoice would be held for its usage journal; Acme Legacy ended its
 * subscription; Beta Staging has none and its version is on sale; Beta Lab has
 * none and its version is a draft. The invoices are the ones Acme has had, one of
 * them not settled yet.
 */
export function createSubscriptionsModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    catalogue: billedCatalogue(),
    invoices: acmeInvoices(),
    subscriptions: [ACME_PRODUCTION_SUBSCRIPTION, ACME_LEGACY_SUBSCRIPTION],
    upcoming: { 'acme-production': acmeProductionUpcoming() },
  });
}

/**
 * Acme with more invoices than a page holds: sixty settled ones of its
 * production instance, which the page of the customer reads fifty at a time. The
 * newest is `inv-acme-bulk-60`.
 */
export function createManyAcmeInvoicesModel() {
  const invoices = Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    const id = `inv-acme-bulk-${String(number).padStart(2, '0')}`;
    const boundaryAt = new Date(
      Date.UTC(2025, 0, 1) + number * 24 * 60 * 60 * 1000,
    ).toISOString();

    return buildInvoice({
      boundaryAt,
      createdAt: boundaryAt,
      id,
      identity: ACME_PRODUCTION,
      lines: [
        buildInvoiceLine({
          amount: 49900,
          description: '1 × $499.00 per month',
          invoiceId: id,
          label: 'Enterprise, monthly',
          seq: 1,
          serviceFrom: boundaryAt,
          serviceTo: new Date(
            Date.parse(boundaryAt) + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          type: 'BASE',
          unitAmountDecimal: '49900',
        }),
      ],
      paidAt: boundaryAt,
      status: 'PAID',
    });
  });

  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    invoices,
  });
}
