import type {
  BillingCapabilities,
  Customer,
  Instance,
  Invoice,
  License,
  UsageReport,
} from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
  buildUsageReport,
  type InvoiceIdentity,
} from '../../../../e2e/app/_support/fixtures/build-invoice';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import { bySlug } from './by-slug';
import { createAgreementDiscountLine } from './vouchers';

/**
 * What the mocked console reads of billing: on, with NoOp as the only provider
 * and the parts of the release the console has screens for: the lifecycle, the
 * trials, the add-ons and the vouchers (docker/config/api.yaml turns billing on). The invoices of
 * the world are attached to its customers, instances and licenses by slug.
 */
export const createBillingCapabilities = (): BillingCapabilities =>
  billingCapabilitiesProfiles.stackWithVouchers();

// A usage report names the records it was made for by UUID. The world refers to
// itself by slug, so the id of a record in a report is derived from it, the same
// each time and distinct for each.
export function uuidFor(seed: string): string {
  const hex = (salt: number) => {
    let hash = 0x811c9dc5 ^ salt;
    for (const char of seed) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };
  const digits = [hex(1), hex(2), hex(3), hex(4)].join('');

  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    `4${digits.slice(13, 16)}`,
    `8${digits.slice(17, 20)}`,
    digits.slice(20, 32),
  ].join('-');
}

type BillingWorld = {
  customers: Customer[];
  instances: Instance[];
  licenses: License[];
};

const identityOf = (
  { customers, instances, licenses }: BillingWorld,
  instanceSlug: string,
): InvoiceIdentity => {
  const instance = bySlug(instances, instanceSlug);
  const customer = bySlug(customers, instance.customerSlug ?? '');
  const license = bySlug(licenses, instance.licenseSlug ?? '');

  return {
    customerName: customer.name,
    customerSlug: customer.slug ?? customer.id,
    instanceName: instance.name,
    instanceSlug,
    licenseId: license.id,
    licenseSlug: license.slug ?? license.id,
  };
};

export type Period = { from: string; to: string };

// Billing periods start at midnight UTC, as a subscription anchored on a day
// does, so that a period reads `Sep 1 – Oct 1, 2026 (UTC)` and not with a time.
export const dayStart = (daysBefore: number, months = 0): string => {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + months,
      now.getUTCDate() - daysBefore,
    ),
  ).toISOString();
};

const daysAgo = (days: number) => dayStart(days);
const daysFromNow = (days: number) => dayStart(-days);

/** A month, from `daysBefore` days ago. */
export const monthFrom = (daysBefore: number): Period => ({
  from: dayStart(daysBefore),
  to: dayStart(daysBefore, 1),
});

const flatFee = (
  invoiceId: string,
  seq: number,
  period: Period,
  label: string,
  amount: number,
  description: string,
) =>
  buildInvoiceLine({
    amount,
    description,
    invoiceId,
    label,
    seq,
    serviceFrom: period.from,
    serviceTo: period.to,
    type: 'BASE',
    unitAmountDecimal: String(amount),
  });

/**
 * The calls an instance made in a period: one report a few days apart, each
 * raising the counter, the way the journal of a metered entitlement reads.
 */
function callsJournal(
  instanceSlug: string,
  licenseId: string,
  period: Period,
  steps: number[],
  limit: number,
  firstSeq: number,
): UsageReport[] {
  const span = Date.parse(period.to) - Date.parse(period.from);
  let before = 0;

  return steps.map((step, index) => {
    const after = before + step;
    const report = buildUsageReport({
      delta: String(step),
      entitlementId: uuidFor('api-calls'),
      instanceId: uuidFor(instanceSlug),
      limitValue: String(limit),
      overageDelta: String(
        Math.max(0, after - limit) - Math.max(0, before - limit),
      ),
      reportSeq: firstSeq + index,
      reportedAt: new Date(
        Date.parse(period.from) +
          Math.round((span * (index + 1)) / (steps.length + 1)),
      ).toISOString(),
      reportedValue: String(step),
      valueAfter: String(after),
      valueBefore: String(before),
      windowEnd: period.to,
      windowStart: period.from,
    });
    before = after;

    return { ...report, licenseId: uuidFor(licenseId) };
  });
}

