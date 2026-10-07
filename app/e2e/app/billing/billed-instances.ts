import type { Invoice, UsageReport } from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
  buildUsageReport,
  type InvoiceIdentity,
} from '../_support/fixtures/build-invoice';
import { buildPrice } from '../_support/fixtures/build-pricing';
import {
  buildSubscription,
  buildUpcomingInvoice,
} from '../_support/fixtures/build-subscription';
import type { BillingCatalogue } from '../_support/model/billing-subscriptions';

/**
 * The organization the specs of the billing of an instance read: three customers
 * and the instances they run, some subscribed and some not, on license versions
 * that are on sale and one that is not. The instance, customer and license slugs
 * here are the ones the scenarios of the instances, the customers and the
 * entitlements use, so that the slots of one spec agree about who exists.
 *
 * The specs freeze the page at `BILLED_NOW` (`page.clock.setFixedTime`), so that
 * the periods, the boundaries and the dates a subscription starts at are
 * the same whatever day they run, and the fixed dates below sit around it.
 */
export const BILLED_NOW = '2026-10-07T12:00:00.000Z';

const ACME = { name: 'Acme Corp', slug: 'acme-corp' } as const;
const BETA = { name: 'Beta Industries', slug: 'beta-industries' } as const;

export const ACME_PRODUCTION_ID = 'instance-acme-production';
export const API_CALLS_ID = '8a1d4c3e-7b52-4a8c-b1f0-6e2d9c4a7f33';
export const ENTERPRISE_LICENSE_ID = 'license-enterprise';
export const STARTER_LICENSE_ID = 'license-starter';
export const PREVIEW_LICENSE_ID = 'license-preview';

export const ACME_PRODUCTION: InvoiceIdentity = {
  customerName: ACME.name,
  customerSlug: ACME.slug,
  instanceName: 'Acme Production',
  instanceSlug: 'acme-production',
  licenseId: ENTERPRISE_LICENSE_ID,
  licenseSlug: 'enterprise',
};
export const ACME_LEGACY: InvoiceIdentity = {
  ...ACME_PRODUCTION,
  instanceName: 'Acme Legacy',
  instanceSlug: 'acme-legacy',
};

/** A price that bills in advance, which is the default of the version. */
export const ENTERPRISE_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  isDefault: true,
  unitAmountDecimal: '49900',
});
/** One that bills in arrears: its first invoice waits for its first period to close. */
export const ENTERPRISE_ANNUAL = buildPrice({
  billingPeriod: 'ANNUAL',
  billingTiming: 'ARREARS',
  displayLabel: 'Enterprise, annual',
  displayOrder: 1,
  id: 'price-enterprise-annual',
  unitAmountDecimal: '499000',
});
/** A metered price of the version, which a subscription is never pinned to. */
export const ENTERPRISE_PER_CALL = buildPrice({
  billingModel: 'USAGE_BASED',
  billingPeriod: undefined,
  displayLabel: 'API calls',
  id: 'price-enterprise-calls',
  unitAmountDecimal: '0.1',
});
export const STARTER_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Starter, monthly',
  id: 'price-starter-monthly',
  isDefault: true,
  unitAmountDecimal: '2900',
});

/** What the billing slot knows of the instances and of what their versions sell. */
export function billedCatalogue(): BillingCatalogue {
  return {
    instances: [
      {
        customerName: ACME.name,
        customerSlug: ACME.slug,
        instanceName: 'Acme Production',
        instanceSlug: 'acme-production',
        licenseId: ENTERPRISE_LICENSE_ID,
        licenseSlug: 'enterprise',
        licenseState: 'PUBLISHED',
      },
      {
        customerName: ACME.name,
        customerSlug: ACME.slug,
        instanceName: 'Acme Legacy',
        instanceSlug: 'acme-legacy',
        licenseId: ENTERPRISE_LICENSE_ID,
        licenseSlug: 'enterprise',
        licenseState: 'PUBLISHED',
      },
      {
        customerName: BETA.name,
        customerSlug: BETA.slug,
        instanceName: 'Beta Staging',
        instanceSlug: 'beta-staging',
        licenseId: STARTER_LICENSE_ID,
        licenseSlug: 'starter',
        licenseState: 'PUBLISHED',
      },
      {
        customerName: BETA.name,
        customerSlug: BETA.slug,
        instanceName: 'Beta Lab',
        instanceSlug: 'beta-lab',
        licenseId: PREVIEW_LICENSE_ID,
        licenseSlug: 'preview',
        licenseState: 'DRAFT',
      },
    ],
    prices: {
      enterprise: [ENTERPRISE_PER_CALL, ENTERPRISE_ANNUAL, ENTERPRISE_MONTHLY],
      preview: [],
      starter: [STARTER_MONTHLY],
    },
  };
}

