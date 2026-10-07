import type { Invoice, UsageReport } from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
  buildUsageReport,
  INITECH_INSTANCE_ID,
  PRO_LICENSE_ID,
  TRACES_ENTITLEMENT_ID,
  type InvoiceIdentity,
} from '../_support/fixtures/build-invoice';

/**
 * The invoices the specs of the billing screens read: what a finance person meets in an
 * organization that sells by usage and hands its invoices to an accounting
 * system. Every date is a fixed day of 2026, so that what a spec reads does not
 * depend on the day it runs; an invoice that must be overdue is long past its
 * due date, and one that must not be is due after today.
 */

export const GLOBEX_IDENTITY: InvoiceIdentity = {
  customerName: 'Globex',
  customerSlug: 'globex',
  instanceName: 'Globex Production',
  instanceSlug: 'globex-prod',
  licenseId: PRO_LICENSE_ID,
  licenseSlug: 'pro-v2',
};

const MARCH = {
  from: '2026-03-01T00:00:00.000Z',
  to: '2026-04-01T00:00:00.000Z',
};
const APRIL = {
  from: '2026-04-01T00:00:00.000Z',
  to: '2026-05-01T00:00:00.000Z',
};

const minutesFromNow = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();
const daysFromNow = (days: number) => minutesFromNow(days * 24 * 60);

/** The five usage reports of the worked example: 172,345 traces, 52,345 above the limit. */
export function tracesReports(): UsageReport[] {
  const common = {
    windowEnd: MARCH.to,
    windowStart: MARCH.from,
  };

  return [
    buildUsageReport({
      ...common,
      delta: '60000',
      limitValue: '100000',
      overageDelta: '0',
      // The one report that was sent with properties, which the journal kept.
      properties: { region: 'eu-west-1', source: 'otel' },
      reportSeq: 41,
      reportedAt: '2026-03-02T10:00:00.000Z',
      reportedValue: '60000',
      valueAfter: '60000',
      valueBefore: '0',
    }),
    buildUsageReport({
      ...common,
      delta: '50000',
      limitValue: '100000',
      overageDelta: '10000',
      reportSeq: 42,
      reportedAt: '2026-03-06T14:30:00.000Z',
      reportedValue: '50000',
      valueAfter: '110000',
      valueBefore: '60000',
    }),
    buildUsageReport({
      ...common,
      delta: '20000',
      limitValue: '100000',
      overageDelta: '20000',
      reportSeq: 43,
      reportedAt: '2026-03-09T08:15:00.000Z',
      reportedValue: '20000',
      valueAfter: '130000',
      valueBefore: '110000',
    }),
    // The boost redeemed on March 10 raises the limit for what follows.
    buildUsageReport({
      ...common,
      delta: '15000',
      limitValue: '150000',
      overageDelta: '0',
      reportSeq: 44,
      reportedAt: '2026-03-15T11:00:00.000Z',
      reportedValue: '15000',
      valueAfter: '145000',
      valueBefore: '130000',
    }),
    buildUsageReport({
      ...common,
      delta: '27345',
      limitValue: '150000',
      overageDelta: '22345',
      reportSeq: 45,
      reportedAt: '2026-03-28T16:45:00.000Z',
      reportedValue: '27345',
      valueAfter: '172345',
      valueBefore: '145000',
    }),
  ];
}

/** The OVERAGE line of the worked example, whose limit changed with a boost. */
const overageLine = (invoiceId: string) =>
  buildInvoiceLine({
    amount: 419,
    description: '0.52345 × $8.00 per 100k traces',
    entitlementId: TRACES_ENTITLEMENT_ID,
    entitlementSlug: 'traces',
    invoiceId,
    label: 'Traces overage',
    metering: {
      ledger: {
        firstSeq: 41,
        instanceId: INITECH_INSTANCE_ID,
        lastSeq: 45,
        rows: 5,
        sumDelta: '172345',
        sumOverage: '52345',
      },
      measuredQuantity: '52345',
      negativeSegmentsFloored: 0,
      saleUnitFactor: '100000',
      windows: 1,
    },
    overage: {
      limits: [
        { limitValue: '100000', overagePercent: 100, rows: 3 },
        { limitValue: '150000', overagePercent: 100, rows: 2 },
      ],
      overageMeasured: '52345',
      usageMeasured: '172345',
    },
    quantity: '0.52345',
    seq: 1,
    serviceFrom: MARCH.from,
    serviceTo: MARCH.to,
    type: 'OVERAGE',
    unitAmountDecimal: '800',
  });

