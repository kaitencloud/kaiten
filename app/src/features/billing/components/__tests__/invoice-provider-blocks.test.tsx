import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { Invoice, Reconciliation } from '@/api-client';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import {
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import {
  buildInvoice,
  buildInvoiceLine,
  buildProviderRecord,
} from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { InvoiceProviderCard } from '../invoice-detail/invoice-provider-card';
import { InvoiceProviderAlerts } from '../invoice-detail/provider-alerts';
import { ReconciliationCard } from '../invoice-detail/reconciliation-card';

useBillingTexts();

const LINE = buildInvoiceLine({
  amount: 2900,
  description: '1 × $29.00 per month',
  invoiceId: 'inv-1',
  label: 'Pro, monthly',
  seq: 1,
  serviceFrom: '2027-03-01T00:00:00.000Z',
  serviceTo: '2027-04-01T00:00:00.000Z',
  type: 'BASE',
});

const stripeInvoice = (overrides: Partial<Parameters<typeof buildInvoice>[0]> = {}): Invoice =>
  buildInvoice({
    boundaryAt: '2027-03-01T00:00:00.000Z',
    collectionMethod: 'SEND_INVOICE',
    id: 'inv-1',
    lines: [LINE],
    provider: buildProviderRecord({
      pushedAt: '2027-03-01T00:06:00.000Z',
      total: 2900,
    }),
    status: 'PUSHED',
    ...overrides,
  });

const noopInvoice = () =>
  buildInvoice({
    boundaryAt: '2027-03-01T00:00:00.000Z',
    id: 'inv-2',
    lines: [LINE],
    status: 'MANUAL',
  });

describe('where an invoice stands in Stripe', () => {
  it('shows the record of Stripe as the API mirrors it', () => {
    render(<InvoiceProviderCard invoice={stripeInvoice()} />);

    const card = screen.getByTestId('invoice-provider');
    expect(card).toHaveTextContent('Payment provider');
    expect(card).toHaveTextContent(
      'Stripe sends the invoice to the customer and collects the payment.',
    );
    expect(within(card).getByText('Open')).toHaveAttribute(
      'data-provider-status',
      'open',
    );
    expect(card).toHaveTextContent('INV-1QX0');
    expect(card).toHaveTextContent('in_1Qx0');
    expect(card).toHaveTextContent('cus_initech');
    expect(card).toHaveTextContent('Pushed');
    expect(card).toHaveTextContent('Last read from Stripe');
    expect(within(card).getByText('Match')).toHaveAttribute(
      'data-reconciliation',
      'MATCHED',
    );
  });

  it('says how Stripe collects, for each way it can', () => {
    render(
      <InvoiceProviderCard
        invoice={stripeInvoice({ collectionMethod: 'CHARGE_AUTOMATICALLY' })}
      />,
    );

    expect(screen.getByTestId('invoice-provider')).toHaveTextContent(
      'Stripe charges the payment method on file when the invoice is due.',
    );
  });

  it('links to the invoice Stripe hosts and to its PDF, in tabs that cannot reach the console', () => {
    render(<InvoiceProviderCard invoice={stripeInvoice()} />);

    const hosted = screen.getByRole('link', { name: 'Hosted invoice' });
    expect(hosted).toHaveAttribute(
      'href',
      'https://invoice.stripe.com/i/acct_1/in_1Qx0',
    );
    expect(hosted).toHaveAttribute('target', '_blank');
    expect(hosted).toHaveAttribute('rel', 'noopener noreferrer');
    const pdf = screen.getByRole('link', { name: 'PDF' });
    expect(pdf).toHaveAttribute(
      'href',
      'https://pay.stripe.com/invoice/acct_1/in_1Qx0/pdf',
    );
    expect(pdf).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('leaves out a link whose address is not https, and the whole row when neither is', () => {
    const { rerender } = render(
      <InvoiceProviderCard
        invoice={stripeInvoice({
          provider: buildProviderRecord({
            hostedInvoiceUrl: 'javascript:alert(1)',
            invoicePdfUrl: 'https://pay.stripe.com/invoice/in_1/pdf',
          }),
        })}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Hosted invoice' })).toBeNull();
    expect(screen.getByRole('link', { name: 'PDF' })).toBeInTheDocument();

    rerender(
      <InvoiceProviderCard
        invoice={stripeInvoice({
          provider: buildProviderRecord({
            hostedInvoiceUrl: 'http://invoice.stripe.com/i/in_1',
            invoicePdfUrl: undefined,
          }),
        })}
      />,
    );
    expect(screen.queryByTestId('invoice-provider-links')).toBeNull();
  });

  it('says Stripe does not have the invoice yet when the push has not created it', () => {
    render(
      <InvoiceProviderCard
        invoice={stripeInvoice({ provider: undefined, providerKind: 'STRIPE', status: 'DRAFT' })}
      />,
    );

    expect(screen.getByTestId('invoice-provider')).toHaveTextContent(
      'Stripe does not have this invoice yet.',
    );
    expect(screen.queryByTestId('invoice-provider-links')).toBeNull();
  });

  it('says so as well, with what the record has, when the push is queued or failed and no invoice exists in Stripe', () => {
    render(
      <InvoiceProviderCard
        invoice={stripeInvoice({
          provider: {
            externalCustomerId: 'cus_initech',
            nextPushAt: '2027-03-01T00:12:00.000Z',
            pushAttempts: 2,
          },
          status: 'PUSH_FAILED',
        })}
      />,
    );

    const card = screen.getByTestId('invoice-provider');
    expect(card).toHaveTextContent('Stripe does not have this invoice yet.');
    expect(card).toHaveTextContent('cus_initech');
    expect(screen.queryByTestId('invoice-provider-links')).toBeNull();
  });

  it('shows no card, no alert and no reconciliation for an invoice nobody collects through a provider', () => {
    const invoice = noopInvoice();
    render(
      <>
        <InvoiceProviderCard invoice={invoice} />
        <InvoiceProviderAlerts invoice={invoice} phase="idle" />
        <ReconciliationCard invoice={invoice} />
      </>,
    );

    expect(screen.queryByTestId('invoice-provider')).toBeNull();
    expect(screen.queryByTestId('invoice-push-error')).toBeNull();
    expect(screen.queryByTestId('reconciliation')).toBeNull();
  });
});

const EMPTY_DETAIL: Reconciliation = {
  discounts: [],
  extraDiscounts: [],
  extraInProvider: [],
  inclusiveTax: false,
  lines: [],
  missingInProvider: [],
  totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3319 },
};

describe('how the amounts of Kaiten and Stripe compare', () => {
  const mismatched = (detail: Reconciliation) =>
    stripeInvoice({
      provider: buildProviderRecord({
        reconciledAt: '2027-03-02T00:00:00.000Z',
        reconciliationDetail: detail,
        reconciliationStatus: 'MISMATCH',
      }),
    });

  it('says Kaiten is authoritative, and does not send a person to settle the difference in Stripe', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [],
          extraInProvider: ['ii_9'],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3319 },
        })}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('Kaiten is authoritative');
    expect(card).toHaveTextContent('the invoice is voided and composed again');
    expect(card).not.toHaveTextContent('settle the difference there');
    // Sent to the customer, it is not charged by Kaiten: nothing is said about a charge.
    expect(card).not.toHaveTextContent('Nothing is charged');
    expect(within(card).queryByRole('link')).toBeNull();
  });

  it('says the charge waits for a match when Stripe is to charge the invoice itself', () => {
    render(
      <ReconciliationCard
        invoice={{
          ...mismatched({
            discounts: [],
            extraDiscounts: [],
            extraInProvider: [],
            inclusiveTax: false,
            lines: [],
            missingInProvider: [],
            totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3319 },
          }),
          collectionMethod: 'CHARGE_AUTOMATICALLY',
        }}
      />,
    );

    expect(screen.getByTestId('reconciliation')).toHaveTextContent(
      'Nothing is charged until Stripe matches Kaiten.',
    );
  });

  it('says a void invoice was voided since, with nothing left to do', () => {
    render(
      <ReconciliationCard
        invoice={{ ...mismatched({ ...EMPTY_DETAIL }), status: 'VOID' }}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('It has been voided since.');
    expect(card).not.toHaveTextContent('composed again');
  });

  it('says they match in a line, with nothing to compare', () => {
    render(<ReconciliationCard invoice={stripeInvoice()} />);

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('Stripe holds the same amounts as Kaiten.');
    expect(card).toHaveTextContent('Match');
    expect(within(card).queryByRole('table')).toBeNull();
  });

  it('is absent for an invoice Stripe has not reconciled', () => {
    render(
      <ReconciliationCard
        invoice={stripeInvoice({
          provider: buildProviderRecord({
            reconciliationStatus: undefined,
          }),
        })}
      />,
    );

    expect(screen.queryByTestId('reconciliation')).toBeNull();
  });

  it('puts the two totals side by side when they differ', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3419 },
        })}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('Differ');
    expect(card).toHaveTextContent('Total composed by Kaiten');
    expect(card).toHaveTextContent('$29.00');
    expect(card).toHaveTextContent('Total in Stripe, excluding tax');
    expect(card).toHaveTextContent('$34.19');
  });

  it('lists the lines whose amount differs, with the amount each side holds', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [
            {
              externalLineId: 'il_1',
              kaitenAmount: 2900,
              lineId: 'inv-1-line-1',
              providerAmount: 2500,
              seq: 1,
            },
          ],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 2500 },
        })}
      />,
    );

    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('Line 1');
    expect(table).toHaveTextContent('$29.00');
    expect(table).toHaveTextContent('$25.00');
  });

  it('lists the discounts Stripe applied with another amount, or not at all', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [
            {
              couponId: '',
              kaitenAmount: -500,
              lineId: 'inv-1-line-2',
              providerAmount: 0,
              seq: 2,
              targetSeq: 1,
            },
          ],
          extraDiscounts: [],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2400, providerTotalExcludingTax: 2900 },
        })}
      />,
    );

    expect(screen.getByText('Discounts applied with another amount')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Discount 2 on line 1');
  });

  it('lists the discounts Stripe applied that Kaiten never created, such as a coupon of its dashboard', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [
            { amount: 2500, discountId: 'di_1Qz', externalLineId: 'il_9' },
          ],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 400 },
        })}
      />,
    );

    expect(
      screen.getByText('Discounts Stripe applied that Kaiten did not create'),
    ).toBeInTheDocument();
    expect(screen.getByText('Such as a coupon added in the Stripe dashboard.')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('di_1Qz');
    expect(table).toHaveTextContent('il_9');
    expect(table).toHaveTextContent('$25.00');
  });

  it('says the due date alone when it is the only difference, with the amounts equal', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          dueDate: {
            kaitenDueAt: '2027-03-31T00:06:00.000Z',
            providerDueAt: '2027-04-07T00:06:00.000Z',
          },
          extraDiscounts: [],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 2900 },
        })}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('Differ');
    // The sentence does not claim that amounts differ: they do not.
    expect(card).not.toHaveTextContent('amounts that are not');
    const dueDate = within(card).getByTestId('reconciliation-due-date');
    expect(dueDate).toHaveTextContent('Due date');
    expect(dueDate).toHaveTextContent('Due date in Kaiten');
    expect(dueDate).toHaveTextContent('Mar 31, 2027, 12:06 AM (UTC)');
    expect(dueDate).toHaveTextContent('Due date in Stripe');
    expect(dueDate).toHaveTextContent('Apr 7, 2027, 12:06 AM (UTC)');
    expect(dueDate).toHaveTextContent(
      'Kaiten counts a late payment from its own date.',
    );
    expect(within(card).queryByRole('table')).toBeNull();
  });

  it('shows the due date beside the other differences', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          dueDate: {
            kaitenDueAt: '2027-03-31T00:06:00.000Z',
            providerDueAt: '2027-04-07T00:06:00.000Z',
          },
          extraDiscounts: [],
          extraInProvider: ['ii_9'],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3319 },
        })}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(within(card).getByText('ii_9')).toBeInTheDocument();
    expect(within(card).getByTestId('reconciliation-due-date')).toBeInTheDocument();
  });

  it('shows no due date when the API reports none', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [],
          extraInProvider: ['ii_9'],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3319 },
        })}
      />,
    );

    expect(screen.queryByTestId('reconciliation-due-date')).toBeNull();
  });

  it('names the lines either side has alone', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [],
          extraInProvider: ['ii_9'],
          inclusiveTax: false,
          lines: [],
          missingInProvider: ['inv-1-line-3'],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 3319 },
        })}
      />,
    );

    expect(
      screen.getByText('Lines Kaiten composed that Stripe does not have'),
    ).toBeInTheDocument();
    expect(screen.getByText('inv-1-line-3')).toBeInTheDocument();
    expect(
      screen.getByText('Lines Stripe has that Kaiten did not compose'),
    ).toBeInTheDocument();
    expect(screen.getByText('ii_9')).toBeInTheDocument();
  });

  it('shows the subtotal and the discounts that were compared when tax is included in the amounts', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [],
          extraInProvider: [],
          inclusiveTax: true,
          lines: [],
          missingInProvider: [],
          totals: {
            kaitenTotal: 2900,
            providerSubtotal: 3100,
            providerTotalDiscount: 100,
            providerTotalExcludingTax: 2800,
          },
        })}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('Subtotal in Stripe');
    expect(card).toHaveTextContent('Discounts in Stripe');
    expect(card).toHaveTextContent('31.00');
    expect(card).toHaveTextContent('1.00');
    // The total excluding tax is not what was compared, so it is not shown.
    expect(card).not.toHaveTextContent('Total in Stripe, excluding tax');
    expect(card).not.toHaveTextContent('28.00');
    expect(card).toHaveTextContent(
      'Tax is included in the amounts, so the subtotal of Stripe less its discounts was compared.',
    );
  });

  it('shows the total excluding tax when tax is not included in the amounts', () => {
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [],
          extraDiscounts: [],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 2800 },
        })}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('Total in Stripe, excluding tax');
    expect(card).toHaveTextContent('28.00');
    expect(card).not.toHaveTextContent('Subtotal in Stripe');
  });

  it('keeps every row when one discount is spread over several lines or one coupon sits on several', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ReconciliationCard
        invoice={mismatched({
          discounts: [1, 2].map((targetSeq) => ({
            couponId: 'cp_1',
            kaitenAmount: 500,
            lineId: 'inv-1-line-9',
            providerAmount: 0,
            seq: 9,
            targetSeq,
          })),
          extraDiscounts: ['il_1', 'il_2'].map((externalLineId) => ({
            amount: 100,
            discountId: 'di_1',
            externalLineId,
          })),
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 2800 },
        })}
      />,
    );

    const card = screen.getByTestId('reconciliation');
    expect(within(card).getAllByText('Discount 9 on line 1')).toHaveLength(1);
    expect(within(card).getAllByText('Discount 9 on line 2')).toHaveLength(1);
    expect(within(card).getAllByText('di_1')).toHaveLength(2);
    const keyWarnings = error.mock.calls.filter((call) =>
      String(call[0]).includes('same key'),
    );
    expect(keyWarnings).toHaveLength(0);
    error.mockRestore();
  });
});

