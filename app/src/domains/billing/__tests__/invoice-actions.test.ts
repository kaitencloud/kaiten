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

  it('only voids an invoice whose push failed', () => {
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
    'offers a %s invoice nothing: it is final, or a payment provider owns it',
    (status) => {
      expect(actionsOf(invoice(status))).toEqual([]);
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
      ['markPaid', 'recompose', 'releaseHold', 'void', 'writeOff'].sort(),
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
