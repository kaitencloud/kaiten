import type { Invoice } from '@/api-client';
import {
  buildInvoice,
  buildInvoiceLine,
  type InvoiceIdentity,
} from '../_support/fixtures/build-invoice';
import { createVouchersBillingModel } from './vouchers.scenarios';

/**
 * Two invoices of Hooli Starter, issued in the months before the page is read: the one
 * of August has nothing taken off, and the one of September has a discount that comes
 * in dollars off two of its lines and has no end, on its fourth invoice. They sit beside
 * the invoices a subscription and the next boundary compose, which the mocks make from
 * the redemptions of the world.
 */

const HOOLI_STARTER: InvoiceIdentity = {
  customerName: 'Hooli',
  customerSlug: 'hooli',
  instanceName: 'Hooli Starter',
  instanceSlug: 'hooli-starter',
  licenseId: 'd1f8a3b6-2c47-4e91-a5d0-7b9e1c3f6a44',
  licenseSlug: 'starter-v1',
};

const AUGUST = {
  from: '2026-08-07T12:00:00.000Z',
  to: '2026-09-07T12:00:00.000Z',
};
const SEPTEMBER = {
  from: '2026-09-07T12:00:00.000Z',
  to: '2026-10-07T12:00:00.000Z',
};

const baseAndSeats = (invoiceId: string, period: typeof AUGUST) => [
  buildInvoiceLine({
    amount: 4000,
    description: '1 × 4000 per monthly',
    invoiceId,
    label: 'Starter, monthly',
    seq: 1,
    serviceFrom: period.from,
    serviceTo: period.to,
    type: 'BASE',
    unitAmountDecimal: '4000',
  }),
  buildInvoiceLine({
    amount: 1000,
    description: '2 × 500 per monthly',
    invoiceId,
    label: 'Extra seats · 2026',
    quantity: '2',
    seq: 2,
    serviceFrom: period.from,
    serviceTo: period.to,
    type: 'ADDON',
    unitAmountDecimal: '500',
  }),
];

const INVOICES: Invoice[] = [
  buildInvoice({
    boundaryAt: AUGUST.from,
    id: 'inv-hooli-plain',
    identity: HOOLI_STARTER,
    lines: baseAndSeats('inv-hooli-plain', AUGUST),
  }),
  buildInvoice({
    boundaryAt: SEPTEMBER.from,
    id: 'inv-hooli-credit',
    identity: HOOLI_STARTER,
    lines: [
      ...baseAndSeats('inv-hooli-credit', SEPTEMBER),
      buildInvoiceLine({
        amount: -1500,
        description: '1500 off 5000',
        discount: {
          allocations: [
            { amount: 1200, targetSeq: 1 },
            { amount: 300, targetSeq: 2 },
          ],
          application: 4,
          applicationsMax: null,
          appliesTo: 'BOTH',
          base: '5000',
          currency: 'USD',
          discountType: 'FIXED_AMOUNT',
          discountValue: '1500',
          targetSeqs: [1, 2],
        },
        instanceVoucherId: 'redemption-hooli-credit',
        invoiceId: 'inv-hooli-credit',
        label: 'Hooli agreement',
        seq: 3,
        serviceFrom: SEPTEMBER.from,
        serviceTo: SEPTEMBER.to,
        type: 'DISCOUNT',
        voucherId: 'voucher-hooli-agreement',
      }),
    ],
  }),
];

/** The billing of the vouchers world with the two invoices of Hooli Starter issued. */
export function createVouchersInvoicesModel() {
  return createVouchersBillingModel({ invoices: INVOICES });
}