/** Acme Production pays a month at a time, in 45 days by its contract, and its period ends on the 15th. */
export const ACME_PRODUCTION_SUBSCRIPTION = buildSubscription({
  anchorAt: '2026-08-15T00:00:00.000Z',
  basePrice: ENTERPRISE_MONTHLY,
  currentPeriodEnd: '2026-10-15T00:00:00.000Z',
  currentPeriodStart: '2026-09-15T00:00:00.000Z',
  customerName: ACME.name,
  customerSlug: ACME.slug,
  daysUntilDueOverride: 45,
  instanceName: 'Acme Production',
  instanceSlug: 'acme-production',
});

/** Acme Legacy ended its subscription in June, and can be subscribed again. */
export const ACME_LEGACY_SUBSCRIPTION = buildSubscription({
  anchorAt: '2026-03-15T00:00:00.000Z',
  basePrice: ENTERPRISE_MONTHLY,
  canceledAt: '2026-06-01T00:00:00.000Z',
  cancellationReason: 'The contract was not renewed',
  currentPeriodEnd: '2026-06-15T00:00:00.000Z',
  currentPeriodStart: '2026-05-15T00:00:00.000Z',
  customerName: ACME.name,
  customerSlug: ACME.slug,
  instanceName: 'Acme Legacy',
  instanceSlug: 'acme-legacy',
  status: 'CANCELED',
});

/**
 * What the next boundary of Acme Production will issue: the calls above the
 * allowance of the period that closes, and the next month of the fee. The usage
 * journal of the calls fails a check, so the API says it would be held.
 */
export function acmeProductionUpcoming() {
  return buildUpcomingInvoice({
    asOf: BILLED_NOW,
    boundaryAt: '2026-10-15T00:00:00.000Z',
    lines: [
      buildInvoiceLine({
        amount: 420,
        description: '4,200 × $0.001 per call',
        entitlementId: API_CALLS_ID,
        entitlementSlug: 'api-calls',
        invoiceId: 'upcoming',
        label: 'API calls, overage',
        quantity: '4200',
        seq: 1,
        serviceFrom: '2026-09-15T00:00:00.000Z',
        serviceTo: '2026-10-15T00:00:00.000Z',
        type: 'OVERAGE',
        unitAmountDecimal: '0.1',
      }),
      buildInvoiceLine({
        amount: 49900,
        description: '1 × $499.00 per month',
        invoiceId: 'upcoming',
        label: 'Enterprise, monthly',
        seq: 2,
        serviceFrom: '2026-10-15T00:00:00.000Z',
        serviceTo: '2026-11-15T00:00:00.000Z',
        type: 'BASE',
        unitAmountDecimal: '49900',
      }),
    ],
    serviceFrom: '2026-09-15T00:00:00.000Z',
    serviceTo: '2026-11-15T00:00:00.000Z',
    subtotal: 50320,
    total: 50320,
    wouldHold: [
      { entitlementId: API_CALLS_ID, invariant: 'LEDGER_SEQUENCE_GAP' },
    ],
  });
}