/**
 * The invoices of the world, one set of stories a finance person meets:
 * Globex Production sells by usage and has an old invoice ready to bill that is
 * long overdue, Globex Staging was invoiced and paid and has a renewal waiting
 * in the handoff queue, Acme US has a renewal held for its usage journal, Acme
 * Production paid its annual fee, and Acme Legacy's invoices were voided,
 * replaced and written off. Dates are measured from now, like the rest of the
 * world.
 */
export function createBillingInvoices(world: BillingWorld): {
  invoices: Invoice[];
  lineReports: Record<string, UsageReport[]>;
} {
  const globexProd = identityOf(world, 'globex-production');
  const globexStaging = identityOf(world, 'globex-staging');
  const acmeProd = identityOf(world, 'acme-production');
  const acmeUs = identityOf(world, 'acme-us');
  const acmeLegacy = identityOf(world, 'acme-legacy');
  const lineReports: Record<string, UsageReport[]> = {};

  // --- Globex Production: $99.00 a month and its calls above the allowance.
  const globexActivationPeriod = monthFrom(40);
  const globexRenewalPeriod = monthFrom(10);
  const globexUsagePeriod = globexActivationPeriod;
  const globexUsageLine = buildInvoiceLine({
    amount: 420,
    description: '4,200 × $0.001 per call',
    entitlementId: uuidFor('api-calls'),
    entitlementSlug: 'api-calls',
    invoiceId: 'inv-globex-production-renewal',
    label: 'API calls, overage',
    metering: {
      ledger: {
        firstSeq: 301,
        instanceId: uuidFor('globex-production'),
        lastSeq: 305,
        rows: 5,
        sumDelta: '104200',
        sumOverage: '4200',
      },
      measuredQuantity: '4200',
      negativeSegmentsFloored: 0,
      saleUnitFactor: '1',
      windows: 1,
    },
    overage: {
      limits: [{ limitValue: '100000', overagePercent: 50, rows: 5 }],
      overageMeasured: '4200',
      usageMeasured: '104200',
    },
    quantity: '4200',
    seq: 1,
    serviceFrom: globexUsagePeriod.from,
    serviceTo: globexUsagePeriod.to,
    type: 'OVERAGE',
    unitAmountDecimal: '0.1',
  });
  lineReports[globexUsageLine.id ?? ''] = callsJournal(
    'globex-production',
    globexProd.licenseId,
    globexUsagePeriod,
    [38_000, 31_500, 12_700, 9_800, 12_200],
    100_000,
    301,
  );

  // --- Globex Staging: $29.00 a month and its calls, at $0.002 each.
  const stagingFirst = monthFrom(38);
  const stagingRenewal = monthFrom(8);
  const stagingUsageLine = buildInvoiceLine({
    amount: 460,
    description: '2,300 × $0.002 per call',
    entitlementId: uuidFor('api-calls'),
    entitlementSlug: 'api-calls',
    invoiceId: 'inv-globex-staging-renewal',
    label: 'API calls',
    metering: {
      ledger: {
        firstSeq: 12,
        instanceId: uuidFor('globex-staging'),
        lastSeq: 14,
        rows: 3,
        sumDelta: '2300',
        sumOverage: null,
      },
      measuredQuantity: '2300',
      negativeSegmentsFloored: 0,
      saleUnitFactor: '1',
      windows: 1,
    },
    quantity: '2300',
    seq: 1,
    serviceFrom: stagingFirst.from,
    serviceTo: stagingFirst.to,
    type: 'USAGE',
    unitAmountDecimal: '0.2',
  });
  lineReports[stagingUsageLine.id ?? ''] = callsJournal(
    'globex-staging',
    globexStaging.licenseId,
    stagingFirst,
    [900, 700, 700],
    -1,
    12,
  );

  // --- Acme US: a renewal held for its usage journal.
  const acmeUsPeriod = monthFrom(30);
  const heldLine = buildInvoiceLine({
    amount: 1250,
    description: '125,000 × $0.01 per call',
    entitlementId: uuidFor('api-calls'),
    entitlementSlug: 'api-calls',
    invoiceId: 'inv-acme-us-held',
    label: 'API calls, overage',
    metering: {
      ledger: {
        firstSeq: 41,
        instanceId: uuidFor('acme-us'),
        lastSeq: 45,
        rows: 5,
        sumDelta: '245400',
        sumOverage: '125000',
      },
      measuredQuantity: '125000',
      negativeSegmentsFloored: 0,
      saleUnitFactor: '1',
      windows: 1,
    },
    overage: {
      limits: [{ limitValue: '120000', overagePercent: 100, rows: 5 }],
      overageMeasured: '125000',
      usageMeasured: '245400',
    },
    quantity: '125000',
    seq: 1,
    serviceFrom: acmeUsPeriod.from,
    serviceTo: acmeUsPeriod.to,
    type: 'OVERAGE',
    unitAmountDecimal: '1',
  });
  lineReports[heldLine.id ?? ''] = callsJournal(
    'acme-us',
    acmeUs.licenseId,
    acmeUsPeriod,
    [80_000, 60_000, 45_400, 30_000, 30_000],
    120_000,
    41,
  );

  const invoices: Invoice[] = [
    buildInvoice({
      boundaryAt: globexActivationPeriod.from,
      createdAt: globexActivationPeriod.from,
      handoff: {
        claimCount: 1,
        leaseId: 'lease-1',
        leasedUntil: daysAgo(39),
        status: 'PENDING',
      },
      id: 'inv-globex-production-activation',
      identity: globexProd,
      issuedAt: globexActivationPeriod.from,
      kind: 'ACTIVATION',
      lines: [
        flatFee(
          'inv-globex-production-activation',
          1,
          globexActivationPeriod,
          'Business, monthly',
          9900,
          '1 × $99.00 per month',
        ),
      ],
    }),
    buildInvoice({
      boundaryAt: globexRenewalPeriod.from,
      createdAt: globexRenewalPeriod.from,
      handoff: { claimCount: 0, status: 'PENDING' },
      id: 'inv-globex-production-renewal',
      identity: globexProd,
      issuedAt: globexRenewalPeriod.from,
      lines: [
        globexUsageLine,
        flatFee(
          'inv-globex-production-renewal',
          2,
          globexRenewalPeriod,
          'Business, monthly',
          9900,
          '1 × $99.00 per month',
        ),
      ],
    }),
    buildInvoice({
      boundaryAt: stagingFirst.from,
      createdAt: stagingFirst.from,
      handoff: {
        acknowledgedAt: daysAgo(36),
        claimCount: 1,
        externalReference: 'ERP-2044',
        status: 'ACKNOWLEDGED',
      },
      id: 'inv-globex-staging-activation',
      identity: globexStaging,
      issuedAt: stagingFirst.from,
      kind: 'ACTIVATION',
      lines: [
        flatFee(
          'inv-globex-staging-activation',
          1,
          stagingFirst,
          'Starter, monthly',
          2900,
          '1 × $29.00 per month',
        ),
      ],
      paidAt: daysAgo(30),
      status: 'PAID',
    }),
    buildInvoice({
      boundaryAt: stagingRenewal.from,
      createdAt: stagingRenewal.from,
      handoff: { claimCount: 0, status: 'PENDING' },
      id: 'inv-globex-staging-renewal',
      identity: globexStaging,
      issuedAt: stagingRenewal.from,
      lines: [
        stagingUsageLine,
        flatFee(
          'inv-globex-staging-renewal',
          2,
          stagingRenewal,
          'Starter, monthly',
          2900,
          '1 × $29.00 per month',
        ),
      ],
    }),
    buildInvoice({
      boundaryAt: acmeUsPeriod.to,
      createdAt: daysAgo(1),
      hold: { heldAt: daysAgo(1) },
      holdDetail: {
        pairs: [
          {
            counterReportSeq: 45,
            entitlementId: uuidFor('api-calls'),
            expected: '42',
            firstSeq: 41,
            found: '43',
            instanceId: uuidFor('acme-us'),
            invariant: 'LEDGER_SEQUENCE_GAP',
            lastSeq: 45,
          },
        ],
      },
      holdReason: 'LEDGER_SEQUENCE_GAP',
      id: 'inv-acme-us-held',
      identity: acmeUs,
      lines: [
        heldLine,
        flatFee(
          'inv-acme-us-held',
          2,
          monthFrom(0),
          'Enterprise, monthly',
          25000,
          '1 × $250.00 per month',
        ),
      ],
      status: 'DRAFT',
    }),
    buildInvoice({
      boundaryAt: daysAgo(180),
      createdAt: daysAgo(180),
      currency: 'USD',
      daysUntilDue: 45,
      handoff: {
        acknowledgedAt: daysAgo(175),
        claimCount: 2,
        externalReference: 'ERP-1001',
        status: 'ACKNOWLEDGED',
      },
      id: 'inv-acme-production-activation',
      identity: acmeProd,
      issuedAt: daysAgo(180),
      kind: 'ACTIVATION',
      lines: [
        buildInvoiceLine({
          amount: 4800000,
          description: '1 × $48,000.00 per year',
          invoiceId: 'inv-acme-production-activation',
          label: 'Enterprise, annual',
          seq: 1,
          serviceFrom: daysAgo(180),
          serviceTo: daysFromNow(185),
          type: 'BASE',
          unitAmountDecimal: '4800000',
        }),
        // The agreement of Acme took a tenth off the base price of its first year.
        createAgreementDiscountLine(
          'inv-acme-production-activation',
          2,
          daysAgo(180),
          daysFromNow(185),
        ),
      ],
      paidAt: daysAgo(160),
      status: 'PAID',
    }),
    buildInvoice({
      boundaryAt: daysAgo(150),
      createdAt: daysAgo(150),
      id: 'inv-acme-legacy-voided',
      identity: acmeLegacy,
      issuedAt: daysAgo(150),
      lines: [
        flatFee(
          'inv-acme-legacy-voided',
          1,
          monthFrom(150),
          'Enterprise, monthly',
          25000,
          '1 × $250.00 per month',
        ),
      ],
      replacedByInvoiceId: 'inv-acme-legacy-replacement',
      status: 'VOID',
      voidReason: 'The invoice went to a former billing contact',
      voidedAt: daysAgo(148),
    }),
    buildInvoice({
      boundaryAt: daysAgo(150),
      createdAt: daysAgo(148),
      handoff: {
        claimCount: 1,
        leaseId: 'lease-2',
        leasedUntil: daysAgo(147),
        status: 'PENDING',
      },
      id: 'inv-acme-legacy-replacement',
      identity: acmeLegacy,
      issuedAt: daysAgo(148),
      lines: [
        flatFee(
          'inv-acme-legacy-replacement',
          1,
          monthFrom(150),
          'Enterprise, monthly',
          25000,
          '1 × $250.00 per month',
        ),
      ],
      replacesInvoiceId: 'inv-acme-legacy-voided',
    }),
    buildInvoice({
      boundaryAt: daysAgo(120),
      createdAt: daysAgo(120),
      handoff: {
        acknowledgedAt: daysAgo(118),
        claimCount: 1,
        externalReference: 'ERP-1090',
        status: 'ACKNOWLEDGED',
      },
      id: 'inv-acme-legacy-written-off',
      identity: acmeLegacy,
      issuedAt: daysAgo(120),
      lines: [
        flatFee(
          'inv-acme-legacy-written-off',
          1,
          monthFrom(120),
          'Enterprise, monthly',
          25000,
          '1 × $250.00 per month',
        ),
      ],
      status: 'UNCOLLECTIBLE',
      uncollectibleAt: daysAgo(30),
    }),
  ];

  return { invoices, lineReports };
}
