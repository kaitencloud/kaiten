import type { Invoice, InvoiceLine } from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
  buildProviderRecord,
} from '../_support/fixtures/build-invoice';
import type { ProviderTruth } from '../_support/model/billing-invoices';
import type { BillingProvidersSeed } from '../_support/model/billing-providers';

/**
 * The invoices Stripe collects, in every state the console shows about one:
 * - `inv-s1`: finalized, open in Stripe, charged to the card on file, amounts the same;
 * - `inv-f1`: its push failed three times (Stripe refuses the customer's tax location);
 * - `inv-rv`: a draft waiting in Stripe for a human to finalize it (review mode);
 * - `inv-mm`: finalized, and Stripe's total is not Kaiten's (an item added there);
 * - `inv-pp`: open as Kaiten last read it, and paid in Stripe since;
 * - `inv-pf`: its automatic charge asks the customer to confirm the payment;
 * - `inv-q1`: composed a minute ago and waiting for the push job.
 * Every date is a fixed day of 2026, so that what a spec reads does not depend on
 * the day it runs.
 */

const APRIL = {
  from: '2026-04-01T00:00:00.000Z',
  to: '2026-05-01T00:00:00.000Z',
};
const ISSUED = '2026-04-01T00:06:00.000Z';

const baseLine = (invoiceId: string, seq = 1): InvoiceLine =>
  buildInvoiceLine({
    amount: 2900,
    description: '1 × $29.00 per month',
    invoiceId,
    label: 'Pro, monthly',
    seq,
    serviceFrom: APRIL.from,
    serviceTo: APRIL.to,
    type: 'BASE',
    unitAmountDecimal: '2900',
  });

/** An invoice Stripe holds open and collects by sending it. */
export const stripeInvoice = (
  id: string,
  overrides: Partial<Parameters<typeof buildInvoice>[0]> = {},
): Invoice =>
  buildInvoice({
    boundaryAt: APRIL.from,
    collectionMethod: 'SEND_INVOICE',
    createdAt: ISSUED,
    id,
    issuedAt: ISSUED,
    lines: [baseLine(id)],
    status: 'PUSHED',
    ...overrides,
  });

export function stripeInvoices(): Invoice[] {
  return [
    stripeInvoice('inv-s1', {
      collectionMethod: 'CHARGE_AUTOMATICALLY',
      provider: buildProviderRecord({
        externalInvoiceId: 'in_s1',
        pushedAt: ISSUED,
        total: 2900,
      }),
    }),
    stripeInvoice('inv-f1', {
      createdAt: '2026-04-01T00:07:00.000Z',
      issuedAt: null,
      provider: {
        externalCustomerId: 'cus_initech',
        lastPushError:
          'customer_tax_location_invalid: the customer address cannot be used to compute tax',
        nextPushAt: '2026-12-01T06:00:00.000Z',
        pushAttempts: 3,
      },
      status: 'PUSH_FAILED',
    }),
    stripeInvoice('inv-rv', {
      createdAt: '2026-04-01T00:08:00.000Z',
      issuedAt: null,
      provider: {
        externalCustomerId: 'cus_initech',
        externalInvoiceId: 'in_123',
        pushAttempts: 1,
        status: 'draft',
      },
      status: 'DRAFT',
    }),
    stripeInvoice('inv-mm', {
      createdAt: '2026-04-01T00:09:00.000Z',
      lines: [
        baseLine('inv-mm'),
        buildInvoiceLine({
          amount: 419,
          description: '5 × $0.838 per seat',
          invoiceId: 'inv-mm',
          label: 'Extra seats',
          seq: 2,
          serviceFrom: APRIL.from,
          serviceTo: APRIL.to,
          type: 'ADDON',
        }),
      ],
      provider: buildProviderRecord({
        externalInvoiceId: 'in_mm',
        pushedAt: ISSUED,
        reconciliationDetail: {
          discounts: [],
          extraDiscounts: [],
          extraInProvider: ['ii_9'],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: {
            kaitenTotal: 3319,
            providerTotalExcludingTax: 3419,
          },
        },
        reconciliationStatus: 'MISMATCH',
        total: 3419,
      }),
    }),
    stripeInvoice('inv-pp', {
      createdAt: '2026-04-01T00:10:00.000Z',
      provider: buildProviderRecord({
        externalInvoiceId: 'in_pp',
        pushedAt: ISSUED,
        total: 2900,
      }),
    }),
    stripeInvoice('inv-pf', {
      collectionMethod: 'CHARGE_AUTOMATICALLY',
      createdAt: '2026-04-01T00:11:00.000Z',
      provider: buildProviderRecord({
        externalInvoiceId: 'in_pf',
        lastPaymentError: 'authentication_required',
        pushedAt: ISSUED,
        total: 2900,
      }),
      status: 'PAYMENT_FAILED',
    }),
    stripeInvoice('inv-q1', {
      createdAt: '2026-04-01T00:12:00.000Z',
      issuedAt: null,
      provider: {
        nextPushAt: '2026-04-01T00:12:00.000Z',
        pushAttempts: 0,
      },
      status: 'DRAFT',
    }),
  ];
}

/** What Stripe says now of an invoice that Kaiten last read open: `inv-pp` was paid on the hosted page. */
export function stripeProviderTruth(): Record<string, ProviderTruth> {
  return { 'inv-pp': 'paid' };
}

/**
 * The customers as Stripe holds them: Initech is registered and has no payment
 * method, Globex has a card that works, Hooli's card expired and Umbrella has
 * never been to Stripe.
 */
export function stripeProvidersSeed(): BillingProvidersSeed {
  return {
    customers: {
      globex: {
        billingEmail: 'billing@globex.test',
        externalCustomerId: 'cus_globex',
        paymentMethod: {
          attachedAt: '2026-02-10T09:00:00.000Z',
          brand: 'visa',
          expMonth: 12,
          expYear: 2030,
          last4: '4242',
          status: 'ACTIVE',
        },
        syncedAt: '2026-04-01T00:00:00.000Z',
      },
      hooli: {
        billingEmail: 'ap@hooli.test',
        externalCustomerId: 'cus_hooli',
        paymentMethod: {
          attachedAt: '2024-05-01T09:00:00.000Z',
          brand: 'mastercard',
          expMonth: 3,
          expYear: 2026,
          last4: '4444',
          status: 'EXPIRED',
        },
      },
      initech: {
        billingEmail: 'ap@initech.test',
        externalCustomerId: 'cus_initech',
      },
      umbrella: { billingEmail: 'ap@umbrella.test' },
    },
    sync: {
      consecutiveFailures: 0,
      lastSyncStatus: 'SUCCESS',
      lastSyncedAt: '2026-04-01T00:00:00.000Z',
    },
  };
}
