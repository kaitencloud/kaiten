import type {
  Invoice,
  InvoiceHandoff,
  InvoiceLine,
  InvoiceLineDiscount,
  InvoiceLineMetering,
  InvoiceLineOverage,
  ProviderRecord,
  UsageReport,
} from '@/api-client';
import { NULL_OBJECT } from './null-object';

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
 * The members a line of an invoice may not have, all null, for a line a mock or a story
 * composes itself (a preview) and fills in with the few members it does have.
 */
export const NULL_LINE_MEMBERS: Pick<
  InvoiceLine,
  | 'addonId'
  | 'addonPriceId'
  | 'billingModel'
  | 'billingTiming'
  | 'discount'
  | 'entitlementId'
  | 'entitlementSlug'
  | 'instanceAddonId'
  | 'instanceVoucherId'
  | 'licensePriceId'
  | 'metering'
  | 'overage'
  | 'provider'
  | 'unitAmountDecimal'
  | 'voucherId'
> = {
  addonId: null,
  addonPriceId: null,
  billingModel: null,
  billingTiming: null,
  discount: NULL_OBJECT,
  entitlementId: null,
  entitlementSlug: null,
  instanceAddonId: null,
  instanceVoucherId: null,
  licensePriceId: null,
  metering: NULL_OBJECT,
  overage: NULL_OBJECT,
  provider: NULL_OBJECT,
  unitAmountDecimal: null,
  voucherId: null,
};

/**
 * Build a line of an invoice, as the API answers it. The amount is the API's
 * field, so it is given and never worked out from a quantity and a price: a
 * test that wants a line that disagrees with its totals can have one.
 */
