import { describe, expect, it } from 'vite-plus/test';
import {
  getOpenInvoiceFate,
  getOpenInvoiceMove,
  isOpenInvoice,
  needsBillingEmail,
  needsProviderRecord,
} from '../provider-switch';

type Fate = Parameters<typeof getOpenInvoiceFate>[0];

const invoice = (overrides: Partial<Fate>): Fate => ({
  holdReason: null,
  providerKind: 'NOOP',
  status: 'MANUAL',
  ...overrides,
});

describe('the invoices a change of provider leaves in flight', () => {
  it.each(['DRAFT', 'MANUAL', 'PAYMENT_FAILED', 'PUSH_FAILED', 'PUSHED'] as const)(
    'counts a %s invoice as open',
    (status) => {
      expect(isOpenInvoice({ status })).toBe(true);
    },
  );

  it.each(['PAID', 'UNCOLLECTIBLE', 'VOID'] as const)(
    'leaves a %s invoice out: it is final',
    (status) => {
      expect(isOpenInvoice({ status })).toBe(false);
    },
  );
});

describe('what happens next to an open invoice', () => {
  it('leaves a ready-to-bill invoice to the organization\'s accounts receivable', () => {
    expect(getOpenInvoiceFate(invoice({ status: 'MANUAL' }))).toBe('manual');
  });

  it('holds a held draft, whoever collects it', () => {
    expect(
      getOpenInvoiceFate(invoice({ holdReason: 'LEDGER_CHAIN_BREAK', status: 'DRAFT' })),
    ).toBe('held');
    expect(
      getOpenInvoiceFate(
        invoice({
          holdReason: 'LEDGER_SEQUENCE_GAP',
          providerKind: 'STRIPE',
          status: 'DRAFT',
        }),
      ),
    ).toBe('held');
  });

  it('keeps pushing a Stripe draft the queue has, and a push that failed', () => {
    expect(getOpenInvoiceFate(invoice({ providerKind: 'STRIPE', status: 'DRAFT' }))).toBe(
      'queued',
    );
    expect(
      getOpenInvoiceFate(invoice({ providerKind: 'STRIPE', status: 'PUSH_FAILED' })),
    ).toBe('queued');
  });

  it('waits for a person on a draft Stripe holds', () => {
    expect(
      getOpenInvoiceFate(invoice({ providerKind: 'STRIPE', status: 'DRAFT' }), true),
    ).toBe('review');
  });

  it('leaves an invoice Stripe has accepted to Stripe', () => {
    for (const status of ['PUSHED', 'PAYMENT_FAILED'] as const) {
      expect(getOpenInvoiceFate(invoice({ providerKind: 'STRIPE', status }))).toBe(
        'collected',
      );
    }
  });

  it('says nothing of what the change would alter in any other case', () => {
    expect(getOpenInvoiceFate(invoice({ status: 'DRAFT' }))).toBe('other');
    expect(getOpenInvoiceFate(invoice({ status: 'PUSHED' }))).toBe('other');
  });

  it('needs the record of the provider for a Stripe draft that is not held, and for no other', () => {
    expect(needsProviderRecord(invoice({ providerKind: 'STRIPE', status: 'DRAFT' }))).toBe(true);
    expect(
      needsProviderRecord(
        invoice({ holdReason: 'LEDGER_CHAIN_BREAK', providerKind: 'STRIPE', status: 'DRAFT' }),
      ),
    ).toBe(false);
    expect(needsProviderRecord(invoice({ providerKind: 'STRIPE', status: 'PUSHED' }))).toBe(false);
    expect(needsProviderRecord(invoice({ status: 'DRAFT' }))).toBe(false);
  });
});

describe('how an open invoice is moved to the new provider', () => {
  it('voids and recomposes a ready-to-bill invoice, or one the queue keeps pushing', () => {
    expect(getOpenInvoiceMove('manual', 'NOOP', 'STRIPE')).toBe('voidAndRecompose');
    expect(getOpenInvoiceMove('queued', 'STRIPE', 'NOOP')).toBe('voidAndRecompose');
  });

  it('says the void deletes the draft Stripe holds', () => {
    expect(getOpenInvoiceMove('review', 'STRIPE', 'NOOP')).toBe('voidDeletesDraft');
  });

  it('asks to void in both systems an invoice Stripe has accepted, and only if the customer must stop paying there', () => {
    expect(getOpenInvoiceMove('collected', 'STRIPE', 'NOOP')).toBe('voidInBoth');
  });

  it('leaves a held draft to a deliberate choice: releasing keeps its provider, recomposing moves it', () => {
    expect(getOpenInvoiceMove('held', 'NOOP', 'STRIPE')).toBe('choose');
    // Even when it is on the provider already, a recompose resolves it again.
    expect(getOpenInvoiceMove('held', 'STRIPE', 'STRIPE')).toBe('choose');
  });

  it('has nothing to move when the invoice is on the provider already', () => {
    expect(getOpenInvoiceMove('collected', 'STRIPE', 'STRIPE')).toBe('none');
    expect(getOpenInvoiceMove('manual', 'NOOP', 'NOOP')).toBe('none');
  });

  it('has nothing to move for what the change does not touch', () => {
    expect(getOpenInvoiceMove('other', 'NOOP', 'STRIPE')).toBe('none');
  });
});

describe('a change that would be refused for want of an address', () => {
  const noop = { providerKind: 'NOOP' } as const;
  const stripe = { providerKind: 'STRIPE' } as const;
  const sends = { collectionMethod: 'SEND_INVOICE', providerKind: 'STRIPE' };

  it('is a move to Stripe that sends the invoice, for a customer without an address', () => {
    expect(needsBillingEmail(sends, noop, undefined)).toBe(true);
    expect(needsBillingEmail(sends, noop, '   ')).toBe(true);
  });

  it('is not one for a customer who has an address', () => {
    expect(needsBillingEmail(sends, noop, 'ap@acme.test')).toBe(false);
  });

  it('is not a move to Stripe that charges the card, which asks for no address', () => {
    expect(
      needsBillingEmail(
        { collectionMethod: 'CHARGE_AUTOMATICALLY', providerKind: 'STRIPE' },
        noop,
        undefined,
      ),
    ).toBe(false);
  });

  it('is not a change of a contract that is on Stripe already: the API checks nothing then', () => {
    expect(needsBillingEmail(sends, stripe, undefined)).toBe(false);
  });

  it('is not a move to the organization\'s own system', () => {
    expect(
      needsBillingEmail(
        { collectionMethod: 'SEND_INVOICE', providerKind: 'NOOP' },
        stripe,
        undefined,
      ),
    ).toBe(false);
  });
});
