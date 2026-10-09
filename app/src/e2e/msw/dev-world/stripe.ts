import type {
  Customer,
  Instance,
  InstanceBilling,
  Invoice,
  License,
} from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
  buildProviderRecord,
} from '../../../../e2e/app/_support/fixtures/build-invoice';
import type { ProviderTruth } from '../../../../e2e/app/_support/model/billing-invoices';
import type { BillingProvidersSeed } from '../../../../e2e/app/_support/model/billing-providers';
import { dayStart, identityOf, monthFrom, type Period } from './billing';
import { daysAgo, minutesAgo } from './dates';

/**
 * What Stripe collects in the world. Acme US pays its Enterprise plan, $250.00 a
 * month, through Stripe, which sends the invoice to the billing e-mail of Acme and
 * lets it pay on a hosted page. Its history is the one a finance person meets: the
 * first invoices were paid, one was paid in Stripe since Kaiten last read it, one
 * was changed in Stripe's dashboard and no longer matches, one could not be pushed
 * because Stripe refuses the address of the customer, and the renewal of this
 * month is held for its usage journal. Globex has a card on file that is about to
 * expire, Acme's failed, and Beta and Gamma have never been to Stripe.
 */

type StripeWorld = {
  customers: Customer[];
  instances: Instance[];
  licenses: License[];
};

const MONTHLY = 25000;

const renewalLine = (invoiceId: string, period: Period) =>
  buildInvoiceLine({
    amount: MONTHLY,
    description: '1 × $250.00 per month',
    invoiceId,
    label: 'Enterprise, monthly',
    seq: 1,
    serviceFrom: period.from,
    serviceTo: period.to,
    type: 'BASE',
    unitAmountDecimal: String(MONTHLY),
  });

const hostedLinks = (externalId: string) => ({
  hostedInvoiceUrl: `https://invoice.stripe.com/i/acct_1/${externalId}`,
  invoicePdfUrl: `https://pay.stripe.com/invoice/acct_1/${externalId}/pdf`,
});

/** The subscription of Acme US, once it collects through Stripe, by sending the invoice. */
export const moveSubscriptionToStripe = (
  subscription: InstanceBilling,
): InstanceBilling => ({
  ...subscription,
  collectionMethod: 'SEND_INVOICE',
  providerKind: 'STRIPE',
});

/** A held draft, once it is Stripe's: it waits for a release, and for the push that follows. */
export const moveInvoiceToStripe = (invoice: Invoice): Invoice => ({
  ...invoice,
  collectionMethod: 'SEND_INVOICE',
  provider: { pushAttempts: 0 },
  providerKind: 'STRIPE',
});