export function buildInvoiceLine({
  addonPriceId,
  amount,
  description,
  discount,
  entitlementId,
  entitlementSlug,
  id,
  instanceVoucherId,
  invoiceId,
  label,
  licensePriceId,
  metering,
  overage,
  quantity = '1',
  seq,
  serviceFrom,
  serviceTo,
  type,
  unitAmountDecimal,
  voucherId,
}: {
  /** The add-on price an ADDON line bills. */
  addonPriceId?: string | null;
  amount: number;
  description: string;
  /** How a DISCOUNT line was computed: what it discounts, and the application it is. */
  discount?: InvoiceLineDiscount | null;
  entitlementId?: string | null;
  entitlementSlug?: string | null;
  id?: string;
  /** The redemption a DISCOUNT line applies. */
  instanceVoucherId?: string | null;
  invoiceId: string;
  label: string;
  /** The license price the line bills; a stand-in name when left out. */
  licensePriceId?: string | null;
  metering?: InvoiceLineMetering | null;
  overage?: InvoiceLineOverage | null;
  quantity?: string;
  seq: number;
  serviceFrom: string;
  serviceTo: string;
  type: InvoiceLine['type'];
  unitAmountDecimal?: string | null;
  /** The voucher a DISCOUNT line applies. */
  voucherId?: string | null;
}): InvoiceLine {
  const isDiscount = type === 'DISCOUNT';
  const isMetered = type === 'USAGE' || type === 'OVERAGE';

  // The members a line does not have are null, as the contract has them: a discount
  // has no price of its own, an add-on no license price, a flat fee no metering.
  return {
    addonId: null,
    addonPriceId: type === 'ADDON' ? (addonPriceId ?? null) : null,
    amount,
    billingModel: isDiscount
      ? null
      : type === 'OVERAGE'
        ? 'OVERAGE'
        : type === 'USAGE'
          ? 'USAGE_BASED'
          : 'FLAT_FEE',
    billingTiming: isDiscount ? null : isMetered ? 'ARREARS' : 'ADVANCE',
    description,
    discount: isDiscount ? (discount ?? NULL_OBJECT) : NULL_OBJECT,
    entitlementId: isMetered ? (entitlementId ?? null) : null,
    entitlementSlug: isMetered ? (entitlementSlug ?? null) : null,
    id: id ?? `${invoiceId}-line-${seq}`,
    instanceAddonId: null,
    instanceVoucherId: isDiscount ? (instanceVoucherId ?? null) : null,
    label,
    licensePriceId:
      isDiscount || type === 'ADDON'
        ? null
        : (licensePriceId ?? `price-${type.toLowerCase()}`),
    metering: isMetered ? (metering ?? NULL_OBJECT) : NULL_OBJECT,
    overage: type === 'OVERAGE' ? (overage ?? NULL_OBJECT) : NULL_OBJECT,
    provider: NULL_OBJECT,
    quantity,
    seq,
    serviceFrom,
    serviceTo,
    type,
    unitAmountDecimal: isDiscount ? null : (unitAmountDecimal ?? null),
    voucherId: isDiscount ? (voucherId ?? null) : null,
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
  provider,
  providerKind = provider ? 'STRIPE' : 'NOOP',
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
  /** Null: the invoice has no terms. */
  daysUntilDue?: number | null;
  discountTotal?: number;
  dueAt?: string | null;
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
  paidAt?: string | null;
  /** The invoice in its payment provider; given, the invoice is Stripe's unless it says otherwise. */
  provider?: Invoice['provider'];
  providerKind?: Invoice['providerKind'];
  replacedByInvoiceId?: string | null;
  replacesInvoiceId?: string | null;
  status?: Invoice['status'];
  subtotal?: number;
  total?: number;
  uncollectibleAt?: string | null;
  updatedAt?: string;
  voidReason?: string | null;
  voidedAt?: string | null;
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
      ? null
      : (issuedAt ?? boundaryAt);
  const periodStarts = lines.map((line) => Date.parse(line.serviceFrom));
  const periodEnds = lines.map((line) => Date.parse(line.serviceTo));
  const created = createdAt ?? boundaryAt;

  return {
    billingEmail,
    boundaryAt,
    collectionMethod:
      collectionMethod ??
      (providerKind === 'STRIPE' ? 'CHARGE_AUTOMATICALLY' : 'SEND_INVOICE'),
    createdAt: created,
    currency,
    customerName: identity.customerName,
    customerSlug: identity.customerSlug,
    daysUntilDue: issued ? daysUntilDue : null,
    discountTotal: composedDiscount,
    dueAt: issued
      ? (dueAt ??
        (daysUntilDue === null ? null : addDays(issued, daysUntilDue)))
      : null,
    handoff: {
      claimCount: 0,
      status: 'NOT_REQUIRED',
      ...handoff,
    },
    handoffStatus: handoff?.status ?? 'NOT_REQUIRED',
    hold: hold ?? NULL_OBJECT,
    holdDetail: holdDetail ?? NULL_OBJECT,
    holdReason: holdReason ?? null,
    id,
    instanceName: identity.instanceName,
    instanceSlug: identity.instanceSlug,
    issuedAt: issued,
    kind,
    licenseId: identity.licenseId,
    licenseSlug: identity.licenseSlug,
    lines,
    paidAt: paidAt ?? null,
    provider: provider ?? NULL_OBJECT,
    providerKind,
    replacedByInvoiceId: replacedByInvoiceId ?? null,
    replacesInvoiceId: replacesInvoiceId ?? null,
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
    uncollectibleAt: uncollectibleAt ?? null,
    updatedAt: updatedAt ?? created,
    voidReason: voidReason ?? null,
    voidedAt: voidedAt ?? null,
  };
}

/**
 * Build the record of an invoice in its payment provider, as the API answers it:
 * by default an invoice Stripe holds open, whose amounts it checked against Kaiten's
 * and found the same. `externalInvoiceId` is also what the links to Stripe are made
 * from. A test that wants another state gives what differs.
 */
export function buildProviderRecord({
  externalInvoiceId = 'in_1Qx0',
  externalCustomerId = 'cus_initech',
  pushedAt,
  total,
  ...overrides
}: Partial<ProviderRecord> & {
  /** What Stripe totals the invoice at, excluding tax, for a matched invoice. */
  total?: number;
} = {}): ProviderRecord {
  return {
    externalCustomerId,
    externalInvoiceId,
    hostedInvoiceUrl: `https://invoice.stripe.com/i/acct_1/${externalInvoiceId}`,
    invoiceNumber: `INV-${externalInvoiceId.slice(-4).toUpperCase()}`,
    invoicePdfUrl: `https://pay.stripe.com/invoice/acct_1/${externalInvoiceId}/pdf`,
    pushAttempts: 1,
    pushedAt,
    reconciledAt: pushedAt,
    reconciliationStatus: 'MATCHED',
    status: 'open',
    syncedAt: pushedAt,
    totalExcludingTax: total,
    ...overrides,
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
