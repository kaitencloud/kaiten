import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { SubscriptionTerms } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleGetInstanceBilling,
  handleUpdateInstanceBilling,
} from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
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
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
}));

useBillingTexts();

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'write:billing']));
  detail.current = { instance: INSTANCE };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleGetInstanceBilling({ body: subscription() }),
    handleGetBillingSettings({
      body: {
        defaultCollectionMethod: 'SEND_INVOICE',
        defaultDaysUntilDue: 30,
        handoffStripeInvoices: false,
      },
    }),
  );
});

/** Records the bodies of the changes of terms the API is asked for. */
function serveTerms(answer?: (body: SubscriptionTerms) => Response) {
  const bodies: SubscriptionTerms[] = [];
  server.use(
    handleUpdateInstanceBilling(async ({ request }) => {
      const body = (await request.json()) as SubscriptionTerms;
      bodies.push(body);

      return answer?.(body) ?? HttpResponse.json(subscription({ daysUntilDueOverride: 45 }));
    }),
  );

  return bodies;
}

const renderDialog = (onClose = vi.fn()) => {
  renderWithClient(<PaymentTermsDialog onClose={onClose} />);

  return { onClose };
};

const daysField = () => screen.findByLabelText('Payment terms (days)');
const save = () => screen.findByRole('button', { name: 'Save' });

