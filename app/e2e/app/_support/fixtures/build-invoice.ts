import type {
  Invoice,
  InvoiceHandoff,
  InvoiceLine,
  InvoiceLineMetering,
  InvoiceLineOverage,
  UsageReport,
} from '@/api-client';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The records the invoices of the mocks refer to. A usage report names them by
 * UUID, as the API does, so they are UUIDs here and not readable slugs.
 */
export const INITECH_INSTANCE_ID = '2f6c8e0a-5d1b-4f43-9f55-3a1c5e0d7b11';
export const TRACES_ENTITLEMENT_ID = '8a1d4c3e-7b52-4a8c-b1f0-6e2d9c4a7f22';
export const PRO_LICENSE_ID = 'c4e7b9a2-1d36-4f58-8b7a-0d5e3f6a9c33';

/** What the identity of an invoice names: as it was when the invoice was composed. */
export type InvoiceIdentity = {
  customerName: string;
  customerSlug: string;
  instanceName: string;
  instanceSlug: string;
  licenseId: string;
  licenseSlug: string;
};

export const INITECH_IDENTITY: InvoiceIdentity = {
  customerName: 'Initech',
  customerSlug: 'initech',
  instanceName: 'Initech Production',
  instanceSlug: 'initech-prod',
  licenseId: PRO_LICENSE_ID,
  licenseSlug: 'pro-v2',
};

const addDays = (instant: string, days: number) =>
  new Date(Date.parse(instant) + days * DAY_MS).toISOString();

/**
 * Build a line of an invoice, as the API answers it. The amount is the API's
 * field, so it is given and never worked out from a quantity and a price: a
 * test that wants a line that disagrees with its totals can have one.
 */
export function buildInvoiceLine({
  amount,
  description,
  entitlementId,
  entitlementSlug,
  id,
  invoiceId,
  label,
  metering,
  overage,
  quantity = '1',
  seq,
  serviceFrom,
  serviceTo,
  type,
  unitAmountDecimal,
}: {
  amount: number;
  description: string;
  entitlementId?: string;
  entitlementSlug?: string;
  id?: string;
  invoiceId: string;
  label: string;
  metering?: InvoiceLineMetering;
  overage?: InvoiceLineOverage;
  quantity?: string;
  seq: number;
  serviceFrom: string;
  serviceTo: string;
  type: InvoiceLine['type'];
  unitAmountDecimal?: string;
}): InvoiceLine {
  const isDiscount = type === 'DISCOUNT';
  const isMetered = type === 'USAGE' || type === 'OVERAGE';

  return {
    amount,
    // A discount has no price of its own, and an add-on no license price: the
    // contract leaves those members out of such a line.
    billingModel: isDiscount
      ? undefined
      : type === 'OVERAGE'
        ? 'OVERAGE'
        : type === 'USAGE'
          ? 'USAGE_BASED'
          : 'FLAT_FEE',
    billingTiming: isDiscount ? undefined : isMetered ? 'ARREARS' : 'ADVANCE',
    description,
    entitlementId: isMetered ? entitlementId : undefined,
    entitlementSlug: isMetered ? entitlementSlug : undefined,
    id: id ?? `${invoiceId}-line-${seq}`,
    label,
    licensePriceId:
      isDiscount || type === 'ADDON'
        ? undefined
        : `price-${type.toLowerCase()}`,
    metering: isMetered ? metering : undefined,
    overage: type === 'OVERAGE' ? overage : undefined,
    quantity,
    seq,
    serviceFrom,
    serviceTo,
    type,
    unitAmountDecimal: isDiscount ? undefined : unitAmountDecimal,
  };
}

/**
 * Build an invoice, as the API answers it. The totals follow the lines unless a
 * test gives its own: the API's totals are fields of its own, and the console
 * shows them as they are.
 */
