import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { readStripeRouting } from './stripe-refusals';

const refused = (body: Record<string, unknown>, status = 409) =>
  new ApiError({ data: { ...body, status }, status });

describe('what keeps Stripe connected', () => {
  it('is read from the counts a refused disconnect carries', () => {
    expect(
      readStripeRouting(
        refused({
          code: 'DeactivateConnector.BillingActive',
          detail: 'billing still uses this connector',
          errors: [
            {
              location: 'path.connectorName',
              message: 'routing',
              value: { activeSubscriptions: 2, openInvoices: 5 },
            },
          ],
        }),
      ),
    ).toEqual({ activeSubscriptions: 2, openInvoices: 5 });
  });

  it('is the same for the refused deletion of the settings', () => {
    expect(
      readStripeRouting(
        refused({
          code: 'DeleteConnectorSettings.BillingActive',
          detail: 'billing still uses this connector',
          errors: [{ value: { activeSubscriptions: 0, openInvoices: 1 } }],
        }),
      ),
    ).toEqual({ activeSubscriptions: 0, openInvoices: 1 });
  });

  it('is none for another refusal', () => {
    expect(
      readStripeRouting(
        refused({ code: 'UpdateConnectorSettings.AccountChanged', detail: 'x' }),
      ),
    ).toBeUndefined();
    expect(readStripeRouting(new Error('offline'))).toBeUndefined();
  });

  it('is none when the counts are missing or are not counts, so nothing wrong is claimed', () => {
    const code = 'DeactivateConnector.BillingActive';

    expect(readStripeRouting(refused({ code, detail: 'x' }))).toBeUndefined();
    expect(
      readStripeRouting(refused({ code, detail: 'x', errors: [{ value: 'many' }] })),
    ).toBeUndefined();
    expect(
      readStripeRouting(
        refused({
          code,
          detail: 'x',
          errors: [{ value: { activeSubscriptions: '2', openInvoices: -1 } }],
        }),
      ),
    ).toBeUndefined();
  });
});
