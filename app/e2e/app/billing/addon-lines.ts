import type { InstanceAddon, Invoice, UsageReport } from '@/api-client';
import { buildInstanceAddon } from '../_support/fixtures/build-addon';
import {
  buildInvoice,
  buildInvoiceLine,
  buildUsageReport,
} from '../_support/fixtures/build-invoice';
import { buildPrice } from '../_support/fixtures/build-pricing';
import { ACME_PRODUCTION } from './billed-instances';

/**
 * What the add-ons of an instance put on its invoices, on Acme
 * Production, whose periods end on the 15th and which the specs freeze on
 * October 7th, 2026:
 *
 * - Extra seats, three of them, a fee in advance, held since August 20th;
 * - Extra tokens, which sells usage only, attached on August 28th, in the middle of
 *   the first period: the usage it rated is billed over the window it was held;
 * - the Priority pack, a fee in arrears, removed on September 10th, before the
 *   boundary of the 15th, and billed in full all the same;
 * - the Onboarding pack, the same kind of fee, attached on September 20th and
 *   removed on October 3rd, which the next invoice bills.
 *
 * The invoice of September 15th is the one that carried the first three.
 */

export const ADDON_INVOICE_ID = 'inv-acme-addons';
export const AI_USAGE_ENTITLEMENT_ID = '8a1d4c3e-7b52-4a8c-b1f0-6e2d9c4a7f44';
const ACME_PRODUCTION_UUID = '2f6c8e0a-5d1b-4f43-9f55-3a1c5e0d7b22';

const BOUNDARY = '2026-09-15T00:00:00.000Z';
const NEXT_BOUNDARY = '2026-10-15T00:00:00.000Z';
export const PRIORITY_PACK_REMOVED_AT = '2026-09-10T09:30:00.000Z';
export const ONBOARDING_PACK_REMOVED_AT = '2026-10-03T08:00:00.000Z';

const SEATS = {
  familySlug: 'extra-seats',
  id: 'addon-extra-seats',
  maxQuantity: null,
  name: 'Extra seats',
  slug: 'extra-seats',
};
const TOKENS = {
  familySlug: 'extra-tokens',
  id: 'addon-extra-tokens',
  maxQuantity: null,
  name: 'Extra tokens',
  slug: 'extra-tokens',
};
const PRIORITY_PACK = {
  familySlug: 'priority-pack',
  id: 'addon-priority-pack',
  maxQuantity: null,
  name: 'Priority pack',
  slug: 'priority-pack',
};
const ONBOARDING_PACK = {
  familySlug: 'onboarding-pack',
  id: 'addon-onboarding-pack',
  maxQuantity: null,
  name: 'Onboarding pack',
  slug: 'onboarding-pack',
};

const SEATS_FEE = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seats × 3',
  id: 'addon-price-seats',
  isDefault: true,
  unitAmountDecimal: '1000',
});
const TOKENS_USAGE = buildPrice({
  billingModel: 'USAGE_BASED',
  displayLabel: 'Tokens',
  id: 'addon-price-tokens',
  metered: {
    entitlementSlug: 'tokens',
    saleUnitFactor: '1000000',
    saleUnitSingular: '1M tokens',
    saleUnitPlural: null,
  },
  unitAmountDecimal: '200',
});
const PRIORITY_FEE = buildPrice({
  billingPeriod: 'MONTHLY',
  billingTiming: 'ARREARS',
  displayLabel: 'Priority pack × 1',
  id: 'addon-price-priority',
  isDefault: true,
  unitAmountDecimal: '5000',
});
const ONBOARDING_FEE = buildPrice({
  billingPeriod: 'MONTHLY',
  billingTiming: 'ARREARS',
  displayLabel: 'Onboarding pack × 1',
  id: 'addon-price-onboarding',
  isDefault: true,
  unitAmountDecimal: '2000',
});

/** What Acme Production has held, in the order it attached them, the removed ones included. */
export function acmeProductionAttachments(): InstanceAddon[] {
  return [
    buildInstanceAddon({
      addon: SEATS,
      attachedAt: '2026-08-20T00:00:00.000Z',
      id: 'attachment-extra-seats',
      prices: [SEATS_FEE],
      quantity: 3,
    }),
    buildInstanceAddon({
      addon: PRIORITY_PACK,
      attachedAt: '2026-08-20T00:00:00.000Z',
      id: 'attachment-priority-pack',
      prices: [PRIORITY_FEE],
      removedAt: PRIORITY_PACK_REMOVED_AT,
    }),
    buildInstanceAddon({
      addon: TOKENS,
      attachedAt: '2026-08-28T00:00:00.000Z',
      id: 'attachment-extra-tokens',
      prices: [TOKENS_USAGE],
    }),
    buildInstanceAddon({
      addon: ONBOARDING_PACK,
      attachedAt: '2026-09-20T00:00:00.000Z',
      id: 'attachment-onboarding-pack',
      prices: [ONBOARDING_FEE],
      removedAt: ONBOARDING_PACK_REMOVED_AT,
    }),
  ];
}

/**
 * The usage the tokens line was measured from: three reports across the two calendar
 * months the window of the line spans (August 28th to September 15th), 1.5M in August
 * and 2.7M in September.
 */