describe('a mismatch on an invoice Stripe already holds as paid', () => {
  const paid = (provider: Parameters<typeof buildProviderRecord>[0] = {}): Invoice =>
    stripeInvoice({
      provider: buildProviderRecord({
        externalInvoiceId: 'in_1Abc',
        reconciliationDetail: EMPTY_DETAIL,
        reconciliationStatus: 'MISMATCH',
        ...provider,
      }),
      status: 'PAID',
    });
  const serveStanding = (standing: 'connected' | 'connectedLive' | 'available') =>
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithStripe(standing),
      }),
    );

  it('explains that it is settled in Stripe by hand, and links to the invoice in the test dashboard', async () => {
    serveStanding('connected');
    renderWithClient(<ReconciliationCard invoice={paid()} />);

    const card = screen.getByTestId('reconciliation');
    expect(card).toHaveTextContent('already paid, so it cannot be voided there');
    expect(card).toHaveTextContent('with a credit note and a refund');
    const link = await within(card).findByRole('link', { name: 'Open the invoice in Stripe' });
    expect(link).toHaveAttribute('href', 'https://dashboard.stripe.com/test/invoices/in_1Abc');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('links to the live dashboard when the connection reaches a live account', async () => {
    serveStanding('connectedLive');
    renderWithClient(<ReconciliationCard invoice={paid()} />);

    expect(await screen.findByRole('link', { name: 'Open the invoice in Stripe' })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/invoices/in_1Abc',
    );
  });

  it('falls back to the page Stripe hosts when the mode of the connection is not known, and only over https', async () => {
    serveStanding('available');
    renderWithClient(
      <ReconciliationCard invoice={paid({ hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1/in_1Abc' })} />,
    );

    expect(await screen.findByRole('link', { name: 'Open the invoice in Stripe' })).toHaveAttribute(
      'href',
      'https://invoice.stripe.com/i/acct_1/in_1Abc',
    );
  });

  it('shows no link when there is nowhere safe to send the person, and still explains', async () => {
    serveStanding('available');
    renderWithClient(
      <ReconciliationCard invoice={paid({ hostedInvoiceUrl: 'http://pay.stripe.com/in_1Abc' })} />,
    );

    await waitFor(() => expect(screen.getByTestId('reconciliation')).toHaveTextContent('credit note'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('what an invoice Stripe collects asks a person to look at', () => {
  it('says a draft waits in Stripe for a person to finalize it', () => {
    render(
      <InvoiceProviderAlerts
        invoice={stripeInvoice({
          issuedAt: null,
          provider: buildProviderRecord({ pushAttempts: 1, status: 'draft' }),
          status: 'DRAFT',
        })}
        phase="idle"
      />,
    );

    expect(screen.getByTestId('invoice-awaiting-finalization')).toHaveTextContent(
      'Awaiting finalization in Stripe',
    );
  });

  it('does not say it of a draft the queue is going to push', () => {
    render(
      <InvoiceProviderAlerts
        invoice={stripeInvoice({
          issuedAt: null,
          provider: {
            nextPushAt: '2027-03-01T00:12:00.000Z',
            pushAttempts: 0,
          },
          status: 'DRAFT',
        })}
        phase="idle"
      />,
    );

    expect(screen.queryByTestId('invoice-awaiting-finalization')).toBeNull();
  });

  it('shows what Stripe answered to a push that failed, how many times, and when the next is', () => {
    render(
      <InvoiceProviderAlerts
        invoice={stripeInvoice({
          issuedAt: null,
          provider: {
            lastPushError: 'customer_tax_location_invalid: the address cannot be used',
            nextPushAt: '2027-03-02T06:00:00.000Z',
            pushAttempts: 3,
          },
          status: 'PUSH_FAILED',
        })}
        phase="idle"
      />,
    );

    const error = screen.getByTestId('invoice-push-error');
    expect(error).toHaveTextContent('The push to Stripe failed');
    expect(error).toHaveTextContent(
      'customer_tax_location_invalid: the address cannot be used',
    );
    expect(error).toHaveTextContent('3 attempts.');
    expect(error).toHaveTextContent(/Next attempt: .*2027/);
  });

  it('says to retry by hand when no push is queued', () => {
    render(
      <InvoiceProviderAlerts
        invoice={stripeInvoice({
          issuedAt: null,
          provider: { lastPushError: 'boom', pushAttempts: 1 },
          status: 'PUSH_FAILED',
        })}
        phase="idle"
      />,
    );

    const error = screen.getByTestId('invoice-push-error');
    expect(error).toHaveTextContent('Attempt 1.');
    expect(error).toHaveTextContent('Retry it from the actions above.');
  });

  it('explains a charge that needs the customer, and gives the code Stripe used', () => {
    render(
      <InvoiceProviderAlerts
        invoice={stripeInvoice({
          collectionMethod: 'CHARGE_AUTOMATICALLY',
          provider: buildProviderRecord({
            lastPaymentError: 'authentication_required',
          }),
          status: 'PAYMENT_FAILED',
        })}
        phase="idle"
      />,
    );

    const error = screen.getByTestId('invoice-payment-error');
    expect(error).toHaveTextContent('Stripe could not collect the payment');
    expect(error).toHaveTextContent(
      'The customer must confirm the payment on the hosted invoice page.',
    );
    expect(error).toHaveTextContent('authentication_required');
  });

  it('shows a code it has no words for as Stripe coded it', () => {
    render(
      <InvoiceProviderAlerts
        invoice={stripeInvoice({
          provider: buildProviderRecord({ lastPaymentError: 'processing_error' }),
          status: 'PAYMENT_FAILED',
        })}
        phase="idle"
      />,
    );

    expect(screen.getByTestId('invoice-payment-error')).toHaveTextContent(
      'processing_error',
    );
  });

  it.each([
    ['waiting', 'Pushing to Stripe…'],
    ['expired', 'Still queued'],
  ] as const)('says where the push a person asked for stands (%s)', (phase, title) => {
    render(
      <InvoiceProviderAlerts
        invoice={stripeInvoice({
          issuedAt: null,
          provider: { nextPushAt: '2027-03-01T00:12:00.000Z', pushAttempts: 1 },
          status: 'DRAFT',
        })}
        phase={phase}
      />,
    );

    const status = screen.getByTestId('invoice-push-status');
    expect(status).toHaveAttribute('data-phase', phase);
    expect(status).toHaveTextContent(title);
  });

  it('says nothing of a push nobody asked for', () => {
    render(<InvoiceProviderAlerts invoice={stripeInvoice()} phase="idle" />);

    expect(screen.queryByTestId('invoice-push-status')).toBeNull();
    expect(screen.queryByTestId('invoice-push-error')).toBeNull();
    expect(screen.queryByTestId('invoice-payment-error')).toBeNull();
  });
});