export function buildInvoice({
  billingEmail = 'ap@initech.test',
  boundaryAt,
  collectionMethod,
  createdAt,
  currency = 'USD',
  daysUntilDue = 30,
  discountTotal,
  dueAt,
  handoff,
  hold,
  holdDetail,
  holdReason,
  id,
  identity = INITECH_IDENTITY,
  issuedAt,
  kind = 'RENEWAL',
  lines,
  paidAt,
  providerKind = 'NOOP',
  replacedByInvoiceId,
  replacesInvoiceId,
  status = 'MANUAL',
  subtotal,
  total,
  uncollectibleAt,
  updatedAt,
  voidReason,
  voidedAt,
}: {
  billingEmail?: string | null;
  boundaryAt: string;
  collectionMethod?: Invoice['collectionMethod'];
  createdAt?: string;
  currency?: string;
  daysUntilDue?: number;
  discountTotal?: number;
  dueAt?: string;
  handoff?: Partial<InvoiceHandoff>;
  hold?: Invoice['hold'];
  holdDetail?: Invoice['holdDetail'];
  holdReason?: Invoice['holdReason'];
  id: string;
  identity?: InvoiceIdentity;
  /** Absent: a DRAFT is not issued, any other status was issued at its boundary. */
  issuedAt?: string | null;
  kind?: Invoice['kind'];
  lines: InvoiceLine[];
  paidAt?: string;
  providerKind?: Invoice['providerKind'];
  replacedByInvoiceId?: string;
  replacesInvoiceId?: string;
  status?: Invoice['status'];
  subtotal?: number;
  total?: number;
  uncollectibleAt?: string;
  updatedAt?: string;
  voidReason?: string;
  voidedAt?: string;
}): Invoice {
  const positives = lines.filter((line) => line.amount > 0);
  const negatives = lines.filter((line) => line.amount < 0);
  const sumOf = (rows: InvoiceLine[]) => {
    let sum = 0;
    for (const row of rows) {
      sum += row.amount;
    }
    return sum;
  };
  const composedSubtotal = subtotal ?? sumOf(positives);
  const composedDiscount = discountTotal ?? -sumOf(negatives);
  const issued =
    issuedAt === null || (issuedAt === undefined && status === 'DRAFT')
      ? undefined
      : (issuedAt ?? boundaryAt);
  const periodStarts = lines.map((line) => Date.parse(line.serviceFrom));
  const periodEnds = lines.map((line) => Date.parse(line.serviceTo));
  const created = createdAt ?? boundaryAt;

  return {
    billingEmail: billingEmail ?? undefined,
    boundaryAt,
    collectionMethod:
      collectionMethod ??
      (providerKind === 'STRIPE' ? 'CHARGE_AUTOMATICALLY' : 'SEND_INVOICE'),
    createdAt: created,
    currency,
    customerName: identity.customerName,
    customerSlug: identity.customerSlug,
    daysUntilDue: issued ? daysUntilDue : undefined,
    discountTotal: composedDiscount,
    dueAt: issued ? (dueAt ?? addDays(issued, daysUntilDue)) : undefined,
    handoff: {
      claimCount: 0,
      status: 'NOT_REQUIRED',
      ...handoff,
    },
    handoffStatus: handoff?.status ?? 'NOT_REQUIRED',
    hold,
    holdDetail,
    holdReason,
    id,
    instanceName: identity.instanceName,
    instanceSlug: identity.instanceSlug,
    issuedAt: issued,
    kind,
    licenseId: identity.licenseId,
    licenseSlug: identity.licenseSlug,
    lines,
    paidAt,
    providerKind,
    replacedByInvoiceId,
    replacesInvoiceId,
    serviceFrom: new Date(
      periodStarts.length > 0
        ? Math.min(...periodStarts)
        : Date.parse(boundaryAt),
    ).toISOString(),
    serviceTo: new Date(
      periodEnds.length > 0 ? Math.max(...periodEnds) : Date.parse(boundaryAt),
    ).toISOString(),
    status,
    subtotal: composedSubtotal,
    total: total ?? composedSubtotal - composedDiscount,
    uncollectibleAt,
    updatedAt: updatedAt ?? created,
    voidReason,
    voidedAt,
  };
}

/**
 * Build one row of the usage journal, as the API answers it. `delta` and
 * `overageDelta` are the API's fields: given, never worked out here.
 */
export function buildUsageReport({
  delta,
  entitlementId = TRACES_ENTITLEMENT_ID,
  instanceId = INITECH_INSTANCE_ID,
  limitValue,
  overageDelta,
  overagePercent = 100,
  properties,
  reportSeq,
  reportedAt,
  reportedValue,
  valueAfter,
  valueBefore,
  windowEnd,
  windowStart,
}: {
  delta: string;
  entitlementId?: string;
  instanceId?: string;
  limitValue?: string;
  overageDelta: string;
  overagePercent?: number;
  /** What the report was sent with, which the API keeps when it was stored. */
  properties?: Record<string, unknown>;
  reportSeq: number;
  reportedAt: string;
  reportedValue: string;
  valueAfter: string;
  valueBefore: string;
  windowEnd: string;
  windowStart: string;
}): UsageReport {
  return {
    aggregationMethod: 'SUM',
    behavior: 'append',
    delta,
    entitlementId,
    eventCountAfter: reportSeq,
    instanceId,
    licenseId: PRO_LICENSE_ID,
    limitValue,
    overageDelta,
    overagePercent: limitValue === undefined ? undefined : overagePercent,
    properties,
    reportSeq,
    reportedAt,
    reportedValue,
    transactionId: `tx-${reportSeq}`,
    valueAfter,
    valueBefore,
    windowEnd,
    windowStart,
  };
}
