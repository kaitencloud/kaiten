import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  InstanceBilling,
  InvoiceSummary,
  SubscriptionTerms,
} from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleGetCustomerBilling,
  handleGetInstanceBilling,
  handleGetInvoice,
  handleListInstanceInvoices,
  handleUpdateInstanceBilling,
} from '@/api-client/msw.gen';
import {
  invoiceRow,
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  buildInvoice,
  buildInvoiceLine,
  buildProviderRecord,
} from '../../../../../../../../e2e/app/_support/fixtures/build-invoice';
import {
  billingCapabilitiesProfiles,
  type StripeStanding,
} from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { PaymentTermsDialog } from '../terms/payment-terms-dialog';
import { INSTANCE, subscription } from './lifecycle-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: () => detail.current,
}));
vi.mock('@tanstack/react-router', async () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: Record<string, string>;
    to: string;
  }) => (
    <a
      {...props}
      href={Object.entries(params ?? {}).reduce(
        (path, [name, value]) => path.replace(`$${name}`, value),
        to,
      )}
    >
      {children}
    </a>
  ),
}));

useBillingTexts();

const GLOBEX = { billingEmail: 'ap@globex.test', slug: 'globex' };

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:organizations', 'write:billing']),
  );
  detail.current = { customer: GLOBEX, instance: INSTANCE };
  stripeIs('connected');
  server.use(
    handleGetInstanceBilling({ body: subscription() }),
    handleGetBillingSettings({
      body: {
        defaultCollectionMethod: 'SEND_INVOICE',
        defaultDaysUntilDue: 30,
        handoffStripeInvoices: false,
      },
    }),
    handleListInstanceInvoices({ body: pageOf([]) }),
    handleGetCustomerBilling({
      body: {
        providers: [
          {
            externalCustomerId: 'cus_globex',
            paymentMethod: {
              attachedAt: '2026-08-01T00:00:00.000Z',
              brand: 'visa',
              expMonth: 12,
              expYear: 2030,
              last4: '4242',
              status: 'ACTIVE',
            },
            providerKind: 'STRIPE',
          },
        ],
      },
    }),
  );
});

function stripeIs(standing: StripeStanding) {
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithStripe(standing),
    }),
  );
}

/** A contract Stripe collects by charging the card on file. */
const onStripe = (overrides: Partial<InstanceBilling> = {}): InstanceBilling => ({
  ...subscription(),
  collectionMethod: 'CHARGE_AUTOMATICALLY',
  collectionMethodOverride: 'CHARGE_AUTOMATICALLY',
  providerKind: 'STRIPE',
  ...overrides,
});

/** Records the bodies of the changes of terms the API is asked for. */
function serveTerms(answer?: (body: SubscriptionTerms) => Response) {
  const bodies: SubscriptionTerms[] = [];
  server.use(
    handleUpdateInstanceBilling(async ({ request }) => {
      const body = (await request.json()) as SubscriptionTerms;
      bodies.push(body);

      return answer?.(body) ?? HttpResponse.json(subscription());
    }),
  );

  return bodies;
}

const renderDialog = (onClose = vi.fn()) => {
  renderWithClient(<PaymentTermsDialog onClose={onClose} />);

  return { onClose };
};

const provider = () => screen.findByRole('combobox', { name: /Collected by/ });
const method = () => screen.findByRole('combobox', { name: /Collection method/ });
const save = () => screen.findByRole('button', { name: 'Save' });