const baseLine = (invoiceId: string, from: string, to: string) =>
  buildInvoiceLine({
    amount: 49900,
    description: '1 × $499.00 per month',
    invoiceId,
    label: 'Enterprise, monthly',
    seq: 1,
    serviceFrom: from,
    serviceTo: to,
    type: 'BASE',
    unitAmountDecimal: '49900',
  });

/** The invoices Acme has had: the two of Acme Production, one of them still to be settled, and two of Acme Legacy. */
export function acmeInvoices(): Invoice[] {
  return [
    buildInvoice({
      boundaryAt: '2026-08-15T00:00:00.000Z',
      id: 'inv-acme-activation',
      identity: ACME_PRODUCTION,
      kind: 'ACTIVATION',
      lines: [
        baseLine(
          'inv-acme-activation',
          '2026-08-15T00:00:00.000Z',
          '2026-09-15T00:00:00.000Z',
        ),
      ],
      paidAt: '2026-08-20T00:00:00.000Z',
      status: 'PAID',
    }),
    buildInvoice({
      boundaryAt: '2026-09-15T00:00:00.000Z',
      handoff: { claimCount: 0, status: 'PENDING' },
      id: 'inv-acme-renewal',
      identity: ACME_PRODUCTION,
      lines: [
        baseLine(
          'inv-acme-renewal',
          '2026-09-15T00:00:00.000Z',
          '2026-10-15T00:00:00.000Z',
        ),
      ],
      status: 'MANUAL',
    }),
    buildInvoice({
      boundaryAt: '2026-04-15T00:00:00.000Z',
      id: ACME_LEGACY_OPEN_INVOICE_ID,
      identity: ACME_LEGACY,
      lines: [
        baseLine(
          ACME_LEGACY_OPEN_INVOICE_ID,
          '2026-04-15T00:00:00.000Z',
          '2026-05-15T00:00:00.000Z',
        ),
      ],
      status: 'MANUAL',
    }),
    buildInvoice({
      boundaryAt: '2026-05-15T00:00:00.000Z',
      id: 'inv-legacy-final',
      identity: ACME_LEGACY,
      kind: 'FINAL',
      lines: [
        baseLine(
          'inv-legacy-final',
          '2026-05-15T00:00:00.000Z',
          '2026-06-01T00:00:00.000Z',
        ),
      ],
      paidAt: '2026-06-10T00:00:00.000Z',
      status: 'PAID',
    }),
  ];
}

/** The invoice of Acme Legacy that was never settled, which keeps the instance from being deleted. */
export const ACME_LEGACY_OPEN_INVOICE_ID = 'inv-legacy-open';

/**
 * The journal of the calls of Acme Production: 130 reports over the four weeks
 * before `BILLED_NOW`, so that the 30 days the history reads by default hold
 * them all, a hundred to a page. The limit rises at the sixtieth, and the third
 * carries properties.
 */
export function acmeProductionUsageReports(): UsageReport[] {
  const first = Date.parse('2026-09-09T15:00:00.000Z');
  const step = 5 * 60 * 60 * 1000;

  return Array.from({ length: 130 }, (_, index) => {
    const seq = index + 1;
    const reportedAt = new Date(first + index * step);
    const month = reportedAt.getUTCMonth();
    const windowStart = new Date(Date.UTC(2026, month, 1)).toISOString();
    const windowEnd = new Date(Date.UTC(2026, month + 1, 1)).toISOString();

    return buildUsageReport({
      delta: '100',
      entitlementId: API_CALLS_ID,
      limitValue: seq < 60 ? '100000' : '150000',
      overageDelta: '0',
      properties:
        seq === 3 ? { region: 'eu-west-1', source: 'sdk' } : undefined,
      reportSeq: seq,
      reportedAt: reportedAt.toISOString(),
      reportedValue: '100',
      valueAfter: String(seq * 100),
      valueBefore: String((seq - 1) * 100),
      windowEnd,
      windowStart,
    });
  });
}

/** Where the usage the organization keeps begins: 18 months before `BILLED_NOW`, to the day. */
export const RETENTION_START = '2025-04-07T12:00:00.000Z';
