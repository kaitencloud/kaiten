import { describe, expect, it } from 'vite-plus/test';
import { OPERATION_SCOPES } from '@/lib/api/operation-scopes.gen';
import {
  BILLING_ACTIONS,
  getActionScopes,
  getInvoiceActions,
  INVOICE_ACTION_SCOPES,
  INVOICE_STATUSES,
  type InvoiceAction,
  type InvoiceActionsInput,
  type InvoiceStatus,
} from '../logic';

const invoice = (
  status: InvoiceStatus,
  overrides: Partial<InvoiceActionsInput> = {},
): InvoiceActionsInput => ({
  serviceFrom: '2027-03-01T00:00:00.000Z',
  status,
  ...overrides,
});

const actionsOf = (...args: Parameters<typeof getInvoiceActions>) =>
  getInvoiceActions(...args).map(({ action }) => action);

describe('the actions an invoice offers', () => {
  it('releases, recomposes or voids a held draft, in that order', () => {
    expect(
      actionsOf(invoice('DRAFT', { holdReason: 'LEDGER_SEQUENCE_GAP' })),
    ).toEqual(['releaseHold', 'recompose', 'void']);
  });

  it('only voids a draft that is not held: nothing has gone wrong with it', () => {
    expect(actionsOf(invoice('DRAFT'))).toEqual(['void']);
  });

  it('marks paid, writes off or voids an invoice ready to bill', () => {
    expect(actionsOf(invoice('MANUAL'))).toEqual([
      'markPaid',
      'writeOff',
      'void',
    ]);
  });

  it('only voids an invoice whose push failed, where nobody pushes it', () => {
    expect(actionsOf(invoice('PUSH_FAILED'))).toEqual(['void']);
  });

  it('recomposes a void invoice that was not replaced', () => {
    expect(actionsOf(invoice('VOID'))).toEqual(['recompose']);
  });

  it('offers a replaced void invoice nothing: its replacement is the way on', () => {
    expect(
      actionsOf(invoice('VOID', { replacedByInvoiceId: 'inv-2' })),
    ).toEqual([]);
  });

  it.each<InvoiceStatus>(['PAID', 'UNCOLLECTIBLE', 'PUSHED', 'PAYMENT_FAILED'])(
    'offers a %s invoice nothing when nobody collects it through a provider: it is final',
    (status) => {
      expect(actionsOf(invoice(status))).toEqual([]);
    },
  );

  it.each<InvoiceStatus>(['PAID', 'UNCOLLECTIBLE'])(
    'offers a %s invoice of Stripe nothing either: it is final',
    (status) => {
      expect(actionsOf(invoice(status, { providerKind: 'STRIPE' }))).toEqual(
        [],
      );
    },
  );

  it('answers for every status the API can send', () => {
    for (const status of INVOICE_STATUSES) {
      expect(() => getInvoiceActions(invoice(status))).not.toThrow();
    }
  });

  it('never offers a held-draft action to an invoice that is not one', () => {
    for (const status of INVOICE_STATUSES) {
      if (status === 'DRAFT') continue;
      expect(actionsOf(invoice(status)), status).not.toContain('releaseHold');
    }
  });
});

describe('the actions of an invoice Stripe collects', () => {
  const stripe = (
    status: InvoiceStatus,
    overrides: Partial<InvoiceActionsInput> = {},
  ) => invoice(status, { providerKind: 'STRIPE', ...overrides });

  it('pushes a draft the queue has not pushed yet, or voids it', () => {
    expect(
      actionsOf(stripe('DRAFT', { provider: { externalInvoiceId: undefined } })),
    ).toEqual(['retryPush', 'void']);
    expect(actionsOf(stripe('DRAFT'))).toEqual(['retryPush', 'void']);
  });

  it('finalizes, reads back or voids a draft that waits in Stripe for a person', () => {
    expect(
      actionsOf(stripe('DRAFT', { provider: { externalInvoiceId: 'in_1' } })),
    ).toEqual(['retryPush', 'sync', 'void']);
  });

  it('retries or voids an invoice whose push failed before Stripe had it', () => {
    expect(actionsOf(stripe('PUSH_FAILED'))).toEqual(['retryPush', 'void']);
  });

  it('says what pushing again means for each, which is how the button reads', () => {
    const variantOf = (...args: Parameters<typeof stripe>) =>
      getInvoiceActions(stripe(...args)).find(
        ({ action }) => action === 'retryPush',
      )?.variant;

    expect(variantOf('DRAFT')).toBe('push');
    expect(variantOf('DRAFT', { provider: { externalInvoiceId: 'in_1' } })).toBe(
      'finalize',
    );
    expect(variantOf('PUSH_FAILED')).toBe('retry');
  });

  it('also reads back one whose push failed after Stripe had created it', () => {
    expect(
      actionsOf(
        stripe('PUSH_FAILED', { provider: { externalInvoiceId: 'in_1' } }),
      ),
    ).toEqual(['retryPush', 'sync', 'void']);
  });

  it.each<InvoiceStatus>(['PUSHED', 'PAYMENT_FAILED'])(
    'reads back or voids a %s invoice: Stripe owns it, and the payment is recorded there',
    (status) => {
      expect(actionsOf(stripe(status))).toEqual(['sync', 'void']);
    },
  );

  it('offers neither mark paid nor write off for an invoice Stripe has accepted', () => {
    for (const status of ['PUSHED', 'PAYMENT_FAILED'] as const) {
      const actions = actionsOf(stripe(status));

      expect(actions).not.toContain('markPaid');
      expect(actions).not.toContain('writeOff');
    }
  });

  it('does not push a held draft: it is released or recomposed first', () => {
    expect(
      actionsOf(stripe('DRAFT', { holdReason: 'LEDGER_SEQUENCE_GAP' })),
    ).toEqual(['releaseHold', 'recompose', 'void']);
  });

  it('recomposes a void invoice like any other', () => {
    expect(actionsOf(stripe('VOID'))).toEqual(['recompose']);
  });
});