export function tokensReports(): UsageReport[] {
  const august = {
    windowEnd: '2026-09-01T00:00:00.000Z',
    windowStart: '2026-08-01T00:00:00.000Z',
  };
  const september = {
    windowEnd: '2026-10-01T00:00:00.000Z',
    windowStart: '2026-09-01T00:00:00.000Z',
  };
  const report = (
    seq: number,
    reportedAt: string,
    before: number,
    delta: number,
    window: typeof august,
  ) =>
    buildUsageReport({
      ...window,
      delta: String(delta),
      entitlementId: AI_USAGE_ENTITLEMENT_ID,
      instanceId: ACME_PRODUCTION_UUID,
      overageDelta: '0',
      reportSeq: seq,
      reportedAt,
      reportedValue: String(delta),
      valueAfter: String(before + delta),
      valueBefore: String(before),
    });

  return [
    report(11, '2026-08-30T10:00:00.000Z', 0, 1_500_000, august),
    report(12, '2026-09-02T14:00:00.000Z', 0, 1_400_000, september),
    report(13, '2026-09-10T09:00:00.000Z', 1_400_000, 1_300_000, september),
  ];
}

/**
 * The RENEWAL of September 15th: the fee of the Priority pack, removed on the 10th and
 * billed in full for the window it was held; the tokens Extra tokens rated since the
 * 28th, which have no license price; the base fee and the seats of the period that
 * starts; and a discount of the add-ons, which bears on all three lines of an add-on.
 */
export function addonRenewalInvoice(): Invoice {
  const id = ADDON_INVOICE_ID;

  return buildInvoice({
    boundaryAt: BOUNDARY,
    handoff: { claimCount: 0, status: 'PENDING' },
    id,
    identity: ACME_PRODUCTION,
    lines: [
      buildInvoiceLine({
        addonId: PRIORITY_PACK.id,
        addonPriceId: PRIORITY_FEE.id,
        amount: 5000,
        billingTiming: 'ARREARS',
        description:
          '1 × $50.00 per month, in full: the add-on was removed before the boundary',
        instanceAddonId: 'attachment-priority-pack',
        invoiceId: id,
        label: 'Priority pack × 1',
        seq: 1,
        serviceFrom: '2026-08-20T00:00:00.000Z',
        serviceTo: PRIORITY_PACK_REMOVED_AT,
        type: 'ADDON',
        unitAmountDecimal: '5000',
      }),
      buildInvoiceLine({
        addonId: TOKENS.id,
        addonPriceId: TOKENS_USAGE.id,
        amount: 840,
        description: '4.2 × $2.00 (per 1M tokens)',
        entitlementId: AI_USAGE_ENTITLEMENT_ID,
        entitlementSlug: 'tokens',
        instanceAddonId: 'attachment-extra-tokens',
        invoiceId: id,
        label: 'Tokens',
        metering: {
          ledger: {
            firstSeq: 11,
            instanceId: ACME_PRODUCTION_UUID,
            lastSeq: 13,
            rows: 3,
            sumDelta: '4200000',
            sumOverage: null,
          },
          measuredQuantity: '4200000',
          negativeSegmentsFloored: 0,
          saleUnitFactor: '1000000',
          windows: 2,
        },
        quantity: '4.2',
        seq: 2,
        serviceFrom: '2026-08-28T00:00:00.000Z',
        serviceTo: BOUNDARY,
        type: 'USAGE',
        unitAmountDecimal: '200',
      }),
      buildInvoiceLine({
        amount: 49900,
        description: '1 × $499.00 per month',
        invoiceId: id,
        label: 'Enterprise, monthly',
        seq: 3,
        serviceFrom: BOUNDARY,
        serviceTo: NEXT_BOUNDARY,
        type: 'BASE',
        unitAmountDecimal: '49900',
      }),
      buildInvoiceLine({
        addonId: SEATS.id,
        addonPriceId: SEATS_FEE.id,
        amount: 3000,
        description: '3 × $10.00 per month',
        instanceAddonId: 'attachment-extra-seats',
        invoiceId: id,
        label: 'Extra seats × 3',
        quantity: '3',
        seq: 4,
        serviceFrom: BOUNDARY,
        serviceTo: NEXT_BOUNDARY,
        type: 'ADDON',
        unitAmountDecimal: '1000',
      }),
      buildInvoiceLine({
        amount: -884,
        description: 'ADDONS −10%',
        discount: {
          allocations: [
            { amount: 500, targetSeq: 1 },
            { amount: 84, targetSeq: 2 },
            { amount: 300, targetSeq: 4 },
          ],
          application: 1,
          applicationsMax: 3,
          appliesTo: 'ADDONS',
          base: '8840',
          currency: null,
          discountType: 'PERCENTAGE',
          discountValue: '10',
          targetSeqs: [1, 2, 4],
        },
        invoiceId: id,
        label: 'ADDONS −10%',
        seq: 5,
        serviceFrom: '2026-08-20T00:00:00.000Z',
        serviceTo: NEXT_BOUNDARY,
        type: 'DISCOUNT',
      }),
    ],
    status: 'MANUAL',
  });
}

/** The line reports behind the tokens line of the invoice, by line id. */
export const addonLineReports = (): Record<string, UsageReport[]> => ({
  [`${ADDON_INVOICE_ID}-line-2`]: tokensReports(),
});
