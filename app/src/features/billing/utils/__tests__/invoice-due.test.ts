import { describe, expect, it } from 'vite-plus/test';
import { getInvoiceDue, type InvoiceDueInput } from '../invoice-due';

// Midday UTC, on a day the invoices below fall due around.
const NOW = Date.parse('2027-03-20T12:00:00.000Z');

const invoice = (overrides: Partial<InvoiceDueInput> = {}): InvoiceDueInput => ({
  collectionMethod: 'SEND_INVOICE',
  dueAt: '2027-03-31T00:04:00.000Z',
  issuedAt: '2027-03-17T00:04:00.000Z',
  status: 'MANUAL',
  ...overrides,
});

describe('getInvoiceDue', () => {
  it('says a draft was not issued, held or not, whatever dates it carries', () => {
    expect(getInvoiceDue(invoice({ issuedAt: undefined, status: 'DRAFT' }), NOW)).toEqual({
      kind: 'not-issued',
    });
    expect(
      getInvoiceDue(invoice({ holdReason: 'LEDGER_CHAIN_BREAK', status: 'DRAFT' }), NOW),
    ).toEqual({ kind: 'not-issued' });
  });

  it('says an invoice with no issue date was not issued either', () => {
    expect(getInvoiceDue(invoice({ issuedAt: undefined }), NOW)).toEqual({
      kind: 'not-issued',
    });
  });

  it('counts the days to a due date that is still to come, between UTC days', () => {
    expect(getInvoiceDue(invoice(), NOW)).toEqual({
      days: 11,
      dueAt: '2027-03-31T00:04:00.000Z',
      kind: 'due',
      overdue: false,
    });
  });

  it('is not days away from an invoice due at any hour of today, even one already past', () => {
    expect(
      getInvoiceDue(invoice({ dueAt: '2027-03-20T23:59:00.000Z' }), NOW),
    ).toMatchObject({ days: 0, overdue: false });
    expect(
      getInvoiceDue(invoice({ dueAt: '2027-03-20T00:04:00.000Z' }), NOW),
    ).toMatchObject({ days: 0, overdue: true });
  });

  it('says an unpaid invoice past its due date is overdue, and for how many days', () => {
    expect(
      getInvoiceDue(invoice({ dueAt: '2027-03-10T00:04:00.000Z' }), NOW),
    ).toEqual({
      days: -10,
      dueAt: '2027-03-10T00:04:00.000Z',
      kind: 'due',
      overdue: true,
    });
  });

  it('says an invoice is overdue only when its status does: a card that is charged on its own never is', () => {
    expect(
      getInvoiceDue(
        invoice({
          collectionMethod: 'CHARGE_AUTOMATICALLY',
          dueAt: '2027-03-10T00:04:00.000Z',
        }),
        NOW,
      ),
    ).toMatchObject({ days: -10, overdue: false });
    expect(
      getInvoiceDue(
        invoice({ dueAt: '2027-03-10T00:04:00.000Z', status: 'PAYMENT_FAILED' }),
        NOW,
      ),
    ).toMatchObject({ overdue: false });
  });

  it('has no due date to read for an issued invoice that has none, or one that is not a date', () => {
    expect(getInvoiceDue(invoice({ dueAt: undefined }), NOW)).toEqual({
      kind: 'no-due-date',
    });
    expect(getInvoiceDue(invoice({ dueAt: 'soon' }), NOW)).toEqual({
      kind: 'no-due-date',
    });
  });

  it.each([
    ['PAID' as const, { paidAt: '2027-03-18T10:00:00.000Z' }, 'paid', '2027-03-18T10:00:00.000Z'],
    [
      'UNCOLLECTIBLE' as const,
      { uncollectibleAt: '2027-03-19T09:00:00.000Z' },
      'written-off',
      '2027-03-19T09:00:00.000Z',
    ],
    ['VOID' as const, { voidedAt: '2027-03-12T08:30:00.000Z' }, 'voided', '2027-03-12T08:30:00.000Z'],
  ])(
    'says a %s invoice is no longer due, when it ended and the day it had fallen due',
    (status, dates, ending, at) => {
      expect(getInvoiceDue(invoice({ ...dates, status }), NOW)).toEqual({
        at,
        dueAt: '2027-03-31T00:04:00.000Z',
        ending,
        kind: 'ended',
      });
    },
  );

  it('does not call an invoice that ended overdue, whatever its due date was', () => {
    expect(
      getInvoiceDue(
        invoice({
          dueAt: '2027-03-01T00:04:00.000Z',
          paidAt: '2027-03-18T10:00:00.000Z',
          status: 'PAID',
        }),
        NOW,
      ),
    ).toMatchObject({ kind: 'ended' });
  });

  it('says it ended even where the API did not say when', () => {
    expect(getInvoiceDue(invoice({ status: 'PAID' }), NOW)).toEqual({
      at: undefined,
      dueAt: '2027-03-31T00:04:00.000Z',
      ending: 'paid',
      kind: 'ended',
    });
  });

  it('keeps no due day for an invoice that ended and has none, or one that is not a date', () => {
    expect(
      getInvoiceDue(invoice({ dueAt: undefined, status: 'VOID' }), NOW),
    ).toMatchObject({ dueAt: undefined, kind: 'ended' });
    expect(
      getInvoiceDue(invoice({ dueAt: 'soon', status: 'UNCOLLECTIBLE' }), NOW),
    ).toMatchObject({ dueAt: undefined, kind: 'ended' });
  });
});
