import { describe, expect, it } from 'vite-plus/test';
import { invoiceRow } from '@/test-fixtures/billing-test-support';
import { countInvoicesByView, invoicesOfView } from '../invoice-views';

const PAST = '2020-01-01T00:00:00Z';

// One invoice for each view, and one in none: a paid one, which no queue holds.
const invoices = [
  invoiceRow('overdue', 'A', {
    collectionMethod: 'SEND_INVOICE',
    dueAt: PAST,
    status: 'PUSHED',
  }),
  invoiceRow('held', 'B', { holdReason: 'LEDGER_SEQUENCE_GAP' }),
  invoiceRow('waiting', 'C', { handoffStatus: 'PENDING' }),
  invoiceRow('acknowledged', 'D', { handoffStatus: 'ACKNOWLEDGED' }),
  invoiceRow('paid', 'E', { status: 'PAID' }),
];

describe('the views of the list of invoices', () => {
  it('keeps for each view the invoices it names, and every invoice for all', () => {
    expect(invoicesOfView(invoices, 'all')).toHaveLength(5);
    expect(invoicesOfView(invoices, 'overdue').map(({ id }) => id)).toEqual([
      'overdue',
    ]);
    expect(invoicesOfView(invoices, 'held').map(({ id }) => id)).toEqual([
      'held',
    ]);
    expect(invoicesOfView(invoices, 'waiting').map(({ id }) => id)).toEqual([
      'waiting',
    ]);
    expect(
      invoicesOfView(invoices, 'acknowledged').map(({ id }) => id),
    ).toEqual(['acknowledged']);
  });

  it('counts each view from the list alone, a view with none counting 0', () => {
    expect(countInvoicesByView(invoices)).toEqual({
      acknowledged: 1,
      all: 5,
      held: 1,
      overdue: 1,
      waiting: 1,
    });
    expect(countInvoicesByView([])).toEqual({
      acknowledged: 0,
      all: 0,
      held: 0,
      overdue: 0,
      waiting: 0,
    });
  });
});
