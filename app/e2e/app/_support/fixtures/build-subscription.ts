import type { InstanceBilling, InvoicePreview, Price } from '@/api-client';
import { buildPrice } from './build-pricing';

/** The base price the subscriptions of the fixtures are pinned to: $29.00 a month. */
export const PRO_MONTHLY_PRICE: Price = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Pro, monthly',
  id: 'price-pro-monthly',
  isDefault: true,
  unitAmountDecimal: '2900',
});

const PERIOD_MONTHS = {
  ANNUAL: 12,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
} as const;

/** `instant` moved by whole months in UTC, the day kept (the fixtures anchor on days 1 to 28). */
export function addMonths(instant: string, months: number): string {
  const date = new Date(instant);
  date.setUTCMonth(date.getUTCMonth() + months);

  return date.toISOString();
}

/**
 * Build the subscription of an instance, as the API answers it. The effective
 * terms are the organization's (SEND_INVOICE, 30 days) unless an override is
 * given, and the current period is the first one from `anchorAt` unless the
 * test places it.
 */
export function buildSubscription({
  anchorAt,
  basePrice = PRO_MONTHLY_PRICE,
  cancelAtPeriodEnd = false,
  canceledAt,
  cancellationReason,
  currentPeriodEnd,
  currentPeriodStart,
  customerName = 'Initech',
  customerSlug = 'initech',
  daysUntilDueOverride,
  defaultDaysUntilDue = 30,
  id,
  instanceName = 'Initech Production',
  instanceSlug = 'initech-prod',
  pastDueSince,
  startedAt,
  status = 'ACTIVE',
}: {
  anchorAt: string;
  basePrice?: Price;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string;
  cancellationReason?: string;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  customerName?: string;
  customerSlug?: string;
  daysUntilDueOverride?: number;
  /** What the organization's terms say, which the subscription takes when it has none of its own. */
  defaultDaysUntilDue?: number;
  id?: string;
  instanceName?: string;
  instanceSlug?: string;
  pastDueSince?: string;
  startedAt?: string;
  status?: InstanceBilling['status'];
}): InstanceBilling {
  const period = basePrice.billingPeriod ?? 'MONTHLY';
  const start = currentPeriodStart ?? anchorAt;

  return {
    anchorAt,
    basePrice,
    billingPeriod: period,
    cancelAtPeriodEnd,
    canceledAt,
    cancellationReason,
    collectionMethod: 'SEND_INVOICE',
    createdAt: startedAt ?? anchorAt,
    currency: basePrice.currency,
    currentPeriodEnd:
      currentPeriodEnd ?? addMonths(start, PERIOD_MONTHS[period]),
    currentPeriodStart: start,
    customerName,
    customerSlug,
    daysUntilDue: daysUntilDueOverride ?? defaultDaysUntilDue,
    daysUntilDueOverride,
    id: id ?? `sub-${instanceSlug}`,
    instanceName,
    instanceSlug,
    pastDueSince,
    providerKind: 'NOOP',
    startedAt: startedAt ?? anchorAt,
    status,
    updatedAt: startedAt ?? anchorAt,
  };
}

/**
 * Build the upcoming invoice of a subscription, as the API previews it: the
 * lines are the API's, and so are the totals, given here and never worked out.
 * `wouldHold` lists the meters whose journal fails a check.
 */
export function buildUpcomingInvoice({
  asOf,
  boundaryAt,
  currency = 'USD',
  discountTotal = 0,
  kind = 'RENEWAL',
  licenseSlug = 'pro-v2',
  lines,
  serviceFrom,
  serviceTo,
  subtotal,
  total,
  wouldHold = [],
}: {
  asOf: string;
  boundaryAt: string;
  currency?: string;
  discountTotal?: number;
  kind?: InvoicePreview['kind'];
  licenseSlug?: string;
  lines: InvoicePreview['lines'];
  serviceFrom?: string;
  serviceTo?: string;
  subtotal: number;
  total?: number;
  wouldHold?: InvoicePreview['wouldHold'];
}): InvoicePreview {
  return {
    asOf,
    boundaryAt,
    currency,
    discountTotal,
    kind,
    licenseSlug,
    lines,
    serviceFrom,
    serviceTo,
    status: 'PREVIEW',
    subtotal,
    total: total ?? subtotal - discountTotal,
    wouldHold,
  };
}
