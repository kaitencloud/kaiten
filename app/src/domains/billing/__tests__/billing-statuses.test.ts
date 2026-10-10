import { describe, expect, it } from 'vite-plus/test';
import {
  describeInvoiceLine,
  getInvoiceStatusPresentation,
  getSubscriptionActions,
  getSubscriptionStatusLabelKey,
  INVOICE_LINE_TYPES,
  INVOICE_STATUSES,
  isInvoiceOverdue,
  isKnownHoldReason,
  isSubscriptionLive,
  type InvoiceStatus,
  type InvoiceStatusInput,
  SUBSCRIPTION_ACTIONS,
  SUBSCRIPTION_STATUSES,
  type SubscriptionAction,
  type SubscriptionStatus,
} from '../logic';

const NOW = Date.parse('2027-03-15T12:00:00Z');
const PAST = '2027-03-01T00:00:00Z';
const FUTURE = '2027-04-01T00:00:00Z';

const invoice = (overrides: Partial<InvoiceStatusInput> = {}): InvoiceStatusInput => ({
  collectionMethod: 'SEND_INVOICE',
  dueAt: null,
  holdReason: null,
  status: 'MANUAL',
  ...overrides,
});

describe('invoice status', () => {
  it('has a label and a tone for every status the API can send', () => {
    for (const status of INVOICE_STATUSES) {
      const presentation = getInvoiceStatusPresentation(invoice({ status }), NOW);

      expect(presentation.labelKey, status).toBe(
        `Features.Billing.InvoiceStatus.${status}`,
      );
      expect(presentation.kind).toBe('status');
    }
    // Every status of the contract is listed, in a stable order.
    expect([...INVOICE_STATUSES].sort()).toEqual(
      (['DRAFT', 'MANUAL', 'PUSHED', 'PAID', 'PUSH_FAILED', 'PAYMENT_FAILED', 'UNCOLLECTIBLE', 'VOID'] as InvoiceStatus[]).sort(),
    );
  });

  it('never shows a manual invoice as a failure', () => {
    expect(getInvoiceStatusPresentation(invoice(), NOW)).toMatchObject({
      labelKey: 'Features.Billing.InvoiceStatus.MANUAL',
      tone: 'default',
    });
  });

  it('says why a held invoice is held', () => {
    expect(
      getInvoiceStatusPresentation(
        invoice({ holdReason: 'LEDGER_SEQUENCE_GAP', status: 'DRAFT' }),
        NOW,
      ),
    ).toEqual({
      holdReasonKey: 'Features.Billing.HoldReason.LEDGER_SEQUENCE_GAP',
      kind: 'held',
      labelKey: 'Features.Billing.InvoiceStatus.held',
      tone: 'destructive',
    });
  });

  it('derives overdue for an unpaid SEND_INVOICE invoice past its due date', () => {
    expect(isInvoiceOverdue(invoice({ dueAt: PAST }), NOW)).toBe(true);
    expect(isInvoiceOverdue(invoice({ dueAt: PAST, status: 'PUSHED' }), NOW)).toBe(true);
    expect(getInvoiceStatusPresentation(invoice({ dueAt: PAST }), NOW).kind).toBe(
      'overdue',
    );
  });

  it.each<[string, InvoiceStatusInput]>([
    ['not yet due', invoice({ dueAt: FUTURE })],
    ['with no due date', invoice()],
    ['paid', invoice({ dueAt: PAST, status: 'PAID' })],
    ['void', invoice({ dueAt: PAST, status: 'VOID' })],
    ['written off', invoice({ dueAt: PAST, status: 'UNCOLLECTIBLE' })],
    // What CHARGE_AUTOMATICALLY allows after the due date is the provider's.
    ['charged automatically', invoice({ collectionMethod: 'CHARGE_AUTOMATICALLY', dueAt: PAST })],
  ])('is not overdue when %s', (_, input) => {
    expect(isInvoiceOverdue(input, NOW)).toBe(false);
  });
});

describe('invoice line types', () => {
  it('knows the five types an invoice can carry', () => {
    expect([...INVOICE_LINE_TYPES]).toEqual([
      'BASE',
      'ADDON',
      'USAGE',
      'OVERAGE',
      'DISCOUNT',
    ]);
  });

  it.each([
    ['BASE', { hasPrice: true, isDiscount: false, isMetered: false }],
    ['ADDON', { hasPrice: true, isDiscount: false, isMetered: false }],
    ['USAGE', { hasPrice: true, isDiscount: false, isMetered: true }],
    ['OVERAGE', { hasPrice: true, isDiscount: false, isMetered: true }],
    ['DISCOUNT', { hasPrice: false, isDiscount: true, isMetered: false }],
  ] as const)('describes a %s line', (type, expected) => {
    expect(describeInvoiceLine({ type })).toEqual({
      ...expected,
      labelKey: `Features.Billing.InvoiceLineType.${type}`,
      rawType: type,
      type,
    });
  });

  it('describes a type it does not know, without failing', () => {
    expect(describeInvoiceLine({ type: 'CREDIT' })).toEqual({
      hasPrice: false,
      isDiscount: false,
      isMetered: false,
      labelKey: 'Features.Billing.InvoiceLineType.unknown',
      rawType: 'CREDIT',
      type: 'UNKNOWN',
    });
  });
});