async function choose(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

const line = buildInvoiceLine({
  amount: 2900,
  description: '1 × $29.00 per month',
  invoiceId: 'inv-x',
  label: 'Pro, monthly',
  seq: 1,
  serviceFrom: '2026-09-01T00:00:00.000Z',
  serviceTo: '2026-10-01T00:00:00.000Z',
  type: 'BASE',
});

const row = (id: string, overrides: Partial<InvoiceSummary>) =>
  invoiceRow(id, 'Globex', {
    boundaryAt: '2026-09-01T00:00:00.000Z',
    kind: 'RENEWAL',
    ...overrides,
  });

describe('the dialog where a provider is offered', () => {
  it('is named for the provider as well as the terms', async () => {
    renderDialog();

    expect(
      await screen.findByRole('dialog', {
        name: 'Provider and terms of Globex Production',
      }),
    ).toBeInTheDocument();
  });

  it('keeps its old name and its only field where no provider is offered', async () => {
    server.use(
      handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    );
    renderDialog();

    expect(
      await screen.findByRole('dialog', { name: 'Payment terms of Globex Production' }),
    ).toBeInTheDocument();
    await screen.findByLabelText('Payment terms (days)');
    expect(screen.queryByRole('combobox', { name: /Collected by/ })).toBeNull();
  });

  it('lists Stripe, off, while it can only be connected, and leads to where it is connected', async () => {
    stripeIs('available');
    renderDialog();

    await userEvent.click(await provider());
    expect(
      await screen.findByRole('option', { name: 'Stripe (not connected)' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    const hint = await screen.findByTestId('terms-connect-hint');
    expect(hint).toHaveTextContent('Stripe is not connected for your organization yet');
    expect(within(hint).getByRole('link', { name: 'Connect Stripe' })).toHaveAttribute(
      'href',
      '/integrations/connectors/stripe',
    );
  });

  it('has no provider to choose where Stripe cannot be connected at all', async () => {
    stripeIs('vaultMissing');
    renderDialog();

    await screen.findByLabelText('Payment terms (days)');
    expect(screen.queryByRole('combobox', { name: /Collected by/ })).toBeNull();
  });

  it('opens on the provider and the collection method the contract has', async () => {
    renderDialog();

    expect(await provider()).toHaveTextContent('Manual hand-off');
    expect(await method()).toHaveTextContent('Send the invoice');
  });

  it('keeps the provider choice for a contract Stripe collects whatever Stripe is now', async () => {
    stripeIs('available');
    server.use(handleGetInstanceBilling({ body: onStripe() }));
    renderDialog();

    expect(await provider()).toHaveTextContent('Stripe');
  });
});

describe('moving a contract to Stripe', () => {
  it('sends the provider, and only what changed besides the days', async () => {
    const bodies = serveTerms();
    const { onClose } = renderDialog();

    await choose(await provider(), 'Stripe');
    await userEvent.click(await save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ providerKind: 'STRIPE' }]);
    expect(toast.success).toHaveBeenCalledWith('The payment terms are saved');
  });

  it('charges automatically once Stripe is the provider, and sends both', async () => {
    const bodies = serveTerms();
    renderDialog();

    await choose(await provider(), 'Stripe');
    await choose(await method(), 'Charge automatically');
    await userEvent.click(await save());

    await waitFor(() =>
      expect(bodies).toEqual([
        { collectionMethod: 'CHARGE_AUTOMATICALLY', providerKind: 'STRIPE' },
      ]),
    );
  });

  it('lists charging automatically with what it needs where the provider cannot do it', async () => {
    renderDialog();

    await userEvent.click(await method());

    expect(
      await screen.findByRole('option', {
        name: 'Charge automatically (needs Stripe)',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('offers Stripe as a provider once it is connected', async () => {
    renderDialog();

    await userEvent.click(await provider());
    expect(await screen.findByRole('option', { name: 'Stripe' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('warns that Stripe sends the invoices to an address the customer does not have, and leads to the customer', async () => {
    detail.current = { customer: { slug: 'globex' }, instance: INSTANCE };
    renderDialog();

    await choose(await provider(), 'Stripe');

    const warning = await screen.findByTestId('terms-warning');
    expect(warning).toHaveTextContent('This customer has no billing e-mail');
    expect(within(warning).getByRole('link', { name: 'Open the customer' })).toHaveAttribute(
      'href',
      '/customers/globex',
    );
    // The API would refuse: nothing is sent.
    expect(await save()).toBeDisabled();
  });

  it('lets a contract that is on Stripe already change its days whatever the customer has', async () => {
    server.use(handleGetInstanceBilling({ body: onStripe() }));
    detail.current = { customer: { slug: 'globex' }, instance: INSTANCE };
    const bodies = serveTerms();
    renderDialog();

    await userEvent.type(await screen.findByLabelText('Payment terms (days)'), '14');
    await userEvent.click(await save());

    await waitFor(() => expect(bodies).toEqual([{ daysUntilDue: 14 }]));
  });

  it('lets the invoice be charged to a card when the customer has no address, which Stripe asks nothing of', async () => {
    detail.current = { customer: { slug: 'globex' }, instance: INSTANCE };
    renderDialog();

    await choose(await provider(), 'Stripe');
    await choose(await method(), 'Charge automatically');

    await waitFor(async () => expect(await save()).toBeEnabled());
  });

  it('says nothing of the e-mail when the customer has one', async () => {
    renderDialog();

    await choose(await provider(), 'Stripe');

    await screen.findByText(
      'The change takes effect from the next invoice; invoices already issued keep their provider.',
    );
    expect(screen.queryByTestId('terms-warning')).toBeNull();
  });

  it('warns that there is no card to charge when charging automatically', async () => {
    server.use(
      handleGetCustomerBilling({ body: { providers: [{ externalCustomerId: 'cus_globex', paymentMethod: null as never, providerKind: 'STRIPE' }] } }),
    );
    renderDialog();

    await choose(await provider(), 'Stripe');
    await choose(await method(), 'Charge automatically');

    expect(await screen.findByTestId('terms-warning')).toHaveTextContent(
      'This customer has no payment method Stripe can charge.',
    );
  });

  it('warns that a card that failed cannot be charged either', async () => {
    server.use(
      handleGetCustomerBilling({
        body: {
          providers: [
            {
              externalCustomerId: 'cus_globex',
              paymentMethod: { last4: '4242', status: 'FAILED' },
              providerKind: 'STRIPE',
            },
          ],
        },
      }),
    );
    renderDialog();

    await choose(await provider(), 'Stripe');
    await choose(await method(), 'Charge automatically');

    expect(await screen.findByTestId('terms-warning')).toBeInTheDocument();
  });

  it('shows the refusals of the API where they are about: the provider, the method', async () => {
    serveTerms(() =>
      refusal(422, {
        code: 'UpdateInstanceBilling.ProviderNotConnected',
        detail: 'the payment provider is not connected for this organization',
      }),
    );
    renderDialog();
    await choose(await provider(), 'Stripe');

    await userEvent.click(await save());

    expect(
      await screen.findByText('the payment provider is not connected for this organization'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows what is about the customer, not a field, above the buttons', async () => {
    serveTerms(() =>
      refusal(422, {
        code: 'UpdateInstanceBilling.BillingEmailMissing',
        detail: 'the customer has no billing e-mail: the payment provider sends the invoices there',
      }),
    );
    renderDialog();
    await choose(await provider(), 'Stripe');

    await userEvent.click(await save());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'the customer has no billing e-mail',
    );
  });
});

describe('moving a contract away from Stripe', () => {
  it('goes back to sending the invoice, since the organization\'s own system only does that', async () => {
    server.use(handleGetInstanceBilling({ body: onStripe() }));
    const bodies = serveTerms();
    renderDialog();
    expect(await method()).toHaveTextContent('Charge automatically');

    await choose(await provider(), 'Manual hand-off');

    await waitFor(async () =>
      expect(await method()).toHaveTextContent('Send the invoice'),
    );
    await userEvent.click(await save());

    await waitFor(() =>
      expect(bodies).toEqual([
        { collectionMethod: 'SEND_INVOICE', providerKind: 'NOOP' },
      ]),
    );
  });

  it('changes the method without the provider when only the method changes', async () => {
    server.use(handleGetInstanceBilling({ body: onStripe() }));
    const bodies = serveTerms();
    renderDialog();

    await choose(await method(), 'Send the invoice');
    await userEvent.click(await save());

    await waitFor(() =>
      expect(bodies).toEqual([{ collectionMethod: 'SEND_INVOICE' }]),
    );
  });
});

describe('the invoices still open when the provider changes', () => {
  const OPEN = [
    row('inv-manual', { providerKind: 'NOOP', status: 'MANUAL' }),
    row('inv-held', {
      holdReason: 'LEDGER_SEQUENCE_GAP',
      providerKind: 'NOOP',
      status: 'DRAFT',
    }),
    row('inv-paid', { providerKind: 'NOOP', status: 'PAID' }),
    row('inv-void', { providerKind: 'NOOP', status: 'VOID' }),
  ];

  it('lists what is open and leaves out what is final, with what becomes of each', async () => {
    server.use(handleListInstanceInvoices({ body: pageOf(OPEN) }));
    renderDialog();

    await choose(await provider(), 'Stripe');

    const open = await screen.findByTestId('open-invoices');
    const rows = await within(open).findAllByTestId('open-invoice');
    expect(rows.map((item) => item.getAttribute('data-fate'))).toEqual([
      'manual',
      'held',
    ]);
    expect(rows[0]).toHaveTextContent('still counts toward a late payment');
    expect(rows[0]).toHaveTextContent('To move it: void it, then recompose it.');
    expect(rows[1]).toHaveTextContent('recomposing it uses the new provider');
    expect(rows[1]).toHaveTextContent('choose deliberately');
  });

  it('links each to its page', async () => {
    server.use(handleListInstanceInvoices({ body: pageOf(OPEN) }));
    renderDialog();

    await choose(await provider(), 'Stripe');

    const rows = await screen.findAllByTestId('open-invoice');
    expect(within(rows[0]).getByRole('link')).toHaveAttribute(
      'href',
      '/billing/invoices/inv-manual',
    );
  });

  it('says there is none when nothing is open', async () => {
    server.use(
      handleListInstanceInvoices({
        body: pageOf([row('inv-paid', { providerKind: 'NOOP', status: 'PAID' })]),
      }),
    );
    renderDialog();

    await choose(await provider(), 'Stripe');

    expect(await screen.findByTestId('open-invoices-empty')).toHaveTextContent(
      'This contract has no open invoice.',
    );
  });

  it('is not shown while the provider is the one the contract has: the change is of terms alone', async () => {
    server.use(handleListInstanceInvoices({ body: pageOf(OPEN) }));
    renderDialog();

    await provider();
    expect(screen.queryByTestId('open-invoices')).toBeNull();
  });

  it('tells what happens to the invoices Stripe has when the contract leaves it', async () => {
    server.use(
      handleGetInstanceBilling({ body: onStripe() }),
      handleListInstanceInvoices({
        body: pageOf([
          row('inv-pushed', { providerKind: 'STRIPE', status: 'PUSHED' }),
          row('inv-failed', { providerKind: 'STRIPE', status: 'PUSH_FAILED' }),
          row('inv-failed-payment', { providerKind: 'STRIPE', status: 'PAYMENT_FAILED' }),
        ]),
      }),
    );
    renderDialog();

    await choose(await provider(), 'Manual hand-off');

    const rows = await screen.findAllByTestId('open-invoice');
    expect(rows.map((item) => item.getAttribute('data-fate'))).toEqual([
      'collected',
      'queued',
      'collected',
    ]);
    expect(rows[0]).toHaveTextContent('Stripe cannot be disconnected while it is open.');
    expect(rows[0]).toHaveTextContent('void it in both systems');
    expect(rows[1]).toHaveTextContent('keeps being pushed to Stripe');
  });

  it('reads a Stripe draft in full to tell the queue from the draft Stripe holds for a person', async () => {
    const queuedDraft = row('inv-queued', { providerKind: 'STRIPE', status: 'DRAFT' });
    const reviewDraft = row('inv-review', { providerKind: 'STRIPE', status: 'DRAFT' });
    server.use(
      handleGetInstanceBilling({ body: onStripe() }),
      handleListInstanceInvoices({ body: pageOf([queuedDraft, reviewDraft]) }),
      handleGetInvoice(({ params }) =>
        HttpResponse.json(
          buildInvoice({
            boundaryAt: '2026-09-01T00:00:00.000Z',
            id: String(params.invoiceId),
            lines: [line],
            provider:
              params.invoiceId === 'inv-review'
                ? buildProviderRecord({ status: 'draft' })
                : { nextPushAt: '2026-10-01T00:00:00.000Z', pushAttempts: 0 },
            status: 'DRAFT',
          }),
        ),
      ),
    );
    renderDialog();

    await choose(await provider(), 'Manual hand-off');

    await waitFor(async () => {
      const rows = await screen.findAllByTestId('open-invoice');
      expect(rows.map((item) => item.getAttribute('data-fate'))).toEqual([
        'queued',
        'review',
      ]);
    });
    const review = (await screen.findAllByTestId('open-invoice'))[1];
    expect(review).toHaveTextContent('waits in Stripe to be finalized');
    expect(review).toHaveTextContent('which deletes the draft in Stripe');
  });

  it('shows a refusal to read the invoices with a way to ask again', async () => {
    server.use(
      handleListInstanceInvoices(() =>
        refusal(503, { detail: 'The invoices are unavailable' }),
      ),
    );
    renderDialog();

    await choose(await provider(), 'Stripe');

    expect(await screen.findByText('The invoices are unavailable')).toBeInTheDocument();
  });
});