describe('a recompose the screen can tell would be refused', () => {
  const retentionStart = new Date('2027-01-01T00:00:00.000Z');

  it('is offered disabled once the instance of the invoice was deleted', () => {
    expect(
      getInvoiceActions(invoice('VOID'), { instanceDeleted: true }),
    ).toEqual([
      { action: 'recompose', unavailable: { reason: 'instance-deleted' } },
    ]);
  });

  it('is offered disabled for a void invoice whose usage is no longer kept', () => {
    expect(
      getInvoiceActions(
        invoice('VOID', { serviceFrom: '2026-11-01T00:00:00.000Z' }),
        { retentionStart },
      ),
    ).toEqual([
      {
        action: 'recompose',
        unavailable: { reason: 'purged-usage', retentionStart },
      },
    ]);
  });

  it('is offered as it is for a void invoice whose usage is kept', () => {
    expect(
      getInvoiceActions(invoice('VOID'), { retentionStart }),
    ).toEqual([{ action: 'recompose' }]);
  });

  it('is offered as it is when the retention is not known: the API has the last word', () => {
    expect(
      getInvoiceActions(
        invoice('VOID', { serviceFrom: '2020-01-01T00:00:00.000Z' }),
        { retentionStart: null },
      ),
    ).toEqual([{ action: 'recompose' }]);
  });

  it('is not held back by the retention for a held draft: its usage is spared whatever its age', () => {
    expect(
      getInvoiceActions(
        invoice('DRAFT', {
          holdReason: 'LEDGER_CHAIN_BREAK',
          serviceFrom: '2020-01-01T00:00:00.000Z',
        }),
        { retentionStart },
      ).find(({ action }) => action === 'recompose'),
    ).toEqual({ action: 'recompose' });
  });

  it('says the instance was deleted before it says the usage is gone', () => {
    expect(
      getInvoiceActions(
        invoice('VOID', { serviceFrom: '2020-01-01T00:00:00.000Z' }),
        { instanceDeleted: true, retentionStart },
      ),
    ).toEqual([
      { action: 'recompose', unavailable: { reason: 'instance-deleted' } },
    ]);
  });
});

describe('the scopes of the invoice actions', () => {
  it('are the ones the contract gives the operation of each action', () => {
    const actions = Object.keys(INVOICE_ACTION_SCOPES) as InvoiceAction[];

    expect(actions.sort()).toEqual(
      [
        'markPaid',
        'recompose',
        'releaseHold',
        'retryPush',
        'sync',
        'void',
        'writeOff',
      ].sort(),
    );
    for (const action of actions) {
      const billingAction = INVOICE_ACTION_SCOPES[action];

      expect(getActionScopes(billingAction)).toEqual(
        OPERATION_SCOPES[BILLING_ACTIONS[billingAction]],
      );
      expect(getActionScopes(billingAction)).toContain('write:billing');
    }
  });

  it('asks only for a read scope to read an invoice, its reports and the list', () => {
    for (const action of [
      'invoices.list',
      'invoices.export',
      'invoice.read',
      'invoice.lineReports',
      'handoff.list',
    ] as const) {
      expect(getActionScopes(action), action).toEqual(['read:billing']);
    }
  });

  it('asks for a write scope to acknowledge a handoff', () => {
    expect(getActionScopes('handoff.acknowledge')).toEqual(['write:billing']);
  });
});