describe('subscription status', () => {
  it('reads a scheduled cancellation as what is about to happen', () => {
    expect(
      getSubscriptionStatusLabelKey({ cancelAtPeriodEnd: true, status: 'ACTIVE' }),
    ).toBe('Features.Billing.SubscriptionStatus.cancellationScheduled');
    expect(
      getSubscriptionStatusLabelKey({ cancelAtPeriodEnd: false, status: 'PAST_DUE' }),
    ).toBe('Features.Billing.SubscriptionStatus.PAST_DUE');
    // A canceled subscription is canceled, whatever flag it kept.
    expect(
      getSubscriptionStatusLabelKey({ cancelAtPeriodEnd: true, status: 'CANCELED' }),
    ).toBe('Features.Billing.SubscriptionStatus.CANCELED');
  });
});

type Matrix = Record<SubscriptionAction, 'available' | 'disabled' | 'hidden'>;

const availabilities = (
  subscription: { cancelAtPeriodEnd: boolean; status: SubscriptionStatus } | null,
) =>
  Object.fromEntries(
    Object.entries(getSubscriptionActions(subscription)).map(
      ([action, { availability }]) => [action, availability],
    ),
  ) as Matrix;

describe('subscription actions', () => {
  it('lets an instance that was never subscribed be subscribed, and nothing else', () => {
    expect(availabilities(null)).toEqual({
      cancel: 'hidden',
      reactivate: 'hidden',
      schedulePlanChange: 'hidden',
      subscribe: 'available',
      switchProvider: 'hidden',
      updateTerms: 'hidden',
    });
  });

  it('subscribes a canceled subscription again, and offers nothing else', () => {
    expect(availabilities({ cancelAtPeriodEnd: false, status: 'CANCELED' })).toEqual(
      availabilities(null),
    );
    // Even one that kept its cancellation flag.
    expect(availabilities({ cancelAtPeriodEnd: true, status: 'CANCELED' })).toEqual(
      availabilities(null),
    );
  });

  it.each<[SubscriptionStatus]>([['ACTIVE'], ['PAST_DUE']])(
    'lets a %s subscription be cancelled, re-termed and re-provided, and change plan',
    (status) => {
      expect(availabilities({ cancelAtPeriodEnd: false, status })).toEqual({
        cancel: 'available',
        reactivate: 'hidden',
        schedulePlanChange: 'available',
        subscribe: 'hidden',
        switchProvider: 'available',
        updateTerms: 'available',
      });
    },
  );

  it('asks to reactivate before a plan change once a cancellation is scheduled', () => {
    expect(availabilities({ cancelAtPeriodEnd: true, status: 'ACTIVE' })).toEqual({
      cancel: 'available',
      reactivate: 'available',
      schedulePlanChange: 'disabled',
      subscribe: 'hidden',
      switchProvider: 'available',
      updateTerms: 'available',
    });
    expect(
      getSubscriptionActions({ cancelAtPeriodEnd: true, status: 'PAST_DUE' })
        .schedulePlanChange,
    ).toEqual({
      availability: 'disabled',
      reasonKey: 'Features.Billing.SubscriptionActions.Reasons.cancellationScheduled',
    });
  });

  it('refuses a plan change during a trial, and says why', () => {
    expect(availabilities({ cancelAtPeriodEnd: false, status: 'TRIAL' })).toEqual({
      cancel: 'available',
      reactivate: 'hidden',
      schedulePlanChange: 'disabled',
      subscribe: 'hidden',
      switchProvider: 'available',
      updateTerms: 'available',
    });
    expect(
      getSubscriptionActions({ cancelAtPeriodEnd: false, status: 'TRIAL' })
        .schedulePlanChange,
    ).toEqual({
      availability: 'disabled',
      reasonKey: 'Features.Billing.SubscriptionActions.Reasons.trial',
    });
  });

  it('answers for every action in every state', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(Object.keys(getSubscriptionActions({ cancelAtPeriodEnd: false, status })).sort()).toEqual(
        [...SUBSCRIPTION_ACTIONS].sort(),
      );
    }
  });
});

describe('the checks that hold a draft', () => {
  it('knows the three checks the contract has, and none the API might add', () => {
    for (const reason of [
      'LEDGER_SEQUENCE_GAP',
      'LEDGER_CHAIN_BREAK',
      'LEDGER_COUNTER_MISMATCH',
    ]) {
      expect(isKnownHoldReason(reason), reason).toBe(true);
    }
    expect(isKnownHoldReason('LEDGER_NEW_CHECK')).toBe(false);
    expect(isKnownHoldReason('')).toBe(false);
    // What an object inherits is not a check.
    expect(isKnownHoldReason('toString')).toBe(false);
  });
});

describe('a live subscription', () => {
  it('is one that still bills, whatever it is about to do', () => {
    expect(
      SUBSCRIPTION_STATUSES.filter((status) => isSubscriptionLive({ status })),
    ).toEqual(['TRIAL', 'ACTIVE', 'PAST_DUE']);
  });

  it('is not an instance nobody bills, nor one whose subscription ended', () => {
    expect(isSubscriptionLive(null)).toBe(false);
    expect(isSubscriptionLive(undefined)).toBe(false);
    expect(isSubscriptionLive({ status: 'CANCELED' })).toBe(false);
  });
});