describe('the payment terms dialog', () => {
  it('names the instance and says what the terms are and where they come from', async () => {
    renderDialog();

    expect(
      await screen.findByRole('dialog', { name: 'Payment terms of Globex Production' }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('payment-terms-current')).toHaveTextContent(
      'Invoices are payable within 30 days (the default of your organization).',
    );
    expect(await daysField()).toHaveValue('');
    expect(await screen.findByPlaceholderText('Organization default: 30')).toBeInTheDocument();
  });

  it('says that a contract has terms of its own, shows them, and offers the way back to the default', async () => {
    server.use(handleGetInstanceBilling({ body: subscription({ daysUntilDueOverride: 45 }) }));
    renderDialog();

    expect(await screen.findByTestId('payment-terms-current')).toHaveTextContent(
      'Invoices are payable within 45 days (the terms of this contract).',
    );
    expect(await daysField()).toHaveValue('45');
    expect(screen.getByRole('button', { name: 'Use organization default' })).toBeInTheDocument();
  });

  it('does not offer the way back to a contract that has no terms of its own', async () => {
    renderDialog();

    await daysField();
    expect(screen.queryByRole('button', { name: 'Use organization default' })).toBeNull();
  });

  it('says the change takes effect on the next invoice', async () => {
    renderDialog();

    expect(
      await screen.findByText(/takes effect on the next invoice. Invoices already issued keep their own due date/),
    ).toBeInTheDocument();
  });

  it('has nothing to save until something changes', async () => {
    renderDialog();

    await daysField();
    expect(await save()).toBeDisabled();
  });

  it('saves the days typed, and only the days', async () => {
    const bodies = serveTerms();
    const { onClose } = renderDialog();

    await userEvent.type(await daysField(), '45');
    await userEvent.click(await save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ daysUntilDue: 45 }]);
    expect(toast.success).toHaveBeenCalledWith('The payment terms are saved');
  });

  it('saves zero as zero: due on receipt, which is not the default', async () => {
    const bodies = serveTerms();
    renderDialog();

    await userEvent.type(await daysField(), '0');
    await userEvent.click(await save());

    await waitFor(() => expect(bodies).toEqual([{ daysUntilDue: 0 }]));
  });

  it('takes the terms of the organization back when the field is emptied, as null and not as zero', async () => {
    server.use(handleGetInstanceBilling({ body: subscription({ daysUntilDueOverride: 45 }) }));
    const bodies = serveTerms();
    const { onClose } = renderDialog();

    await userEvent.clear(await daysField());
    await userEvent.click(await save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ daysUntilDue: null }]);
    expect(toast.success).toHaveBeenCalledWith('The terms of your organization apply again');
  });

  it('takes them back with its own button, whatever the field holds', async () => {
    server.use(handleGetInstanceBilling({ body: subscription({ daysUntilDueOverride: 45 }) }));
    const bodies = serveTerms();
    const { onClose } = renderDialog();
    await daysField();

    await userEvent.click(screen.getByRole('button', { name: 'Use organization default' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ daysUntilDue: null }]);
    expect(toast.success).toHaveBeenCalledWith('The terms of your organization apply again');
  });

  it.each(['366', '-1'])('refuses %s days, in words, before the API does', async (days) => {
    const bodies = serveTerms();
    renderDialog();

    await userEvent.type(await daysField(), days);

    expect(
      await screen.findByText('Enter a whole number of days, from 0 to 365'),
    ).toBeInTheDocument();
    expect(await save()).toBeDisabled();
    expect(bodies).toEqual([]);
  });

  it('sends one request however often it is pressed', async () => {
    let calls = 0;
    server.use(
      handleUpdateInstanceBilling(async () => {
        calls += 1;
        await delay(150);

        return HttpResponse.json(subscription({ daysUntilDueOverride: 45 }));
      }),
    );
    const { onClose } = renderDialog();
    await userEvent.type(await daysField(), '45');
    const button = await save();

    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  it('refuses in the words of the API on the days, keeping what was typed', async () => {
    serveTerms(() =>
      refusal(422, {
        code: 'UpdateInstanceBilling.InvalidDaysUntilDue',
        detail: 'daysUntilDue must be between 0 and 365',
      }),
    );
    const { onClose } = renderDialog();
    await userEvent.type(await daysField(), '45');

    await userEvent.click(await save());

    expect(await screen.findByText('daysUntilDue must be between 0 and 365')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(await daysField()).toHaveValue('45');
  });

  it('shows any other refusal above the buttons', async () => {
    serveTerms(() => refusal(409, { code: 'UpdateInstanceBilling.NotActive', detail: 'the subscription is canceled' }));
    renderDialog();
    await userEvent.type(await daysField(), '45');

    await userEvent.click(await save());

    expect(await screen.findByRole('alert')).toHaveTextContent('the subscription is canceled');
  });

  it('waits out a period that is being closed and sends the same request again', async () => {
    let calls = 0;
    const bodies: SubscriptionTerms[] = [];
    server.use(
      handleUpdateInstanceBilling(async ({ request }) => {
        calls += 1;
        bodies.push((await request.json()) as SubscriptionTerms);

        return calls === 1
          ? HttpResponse.json(
              {
                code: 'UpdateInstanceBilling.BoundaryPending',
                detail: 'the period has ended and is being closed; retry in a minute',
                status: 409,
              },
              { headers: { 'Retry-After': '1' }, status: 409 },
            )
          : HttpResponse.json(subscription({ daysUntilDueOverride: 45 }));
      }),
    );
    const { onClose } = renderDialog();
    await userEvent.type(await daysField(), '45');

    await userEvent.click(await save());

    expect(await screen.findByTestId('boundary-closing')).toHaveTextContent('Closing the period');
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 4000 });
    expect(bodies).toEqual([{ daysUntilDue: 45 }, { daysUntilDue: 45 }]);
  });

  it('says only that they are the organization\'s when it cannot read them', async () => {
    server.use(handleGetBillingSettings(() => refusal(403, { code: 'Auth.MissingScope', detail: 'no' })));
    renderDialog();

    expect(await screen.findByPlaceholderText('Organization default')).toBeInTheDocument();
  });

  describe('when there are no terms to change', () => {
    it('says a contract that ended has none', async () => {
      server.use(handleGetInstanceBilling({ body: subscription({ status: 'CANCELED' }) }));
      renderDialog();

      expect(await screen.findByTestId('terms-unavailable')).toHaveTextContent(
        'This subscription has ended: it has no terms to change.',
      );
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    it('says an instance nobody bills has none', async () => {
      server.use(
        handleGetInstanceBilling(() =>
          refusal(404, { code: 'GetInstanceBilling.NotFound', detail: 'No subscription' }),
        ),
      );
      renderDialog();

      expect(await screen.findByTestId('terms-unavailable')).toHaveTextContent(
        'This instance has no subscription.',
      );
    });

    it('changes the terms of a trial and of a subscription past due as well as of an active one', async () => {
      for (const status of ['TRIAL', 'PAST_DUE'] as const) {
        server.use(handleGetInstanceBilling({ body: subscription({ status }) }));
        const view = renderWithClient(<PaymentTermsDialog onClose={vi.fn()} />);

        expect(await daysField()).toBeInTheDocument();
        view.unmount();
      }
    });
  });
});
