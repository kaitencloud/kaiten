import { describe, expect, it } from 'vite-plus/test';
import {
  getProviderKindLabelKey,
  getPushVariant,
  isAwaitingFinalization,
  type InvoicePushInput,
} from '../logic';

const draft = (
  provider: InvoicePushInput['provider'] = undefined,
): InvoicePushInput => ({ provider, status: 'DRAFT' });

describe('a draft that Stripe holds for a person to finalize', () => {
  it('is one the provider has and the queue is not going to push', () => {
    expect(isAwaitingFinalization(draft({ externalInvoiceId: 'in_1' }))).toBe(
      true,
    );
  });

  it('is not one the queue has still to push, with or without a copy in the provider', () => {
    expect(
      isAwaitingFinalization(
        draft({
          externalInvoiceId: 'in_1',
          nextPushAt: '2027-03-01T00:00:00Z',
        }),
      ),
    ).toBe(false);
    expect(
      isAwaitingFinalization(draft({ nextPushAt: '2027-03-01T00:00:00Z' })),
    ).toBe(false);
    expect(isAwaitingFinalization(draft())).toBe(false);
  });

  it('is only ever a draft', () => {
    expect(
      isAwaitingFinalization({
        provider: { externalInvoiceId: 'in_1' },
        status: 'PUSH_FAILED',
      }),
    ).toBe(false);
    expect(
      isAwaitingFinalization({
        provider: { externalInvoiceId: 'in_1' },
        status: 'PUSHED',
      }),
    ).toBe(false);
  });
});

describe('what pushing an invoice again means', () => {
  it('is finalizing it when Stripe holds the draft for a person', () => {
    expect(getPushVariant(draft({ externalInvoiceId: 'in_1' }))).toBe(
      'finalize',
    );
  });

  it('is retrying when the push failed', () => {
    expect(
      getPushVariant({
        provider: { externalInvoiceId: 'in_1' },
        status: 'PUSH_FAILED',
      }),
    ).toBe('retry');
    expect(getPushVariant({ status: 'PUSH_FAILED' })).toBe('retry');
  });

  it('is pushing now when the queue has the draft and has not run yet', () => {
    expect(
      getPushVariant(draft({ nextPushAt: '2027-03-01T00:00:00Z' })),
    ).toBe('push');
    expect(getPushVariant(draft())).toBe('push');
  });
});

describe('who collects an invoice', () => {
  it('has words for each provider', () => {
    expect(getProviderKindLabelKey('STRIPE')).toBe(
      'Features.Billing.ProviderKind.STRIPE',
    );
  });
});
