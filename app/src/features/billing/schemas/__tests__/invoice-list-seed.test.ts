import { describe, expect, it } from 'vite-plus/test';
import {
  readInvoiceListSeed,
  toInitialFilterValues,
} from '../invoice-list-seed.schema';

describe('the filters a link opens the list of invoices on', () => {
  it('reads the four a screen that counts invoices leads with', () => {
    expect(
      readInvoiceListSeed({
        handoffStatus: 'PENDING',
        held: true,
        overdue: true,
        status: 'PUSH_FAILED',
      }),
    ).toEqual({
      handoffStatus: 'PENDING',
      held: true,
      overdue: true,
      status: 'PUSH_FAILED',
    });
  });

  it('is none for the bare path', () => {
    expect(toInitialFilterValues(readInvoiceListSeed({}))).toEqual({});
  });

  it('reads the flag as the router parses it, and as text', () => {
    expect(readInvoiceListSeed({ held: true }).held).toBe(true);
    expect(readInvoiceListSeed({ held: 'true' }).held).toBe(true);
  });

  it('drops a flag that is not set, and a value that is not a status, field by field', () => {
    expect(
      readInvoiceListSeed({
        handoffStatus: 'WAITING',
        held: false,
        overdue: 'yes',
        status: 'PUSH_FAILED',
      }),
    ).toEqual({
      handoffStatus: undefined,
      held: undefined,
      overdue: undefined,
      status: 'PUSH_FAILED',
    });
  });

  it('ignores the scope and everything else the URL holds', () => {
    expect(
      readInvoiceListSeed({ customerSlug: 'acme', kind: 'RENEWAL', page: 2 }),
    ).toEqual({
      handoffStatus: undefined,
      held: undefined,
      overdue: undefined,
      status: undefined,
    });
  });

  it('becomes the values of the filters, by the id of each', () => {
    expect(
      toInitialFilterValues(
        readInvoiceListSeed({
          handoffStatus: 'PENDING',
          held: true,
          overdue: true,
          status: 'PUSH_FAILED',
        }),
      ),
    ).toEqual({
      handoff: 'PENDING',
      held: 'true',
      overdue: 'true',
      status: 'PUSH_FAILED',
    });
  });
});
