import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import {
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { ProblemAlert } from '../components';
import { handleBillingProblem } from '../logic';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['read:organizations']));
});

const refused = (status: number, body: Record<string, unknown>) =>
  new ApiError({ data: { ...body, status }, status });

const NOT_CONNECTED = refused(422, {
  code: 'CreatePortalSession.ProviderNotConnected',
  detail: 'the payment provider is not connected for this organization',
});

const REJECTED = refused(422, {
  code: 'UpdateInstanceBilling.ProviderRejected',
  detail: 'the payment provider refused the request: Invalid email address',
  errors: [
    {
      location: 'provider',
      message: 'provider error',
      value: {
        providerCode: 'email_invalid',
        providerParam: 'email',
        providerRequestId: 'req_1',
      },
    },
  ],
});

describe('a refusal of the payment provider, read', () => {
  it('says the provider is not connected, or refused the credentials', () => {
    expect(handleBillingProblem(NOT_CONNECTED)).toMatchObject({
      providerIssue: 'not-connected',
    });
  });

  it('says the provider refused the request, with what it answered', () => {
    expect(handleBillingProblem(REJECTED)).toMatchObject({
      provider: { code: 'email_invalid', param: 'email', requestId: 'req_1' },
      providerIssue: 'rejected',
    });
  });

  it('leaves out what the provider did not give: the API sends it empty', () => {
    expect(
      handleBillingProblem(
        refused(422, {
          code: 'RetryInvoicePush.ProviderRejected',
          errors: [
            {
              value: { providerCode: 'rate_limit', providerParam: '', providerRequestId: '' },
            },
          ],
        }),
      ).provider,
    ).toEqual({ code: 'rate_limit', param: undefined, requestId: undefined });
  });

  it('has no provider issue for any other refusal, the unreachable provider included', () => {
    expect(
      handleBillingProblem(
        refused(503, { code: 'SyncInvoice.ProviderUnavailable', detail: 'x' }),
      ).providerIssue,
    ).toBeUndefined();
    expect(
      handleBillingProblem(refused(409, { code: 'VoidInvoice.InvalidStatus' }))
        .providerIssue,
    ).toBeUndefined();
  });
});

describe('the alert of a refusal of the payment provider', () => {
  it('shows the detail and leads to the connector, where it is mended', async () => {
    renderWithClient(<ProblemAlert error={NOT_CONNECTED} />);

    expect(
      screen.getByText('the payment provider is not connected for this organization'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Open the Stripe connector' }),
    ).toHaveAttribute('href', '/integrations/connectors/stripe');
  });

  it('shows what the provider answered, its code, the field and the request', async () => {
    renderWithClient(<ProblemAlert error={REJECTED} />);

    expect(
      screen.getByText(/the payment provider refused the request: Invalid email address/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('provider-answer')).toHaveTextContent(
      'Code: email_invalid · Field: email · Request: req_1',
    );
    expect(
      await screen.findByRole('link', { name: 'Open the Stripe connector' }),
    ).toBeInTheDocument();
  });

  it('offers no way to a connector the session may not read the settings of', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing']));
    renderWithClient(<ProblemAlert error={NOT_CONNECTED} />);

    await screen.findByText(/not connected for this organization/);
    await vi.waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Open the Stripe connector' })).toBeNull();
  });

  it('adds nothing to a refusal that is not the provider\'s', () => {
    renderWithClient(
      <ProblemAlert
        error={refused(409, {
          code: 'VoidInvoice.InvalidStatus',
          detail: 'a PAID invoice cannot be voided',
        })}
      />,
    );

    expect(screen.queryByTestId('provider-answer')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