export function createStripeInvoices(world: StripeWorld): {
  invoices: Invoice[];
  providerTruth: Record<string, ProviderTruth>;
} {
  const identity = identityOf(world, 'acme-us');
  // The fields every invoice of a month has, and the month it bills.
  const issue = (id: string, daysBefore: number) => {
    const period = monthFrom(daysBefore);

    return {
      fields: {
        // Stripe sends the invoice to the address Acme gave.
        billingEmail: 'ap@acme.com',
        boundaryAt: period.from,
        collectionMethod: 'SEND_INVOICE' as const,
        createdAt: period.from,
        id,
        identity,
        issuedAt: period.from,
        lines: [renewalLine(id, period)],
      },
      issuedAt: period.from,
    };
  };

  const activation = issue('inv-acme-us-activation', 150);
  const paidEarly = issue('inv-acme-us-renewal-1', 120);
  const mismatched = issue('inv-acme-us-renewal-2', 90);
  const unsynced = issue('inv-acme-us-renewal-3', 60);
  const failed = issue('inv-acme-us-renewal-4', 30);

  const invoices: Invoice[] = [
    buildInvoice({
      ...activation.fields,
      kind: 'ACTIVATION',
      paidAt: daysAgo(145),
      provider: buildProviderRecord({
        ...hostedLinks('in_acme_us_0'),
        externalCustomerId: 'cus_acme',
        externalInvoiceId: 'in_acme_us_0',
        invoiceNumber: 'ACME-0001',
        pushedAt: activation.issuedAt,
        status: 'paid',
        total: MONTHLY,
      }),
      status: 'PAID',
    }),
    buildInvoice({
      ...paidEarly.fields,
      paidAt: daysAgo(112),
      provider: buildProviderRecord({
        ...hostedLinks('in_acme_us_1'),
        externalCustomerId: 'cus_acme',
        externalInvoiceId: 'in_acme_us_1',
        invoiceNumber: 'ACME-0002',
        pushedAt: paidEarly.issuedAt,
        status: 'paid',
        total: MONTHLY,
      }),
      status: 'PAID',
    }),
    // Someone added a coupon of $25.00 to this one in the Stripe dashboard.
    buildInvoice({
      ...mismatched.fields,
      provider: buildProviderRecord({
        ...hostedLinks('in_acme_us_2'),
        externalCustomerId: 'cus_acme',
        externalInvoiceId: 'in_acme_us_2',
        invoiceNumber: 'ACME-0003',
        pushedAt: mismatched.issuedAt,
        reconciledAt: daysAgo(20),
        reconciliationDetail: {
          discounts: [],
          extraDiscounts: [
            { amount: 2500, discountId: 'di_1Qz', externalLineId: 'il_9' },
          ],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: {
            kaitenTotal: MONTHLY,
            providerTotalExcludingTax: MONTHLY - 2500,
          },
        },
        reconciliationStatus: 'MISMATCH',
        total: MONTHLY - 2500,
      }),
      status: 'PUSHED',
    }),
    // Acme paid this one on the hosted page; Kaiten has not read it since.
    buildInvoice({
      ...unsynced.fields,
      provider: buildProviderRecord({
        ...hostedLinks('in_acme_us_3'),
        externalCustomerId: 'cus_acme',
        externalInvoiceId: 'in_acme_us_3',
        invoiceNumber: 'ACME-0004',
        pushedAt: unsynced.issuedAt,
        total: MONTHLY,
      }),
      status: 'PUSHED',
    }),
    // Stripe refuses the address of the customer, and the push has tried six times.
    buildInvoice({
      ...failed.fields,
      issuedAt: null,
      provider: {
        externalCustomerId: 'cus_acme',
        lastPushError:
          'customer_tax_location_invalid: the address of the customer cannot be used to compute tax',
        nextPushAt: dayStart(-1),
        pushAttempts: 6,
      },
      status: 'PUSH_FAILED',
      updatedAt: daysAgo(29),
    }),
  ];

  return {
    invoices,
    providerTruth: { 'inv-acme-us-renewal-3': 'paid' },
  };
}

/** The year and month a card expires in, `months` from now: its last day is when it stops working. */
function expiringIn(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);

  return { expMonth: date.getUTCMonth() + 1, expYear: date.getUTCFullYear() };
}

/** The customers as Stripe holds them, and the pass that mirrors it, which ran minutes ago. */
export function createStripeProviders(): BillingProvidersSeed {
  return {
    customers: {
      'acme-corp': {
        billingEmail: 'ap@acme.com',
        externalCustomerId: 'cus_acme',
        paymentMethod: {
          attachedAt: daysAgo(400),
          brand: 'mastercard',
          ...expiringIn(8),
          last4: '4444',
          status: 'FAILED',
        },
        syncedAt: minutesAgo(4),
      },
      'beta-industries': {},
      'gamma-labs': {},
      globex: {
        billingEmail: 'billing@globex.com',
        externalCustomerId: 'cus_globex',
        paymentMethod: {
          attachedAt: daysAgo(44),
          brand: 'visa',
          ...expiringIn(0),
          last4: '4242',
          status: 'ACTIVE',
        },
        syncedAt: minutesAgo(4),
      },
    },
    sync: {
      consecutiveFailures: 0,
      lastFullSweepAt: minutesAgo(60 * 6),
      lastSyncStatus: 'SUCCESS',
      lastSyncedAt: minutesAgo(4),
    },
  };
}
