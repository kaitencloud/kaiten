import { describe, expect, it } from 'vite-plus/test';
import {
  readInvoiceListSeed,
  toInitialFilterValues,
} from '../invoice-list-seed.schema';

describe('the filters a link opens the list of invoices on', () => {
  it('reads the two a screen that counts invoices leads with, besides the views', () => {
    expect(
      readInvoiceListSeed({
        handoffStatus: 'NOT_REQUIRED',
        status: 'PUSH_FAILED',
      }),
    ).toEqual({ handoffStatus: 'NOT_REQUIRED', status: 'PUSH_FAILED' });
  });

  it('is none for the bare path', () => {
    expect(toInitialFilterValues(readInvoiceListSeed({}))).toEqual({});
  });

  it('drops a value that is not a status, field by field', () => {
    expect(
      readInvoiceListSeed({ handoffStatus: 'WAITING', status: 'PUSH_FAILED' }),
    ).toEqual({ handoffStatus: undefined, status: 'PUSH_FAILED' });
  });

  it('does not read held and overdue: they are views of the list, not filters it opens on', () => {
    expect(readInvoiceListSeed({ held: true, overdue: 'true' })).toEqual({
      handoffStatus: undefined,
      status: undefined,
    });
  });

  it('ignores the scope and everything else the URL holds', () => {
    expect(
      readInvoiceListSeed({ customerSlug: 'acme', kind: 'RENEWAL', page: 2 }),
    ).toEqual({ handoffStatus: undefined, status: undefined });
  });

  it('becomes the values of the filters, by the id of each', () => {
    expect(
      toInitialFilterValues(
        readInvoiceListSeed({
          handoffStatus: 'PENDING',
          status: 'PUSH_FAILED',
        }),
      ),
    ).toEqual({ handoff: 'PENDING', status: 'PUSH_FAILED' });
  });
});