const baseLine = (invoiceId: string, seq: number, period = APRIL) =>
  buildInvoiceLine({
    amount: 2900,
    description: '1 × $29.00 per month',
    invoiceId,
    label: 'Pro, monthly',
    quantity: '1',
    seq,
    serviceFrom: period.from,
    serviceTo: period.to,
    type: 'BASE',
    unitAmountDecimal: '2900',
  });

/**
 * The invoices of the organization:
 * - `inv-m1`: Initech's first, ready to bill and long overdue, claimed once;
 * - `inv-p1`: its renewal, with the usage line of the worked example and a
 *   discount, leased to a consumer for a quarter of an hour;
 * - `inv-h1` and `inv-h2`: renewals held for their usage journal;
 * - `inv-d1` and `inv-d2`: paid and acknowledged under an ERP number;
 * - `inv-u1`: written off;
 * - `inv-v1`: voided and replaced by `inv-r1`;
 * - `inv-v2`: voided, not replaced;
 * - `inv-g1`: Globex's renewal, waiting in the queue and not claimed yet.
 */
export function invoiceSet(): {
  invoices: Invoice[];
  lineReports: Record<string, UsageReport[]>;
} {
  const held = (id: string, createdAt: string) =>
    buildInvoice({
      boundaryAt: '2026-05-01T00:00:00.000Z',
      createdAt,
      hold: { heldAt: createdAt },
      holdDetail: {
        pairs: [
          {
            counterReportSeq: 45,
            entitlementId: TRACES_ENTITLEMENT_ID,
            expected: '42',
            firstSeq: 41,
            found: '43',
            instanceId: INITECH_INSTANCE_ID,
            invariant: 'LEDGER_SEQUENCE_GAP',
            lastSeq: 45,
          },
        ],
      },
      holdReason: 'LEDGER_SEQUENCE_GAP',
      id,
      lines: [overageLine(id), baseLine(id, 2)],
      status: 'DRAFT',
    });

  const invoices: Invoice[] = [
    buildInvoice({
      boundaryAt: MARCH.from,
      createdAt: '2026-03-01T00:00:10.000Z',
      handoff: {
        claimCount: 1,
        leaseId: 'lease-expired',
        leasedUntil: '2026-03-01T01:00:00.000Z',
        status: 'PENDING',
      },
      id: 'inv-m1',
      issuedAt: '2026-03-01T00:00:10.000Z',
      kind: 'ACTIVATION',
      lines: [baseLine('inv-m1', 1, MARCH)],
    }),
    buildInvoice({
      boundaryAt: APRIL.from,
      createdAt: '2026-04-01T00:04:12.000Z',
      daysUntilDue: 14,
      // Due after today, so that it is not overdue whenever a spec runs.
      dueAt: daysFromNow(20),
      handoff: {
        claimCount: 2,
        leaseId: 'lease-live',
        leasedUntil: minutesFromNow(15),
        status: 'PENDING',
      },
      id: 'inv-p1',
      issuedAt: '2026-04-01T00:04:12.000Z',
      lines: [
        overageLine('inv-p1'),
        baseLine('inv-p1', 2),
        buildInvoiceLine({
          amount: -580,
          description: '20% of $29.00',
          invoiceId: 'inv-p1',
          label: 'Welcome −20%',
          seq: 3,
          serviceFrom: APRIL.from,
          serviceTo: APRIL.to,
          type: 'DISCOUNT',
        }),
      ],
    }),
    held('inv-h1', '2026-05-01T00:00:30.000Z'),
    {
      ...held('inv-h2', '2026-05-01T00:00:20.000Z'),
      holdDetail: {
        pairs: [
          {
            counterReportSeq: 45,
            entitlementId: TRACES_ENTITLEMENT_ID,
            expected: '60000',
            firstSeq: 41,
            found: '61000',
            instanceId: INITECH_INSTANCE_ID,
            invariant: 'LEDGER_CHAIN_BREAK',
            lastSeq: 45,
          },
          {
            counterReportSeq: null,
            entitlementId: '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f44',
            expected: '10',
            firstSeq: null,
            found: '12',
            instanceId: INITECH_INSTANCE_ID,
            invariant: 'LEDGER_COUNTER_MISMATCH',
            lastSeq: null,
          },
        ],
      },
      holdReason: 'LEDGER_CHAIN_BREAK',
    },
    buildInvoice({
      boundaryAt: '2026-02-01T00:00:00.000Z',
      createdAt: '2026-02-01T00:00:05.000Z',
      handoff: {
        acknowledgedAt: '2026-02-03T09:00:00.000Z',
        claimCount: 1,
        externalReference: 'ERP-1001',
        status: 'ACKNOWLEDGED',
      },
      id: 'inv-d1',
      issuedAt: '2026-02-01T00:00:05.000Z',
      lines: [
        baseLine('inv-d1', 1, {
          from: '2026-02-01T00:00:00.000Z',
          to: MARCH.from,
        }),
      ],
      paidAt: '2026-02-10T10:00:00.000Z',
      status: 'PAID',
    }),
    buildInvoice({
      boundaryAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:05.000Z',
      handoff: {
        acknowledgedAt: '2026-01-02T09:00:00.000Z',
        claimCount: 3,
        externalReference: 'ERP-0987',
        status: 'ACKNOWLEDGED',
      },
      id: 'inv-d2',
      identity: GLOBEX_IDENTITY,
      issuedAt: '2026-01-01T00:00:05.000Z',
      kind: 'ACTIVATION',
      lines: [
        baseLine('inv-d2', 1, {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
        }),
      ],
      paidAt: '2026-01-15T10:00:00.000Z',
      status: 'PAID',
    }),
    buildInvoice({
      boundaryAt: '2025-12-01T00:00:00.000Z',
      createdAt: '2025-12-01T00:00:05.000Z',
      handoff: {
        acknowledgedAt: '2025-12-03T09:00:00.000Z',
        claimCount: 1,
        status: 'ACKNOWLEDGED',
      },
      id: 'inv-u1',
      identity: GLOBEX_IDENTITY,
      issuedAt: '2025-12-01T00:00:05.000Z',
      lines: [
        baseLine('inv-u1', 1, {
          from: '2025-12-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      ],
      status: 'UNCOLLECTIBLE',
      uncollectibleAt: '2026-01-20T09:00:00.000Z',
    }),
    buildInvoice({
      boundaryAt: '2025-11-01T00:00:00.000Z',
      createdAt: '2025-11-01T00:00:05.000Z',
      id: 'inv-v1',
      issuedAt: '2025-11-01T00:00:05.000Z',
      kind: 'ACTIVATION',
      lines: [
        baseLine('inv-v1', 1, {
          from: '2025-11-01T00:00:00.000Z',
          to: '2025-12-01T00:00:00.000Z',
        }),
      ],
      replacedByInvoiceId: 'inv-r1',
      status: 'VOID',
      voidReason: 'wrong billing e-mail',
      voidedAt: '2025-11-04T09:00:00.000Z',
    }),
    buildInvoice({
      boundaryAt: '2025-11-01T00:00:00.000Z',
      createdAt: '2025-11-04T09:05:00.000Z',
      handoff: { claimCount: 0, status: 'PENDING' },
      id: 'inv-r1',
      issuedAt: '2025-11-04T09:05:00.000Z',
      kind: 'ACTIVATION',
      lines: [
        baseLine('inv-r1', 1, {
          from: '2025-11-01T00:00:00.000Z',
          to: '2025-12-01T00:00:00.000Z',
        }),
      ],
      replacesInvoiceId: 'inv-v1',
    }),
    buildInvoice({
      boundaryAt: '2025-10-01T00:00:00.000Z',
      createdAt: '2025-10-01T00:00:05.000Z',
      id: 'inv-v2',
      issuedAt: '2025-10-01T00:00:05.000Z',
      lines: [
        baseLine('inv-v2', 1, {
          from: '2025-10-01T00:00:00.000Z',
          to: '2025-11-01T00:00:00.000Z',
        }),
      ],
      status: 'VOID',
      voidReason: 'duplicate',
      voidedAt: '2025-10-05T09:00:00.000Z',
    }),
    buildInvoice({
      boundaryAt: APRIL.from,
      createdAt: '2026-04-01T00:05:00.000Z',
      dueAt: daysFromNow(10),
      handoff: { claimCount: 0, status: 'PENDING' },
      id: 'inv-g1',
      identity: GLOBEX_IDENTITY,
      issuedAt: '2026-04-01T00:05:00.000Z',
      lines: [baseLine('inv-g1', 1)],
    }),
  ];

  // The usage behind the usage line of each invoice that has one.
  return {
    invoices,
    lineReports: {
      'inv-h1-line-1': tracesReports(),
      'inv-h2-line-1': tracesReports(),
      'inv-p1-line-1': tracesReports(),
    },
  };
}
